/**
 * The `obsidian` mock used to alias `parseYaml` to `js-yaml`, which pulled a
 * dependency into the tree for test code alone. It is a hand written subset now,
 * so it needs tests of its own: every other suite trusts it to behave like the
 * parser that runs inside Obsidian, and a wrong answer here would show up as a
 * front matter bug that does not exist.
 *
 * Scope is deliberate. These are the shapes `front-matter.ts` feeds it - one top
 * level key with its block, and single scalars cut out of a line - plus the
 * failures it has to report rather than guess at.
 */
import { parseYaml } from "obsidian";
import { YamlError } from "./mocks/yaml";

describe("scalars", () => {
	it("reads a plain scalar", () => {
		expect(parseYaml("images/A.jpg")).toBe("images/A.jpg");
	});

	it("keeps spaces inside a plain scalar", () => {
		expect(parseYaml("../images/my photo.jpg")).toBe("../images/my photo.jpg");
	});

	it("keeps a colon that is not followed by a space - a drive letter, a URL", () => {
		expect(parseYaml("C:/images/A.jpg")).toBe("C:/images/A.jpg");
		expect(parseYaml("https://x.example/A.jpg")).toBe("https://x.example/A.jpg");
	});

	it("strips a trailing comment from a plain scalar", () => {
		expect(parseYaml("images/A.jpg # the hero")).toBe("images/A.jpg");
	});

	it("does not treat a '#' inside a word as a comment", () => {
		expect(parseYaml("images/a#b.png")).toBe("images/a#b.png");
	});

	it("unquotes a double quoted scalar and decodes its escapes", () => {
		expect(parseYaml('"../images/x.jpg"')).toBe("../images/x.jpg");
		expect(parseYaml('"a\\"b.png"')).toBe('a"b.png');
		expect(parseYaml('"a\\\\b.png"')).toBe("a\\b.png");
	});

	it("unquotes a single quoted scalar, '' being one quote", () => {
		expect(parseYaml("'../images/x.jpg'")).toBe("../images/x.jpg");
		expect(parseYaml("'it''s.png'")).toBe("it's.png");
	});

	it("reads the core scalar tags", () => {
		expect(parseYaml("true")).toBe(true);
		expect(parseYaml("False")).toBe(false);
		expect(parseYaml("42")).toBe(42);
		expect(parseYaml("-1.5")).toBe(-1.5);
		expect(parseYaml("~")).toBe(null);
		expect(parseYaml("null")).toBe(null);
		expect(parseYaml("")).toBe(null);
	});

	it("reads a date as a Date, so it is never mistaken for a path", () => {
		expect(parseYaml("2026-01-15")).toBeInstanceOf(Date);
		// Only the ISO shape: '2024.01.03' is how a user writes a plain string.
		expect(parseYaml("2024.01.03")).toBe("2024.01.03");
	});
});

describe("block collections", () => {
	it("reads a one key map", () => {
		expect(parseYaml("thumb: images/A.jpg")).toEqual({ thumb: "images/A.jpg" });
	});

	it("reads several keys", () => {
		expect(parseYaml('feature: "images/x.jpg"\nthumb: \'images/y.jpg\'')).toEqual({
			feature: "images/x.jpg",
			thumb: "images/y.jpg",
		});
	});

	it("reads a block sequence under a key", () => {
		expect(parseYaml("gallery:\n  - images/A.jpg\n  - images/B.png")).toEqual({
			gallery: ["images/A.jpg", "images/B.png"],
		});
	});

	it("reads a sequence written at the key's own indent", () => {
		expect(parseYaml("tags:\n- blog\n- notes")).toEqual({ tags: ["blog", "notes"] });
	});

	it("reads a nested map", () => {
		expect(parseYaml("cover:\n  src: images/A.jpg\n  alt: A photo")).toEqual({
			cover: { src: "images/A.jpg", alt: "A photo" },
		});
	});

	it("reads a map inside a sequence item", () => {
		expect(parseYaml("covers:\n  - src: a.png\n    alt: A\n  - src: b.png")).toEqual({
			covers: [{ src: "a.png", alt: "A" }, { src: "b.png" }],
		});
	});

	it("reads a sequence inside a sequence", () => {
		expect(parseYaml("images:\n  - - a.png\n    - b.png")).toEqual({
			images: [["a.png", "b.png"]],
		});
	});

	it("gives a key with nothing under it a null value", () => {
		expect(parseYaml("thumb:")).toEqual({ thumb: null });
	});

	it("ignores blank lines and whole line comments", () => {
		expect(parseYaml("# a note\n\nthumb: images/A.jpg\n")).toEqual({
			thumb: "images/A.jpg",
		});
	});

	it("reads CRLF the same as LF", () => {
		expect(parseYaml("gallery:\r\n  - images/A.jpg\r\n  - images/B.png")).toEqual({
			gallery: ["images/A.jpg", "images/B.png"],
		});
	});
});

describe("flow collections", () => {
	it("reads a flow sequence", () => {
		expect(parseYaml("images: [images/A.jpg, images/B.png]")).toEqual({
			images: ["images/A.jpg", "images/B.png"],
		});
	});

	it("reads a flow map", () => {
		expect(parseYaml("cover: {src: a.png, alt: A photo}")).toEqual({
			cover: { src: "a.png", alt: "A photo" },
		});
	});

	it("does not split on a comma inside a quoted item", () => {
		expect(parseYaml('images: ["a,b.png", c.png]')).toEqual({
			images: ["a,b.png", "c.png"],
		});
	});
});

describe("what it refuses to guess at", () => {
	/** The exact line the front matter suite feeds it - one bad entry, not a bad file. */
	it("throws on an unquoted value that opens another mapping", () => {
		expect(() => { parseYaml("title: Bad: unquoted: colons"); }).toThrow(YamlError);
	});

	it("throws on a block scalar header, an anchor, an alias", () => {
		expect(() => { parseYaml("thumb: >-"); }).toThrow(YamlError);
		expect(() => { parseYaml("thumb: |"); }).toThrow(YamlError);
		expect(() => { parseYaml("thumb: &anchor"); }).toThrow(YamlError);
		expect(() => { parseYaml("thumb: *alias"); }).toThrow(YamlError);
	});

	it("throws on a quoted scalar that never closes", () => {
		expect(() => { parseYaml("thumb: 'images/A.jpg"); }).toThrow(YamlError);
		expect(() => { parseYaml("images: [a.png"); }).toThrow(YamlError);
	});

	it("throws on a tab indent", () => {
		expect(() => { parseYaml("gallery:\n\t- a.png"); }).toThrow(YamlError);
	});

	it("throws on an entry indented deeper than the one before it", () => {
		expect(() => { parseYaml("thumb: a.png\n  alt: A"); }).toThrow(YamlError);
	});
});

/**
 * Regression tests for issue #17 - "URIError causes incomplete export".
 *
 * A note title holding a literal '%' (`[[100% sure]]`) used to be decoded
 * twice: once correctly by `normalizeUrl`, then a second time by
 * `replaceLocalLinks`. The second decode threw `URIError: URI malformed`, which
 * aborted the entire remaining export.
 *
 * @see https://github.com/symunona/obsidian-bulk-exporter/issues/17
 */
import {
	getLinksAndAttachments,
	normalizeUrl,
	safeDecodeURIComponent,
} from "../export/get-links-and-attachments";
import { replaceLocalLinks } from "../export/replace-local-links";
import { findUnsafeCharacters, unsafeCharacterWarning } from "../export/unsafe-characters";
import { BulkExportSettings, DEFAULT_SETTINGS } from "../models/bulk-export-settings";
import { ExportMap, ExportProperties } from "../models/export-properties";
import type BulkExporterPlugin from "../main";

/** Every path `getFirstLinkpathDest` was asked to resolve, in order. */
let lookedUpPaths: Array<string> = [];

/**
 * A vault that contains exactly `vaultFiles`, and remembers what it was asked
 * for - the argument is the whole point of these tests.
 */
function stubPlugin(vaultFiles: Array<string> = []): BulkExporterPlugin {
	return {
		app: {
			metadataCache: {
				// Only `.path` is read off the returned file.
				getFirstLinkpathDest(linkPath: string): { path: string } | null {
					lookedUpPaths.push(linkPath);
					if (vaultFiles.indexOf(linkPath) === -1) { return null }
					return { path: `${linkPath}.md` };
				},
			},
		},
	} as unknown as BulkExporterPlugin;
}

function stubSettings(overrides: Partial<BulkExportSettings> = {}): BulkExportSettings {
	return Object.assign({}, DEFAULT_SETTINGS, {
		preserveWikiLinks: false,
	}, overrides);
}

/** Runs the real link pipeline over one note, exactly as the exporter does. */
function processNote(
	markdown: string,
	plugin: BulkExporterPlugin,
	allFileListMap: ExportMap = {},
	settings: BulkExportSettings = stubSettings()
): ExportProperties {
	const parsed = getLinksAndAttachments(markdown);
	const exportProperties = {
		from: "note.md",
		newFileName: "note.md",
		toRelative: "note.md",
		toRelativeToExportDirRoot: "",
		toAbsoluteFs: "/out/note.md",
		content: markdown,
		outputContent: parsed.markdownReplacedWikiStyleLinks,
		frontMatter: {},
		md5: "",
		lastExportDate: 0,
		linkStats: parsed.internalLinks,
		linksAndAttachments: parsed,
	};
	replaceLocalLinks(
		exportProperties,
		parsed.internalLinks,
		allFileListMap,
		settings,
		plugin
	);
	return exportProperties;
}

/** One entry of the "these files are being exported" map. */
function exported(vaultPath: string, toRelative: string): ExportMap {
	return {
		[vaultPath]: {
			from: vaultPath,
			newFileName: toRelative,
			toRelative,
			toRelativeToExportDirRoot: "",
			toAbsoluteFs: `/out/${toRelative}`,
			content: "",
			outputContent: "",
			frontMatter: {},
			md5: "",
			lastExportDate: 0,
		},
	};
}

// `replaceLocalLinks` narrates every unresolved link to the developer console.
let consoleWarn: jest.SpyInstance;

beforeEach(() => {
	lookedUpPaths = [];
	consoleWarn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
	consoleWarn.mockRestore();
});

describe("safeDecodeURIComponent", () => {
	test("decodes a properly encoded value", () => {
		expect(safeDecodeURIComponent("a%20b")).toBe("a b");
	});

	test("hands back a value with a literal % instead of throwing", () => {
		expect(() => decodeURIComponent("100% sure")).toThrow(URIError);
		expect(safeDecodeURIComponent("100% sure")).toBe("100% sure");
	});

	test("hands back a bare %", () => {
		expect(safeDecodeURIComponent("%")).toBe("%");
	});
});

describe("normalizeUrl", () => {
	test("decodes a wiki link back to the note title", () => {
		expect(normalizeUrl("wikilink://100%25%20sure")).toBe("100% sure");
	});

	test("survives a wiki link that was never encoded", () => {
		expect(normalizeUrl("wikilink://100% sure")).toBe("100% sure");
	});

	test("leaves an obsidian:// url without a 'file=' parameter alone", () => {
		// `indexOf` returns -1 here; the un-guarded `substring(-1 + 5)` used to
		// chop the first four characters off and yield "dian://open?vault=v".
		expect(normalizeUrl("obsidian://open?vault=v")).toBe("obsidian://open?vault=v");
	});

	test("still extracts the file from a full obsidian:// url", () => {
		expect(normalizeUrl("obsidian://open?vault=v&file=my%20note")).toBe("my note");
	});
});

/**
 * An obsidian:// uri is a url with query parameters, and used to be read with
 * `indexOf("file=")` + `substring` instead of being parsed as one.
 */
describe("normalizeUrl on an obsidian:// uri", () => {
	test("stops the file name where the next parameter starts", () => {
		// Was "Some Note&heading=Intro": everything to the end of the string.
		expect(
			normalizeUrl("obsidian://open?vault=MyVault&file=Some%20Note&heading=Intro")
		).toBe("Some Note");
	});

	test("a trailing block reference is not part of the file name", () => {
		expect(normalizeUrl("obsidian://open?file=Some%20Note&block=abc123"))
			.toBe("Some Note");
	});

	test("does not mistake another parameter's name for 'file='", () => {
		// `indexOf` found the "file=" inside "notfile=" and returned "x&file=y".
		expect(normalizeUrl("obsidian://open?notfile=x&file=y")).toBe("y");
	});

	test("percent-decodes the file name", () => {
		expect(normalizeUrl("obsidian://open?vault=v&file=folder%2Fnote%20one.md"))
			.toBe("folder/note one.md");
		expect(normalizeUrl("obsidian://open?file=%C3%A1rv%C3%ADzt%C5%B1r%C5%91"))
			.toBe("árvíztűrő");
	});

	test("keeps a literal % instead of throwing (issue #17)", () => {
		expect(() => normalizeUrl("obsidian://open?vault=v&file=100% sure")).not.toThrow();
		expect(normalizeUrl("obsidian://open?vault=v&file=100% sure")).toBe("100% sure");
		expect(normalizeUrl("obsidian://open?vault=v&file=100%25%20sure")).toBe("100% sure");
	});

	test("keeps a literal + in the file name - a uri is not form data", () => {
		// URLSearchParams would read '+' as a space. Obsidian encodes with
		// encodeURIComponent, which writes a space as %20, so a bare '+' here
		// is a plus in the file name.
		expect(normalizeUrl("obsidian://open?file=C++%20notes")).toBe("C++ notes");
		expect(normalizeUrl("obsidian://open?file=C%2B%2B%20notes")).toBe("C++ notes");
	});

	test("an obsidian:// url with no file parameter at all is left alone", () => {
		expect(normalizeUrl("obsidian://open?vault=v")).toBe("obsidian://open?vault=v");
		expect(normalizeUrl("obsidian://")).toBe("obsidian://");
		expect(normalizeUrl("obsidian://search?query=cats")).toBe("obsidian://search?query=cats");
	});

	test("malformed input comes back untouched instead of throwing", () => {
		const broken = "obsidian:// not a url ?file=x";
		expect(() => new URL(broken)).toThrow(/Invalid URL/);
		expect(() => normalizeUrl(broken)).not.toThrow();
		expect(normalizeUrl(broken)).toBe(broken);
	});

	test("the whole pipeline looks the note up under its bare title", () => {
		const plugin = stubPlugin();
		processNote(
			"See [that](obsidian://open?vault=MyVault&file=Some%20Note&heading=Intro).",
			plugin
		);
		expect(lookedUpPaths).toEqual(["Some Note"]);
	});
});

describe("a wiki link with a literal % (issue #17)", () => {
	test("parses to the plain note title", () => {
		const { internalLinks } = getLinksAndAttachments("Progress is [[100% sure]] today.");
		expect(internalLinks.length).toBe(1);
		expect(internalLinks[0].normalizedOriginalPath).toBe("100% sure");
	});

	test("does not throw, and is looked up under its real title", () => {
		expect(() => processNote("Progress is [[100% sure]] today.", stubPlugin()))
			.not.toThrow();
		expect(lookedUpPaths).toEqual(["100% sure"]);
	});

	test("resolves to the exported file and gets rewritten", () => {
		const result = processNote(
			"Progress is [[100% sure]] today.",
			stubPlugin(["100% sure"]),
			exported("100% sure.md", "blog/100-sure.md")
		);
		expect(result.outputContent).toBe("Progress is [100% sure](blog/100-sure) today.");
		expect(result.linkStats?.[0].error).toBeUndefined();
	});

	test("a bare [[%]] is handled too", () => {
		expect(() => processNote("[[%]]", stubPlugin())).not.toThrow();
		expect(lookedUpPaths).toEqual(["%"]);
	});

	test("neighbouring links in the same note are still processed", () => {
		processNote("[[100% sure]] and [[other note]]", stubPlugin());
		expect(lookedUpPaths).toEqual(["100% sure", "other note"]);
	});
});

describe("a wiki link that only looks encoded", () => {
	test("[[a %20 b]] is not silently decoded into 'a   b'", () => {
		// This one never threw - it quietly resolved the wrong note, or none.
		const { internalLinks } = getLinksAndAttachments("[[a %20 b]]");
		expect(internalLinks[0].normalizedOriginalPath).toBe("a %20 b");

		processNote("[[a %20 b]]", stubPlugin());
		expect(lookedUpPaths).toEqual(["a %20 b"]);
	});

	test("[[C%3A path]] keeps its literal percent escape", () => {
		processNote("[[C%3A path]]", stubPlugin());
		expect(lookedUpPaths).toEqual(["C%3A path"]);
	});
});

describe("a failing link is blamed on that link", () => {
	test("the link carries the error, and it still bubbles up to the file", () => {
		const boom = new Error("vault exploded");
		const plugin = {
			app: {
				metadataCache: {
					getFirstLinkpathDest() { throw boom },
				},
			},
		} as unknown as BulkExporterPlugin;

		const parsed = getLinksAndAttachments("[[some note]]");
		expect(() => replaceLocalLinks(
			{
				from: "note.md",
				newFileName: "note.md",
				toRelative: "note.md",
				toRelativeToExportDirRoot: "",
				toAbsoluteFs: "/out/note.md",
				content: "[[some note]]",
				outputContent: parsed.markdownReplacedWikiStyleLinks,
				frontMatter: {},
				md5: "",
				lastExportDate: 0,
			},
			parsed.internalLinks,
			{},
			stubSettings(),
			plugin
		)).toThrow(boom);

		expect(parsed.internalLinks[0].status).toBe("error");
		expect(parsed.internalLinks[0].error).toContain("vault exploded");
	});
});

describe("unsafe character advice", () => {
	test("flags the characters that are not portable", () => {
		expect(findUnsafeCharacters("100% sure")).toEqual(["%"]);
		expect(findUnsafeCharacters("a#b?c")).toEqual(["#", "?"]);
		expect(findUnsafeCharacters("a%b%c")).toEqual(["%"]);
		expect(findUnsafeCharacters('why: "this" <or> that|x*y\\z')).toEqual(
			[":", '"', "<", ">", "|", "*", "\\"]
		);
	});

	test("reports control characters readably", () => {
		const withBell = "a" + String.fromCharCode(7) + "b";
		expect(findUnsafeCharacters(withBell)).toEqual(["\\u0007"]);
	});

	test("leaves ordinary names, folders and accents alone", () => {
		expect(findUnsafeCharacters("posts/árvíztűrő note.md")).toEqual([]);
		expect(unsafeCharacterWarning("posts/plain note.md")).toBeNull();
	});

	test("the warning names the file and the character", () => {
		const message = unsafeCharacterWarning("posts/100% sure.md");
		expect(message).toContain("posts/100% sure.md");
		expect(message).toContain("'%'");
	});
});

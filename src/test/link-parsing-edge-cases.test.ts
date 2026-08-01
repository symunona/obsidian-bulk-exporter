/**
 * The sharp edges of the link parsing / replacement layer, one describe per bug.
 *
 * Every one of these has the same shape underneath: the pipeline does string
 * surgery on a representation that has ALREADY been transformed, and then can no
 * longer find its own needle in the document.
 *
 * - a wiki link shown as an EXAMPLE, inside a fence or backticks, was rewritten
 *   like any other, and markdown-it then rightly refused to linkify code - so no
 *   pass ever visited it and the raw `wikilink://` was written to disk;
 * - `getTypeofUrl` matched the PREFIX "http", so a note called
 *   `http-server-setup` was classed external and never resolved;
 * - `normalizeSpacesInLinks` percent-encoded the target before the output syntax
 *   was chosen, so the encoded copy was compared against the title AND embedded
 *   inside `[[...]]`, where percent escapes mean nothing;
 * - `encodeURIComponent` leaves '(' and ')' alone, and they are exactly what
 *   delimits a markdown link destination;
 * - a link label was read as `tokens[i + 1]`, so anything but one plain run of
 *   text was lost or truncated;
 * - front matter was wiki-link converted before it was read as YAML;
 * - `[[note#header]]` was handed to the vault as a FILE NAME.
 *
 * @see docs/link-pipeline.md
 * @see https://github.com/symunona/obsidian-bulk-exporter/issues/14
 */
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "fs";
import { load } from "js-yaml";
import { tmpdir } from "os";
import { basename, dirname, join } from "path";
import {
	getLinksAndAttachments,
	normalizeUrl,
	replaceDoubleBracketLinks,
} from "../export/get-links-and-attachments";
import {
	collectAndReplaceHeaderAttachments,
	collectAndReplaceInlineAttachments,
} from "../export/get-markdown-attachments";
import { replaceLocalLinks, splitAnchor } from "../export/replace-local-links";
import { BulkExportSettings, DEFAULT_SETTINGS } from "../models/bulk-export-settings";
import { ExportMap, ExportProperties } from "../models/export-properties";
import type BulkExporterPlugin from "../main";

/** Every path `getFirstLinkpathDest` was asked to resolve, in order. */
let lookedUpPaths: Array<string> = [];

function stubPlugin(vaultFiles: Array<string> = []): BulkExporterPlugin {
	return {
		app: {
			metadataCache: {
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

let consoleWarn: jest.SpyInstance;

beforeEach(() => {
	lookedUpPaths = [];
	consoleWarn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
	consoleWarn.mockRestore();
});

// --------------------------------------------------------------------------
// A - a wiki link inside code is an example, not a link
// --------------------------------------------------------------------------

describe("a wiki link inside code is left alone", () => {
	test("inside a fenced block", () => {
		const note = "Write it like this:\n\n```\n[[Some Note]]\n```\n";
		expect(replaceDoubleBracketLinks(note)).toBe(note);
	});

	test("inside a tilde fence", () => {
		expect(replaceDoubleBracketLinks("~~~\n[[Some Note]]\n~~~\n"))
			.toBe("~~~\n[[Some Note]]\n~~~\n");
	});

	test("inside an indented code block", () => {
		expect(replaceDoubleBracketLinks("A sample:\n\n    [[Some Note]]\n"))
			.toBe("A sample:\n\n    [[Some Note]]\n");
	});

	test("inside an inline code span", () => {
		expect(replaceDoubleBracketLinks("Use `[[Some Note]]` here."))
			.toBe("Use `[[Some Note]]` here.");
	});

	test("no wikilink:// url ever reaches the exported file", () => {
		const result = processNote(
			"```\n[[Some Note]]\n```\n",
			stubPlugin(["Some Note"]),
			exported("Some Note.md", "out/some-note.md")
		);
		expect(result.outputContent).not.toContain("wikilink://");
		expect(result.outputContent).toBe("```\n[[Some Note]]\n```\n");
	});

	test("the same link in prose next to it IS still rewritten", () => {
		expect(replaceDoubleBracketLinks("```\n[[A]]\n```\n\n[[A]] in prose\n"))
			.toBe("```\n[[A]]\n```\n\n[A](wikilink://A) in prose\n");
	});

	test("a lazily indented continuation line is prose, not code", () => {
		// The tab here continues the paragraph above it - markdown-it knows that,
		// a naive "four spaces means code" scan would not.
		expect(replaceDoubleBracketLinks("x\n![y](a.png)\n\t![[18.png]]\n"))
			.toBe("x\n![y](a.png)\n\t![18.png](wikilink://18.png)\n");
	});
});

// --------------------------------------------------------------------------
// B - "http" is a scheme, not a prefix
// --------------------------------------------------------------------------

describe("a note whose name merely starts with 'http'", () => {
	test("[[http-server-setup]] is an internal link", () => {
		const parsed = getLinksAndAttachments("[[http-server-setup]]");
		expect(parsed.externalLinks.length).toBe(0);
		expect(parsed.internalLinks.length).toBe(1);
	});

	test("[[httpd config]] is an internal link", () => {
		const parsed = getLinksAndAttachments("[[httpd config]]");
		expect(parsed.externalLinks.length).toBe(0);
		expect(parsed.internalLinks.length).toBe(1);
	});

	test("it resolves, and no wikilink:// url survives", () => {
		const result = processNote(
			"[[http-server-setup]]",
			stubPlugin(["http-server-setup"]),
			exported("http-server-setup.md", "out/http-server-setup.md")
		);
		expect(lookedUpPaths).toEqual(["http-server-setup"]);
		expect(result.outputContent).toBe("[http-server-setup](out/http-server-setup)");
	});

	test("a real http(s) url is still external", () => {
		expect(getLinksAndAttachments("[x](https://xkcd.com/1479/)").externalLinks.length).toBe(1);
		expect(getLinksAndAttachments("[x](http://xkcd.com/1479/)").externalLinks.length).toBe(1);
		expect(getLinksAndAttachments("[x](HTTPS://XKCD.COM/)").externalLinks.length).toBe(1);
	});
});

// --------------------------------------------------------------------------
// C - percent-encoding belongs to the [](...) form only
// --------------------------------------------------------------------------

describe("normalizeSpacesInLinks does not leak into a wiki link", () => {
	const spacey = stubSettings({
		preserveWikiLinks: true,
		normalizeSpacesInLinks: true,
	});

	test("[[My Note]] keeps a resolvable target inside the brackets", () => {
		const result = processNote(
			"[[My Note]]",
			stubPlugin(["My Note"]),
			exported("My Note.md", "out/My Note.md"),
			spacey
		);
		expect(result.outputContent).toBe("[[out/My Note|My Note]]");
	});

	test("an unchanged target is still recognised as unchanged", () => {
		// `title === newLink` used to compare the title against an ENCODED copy of
		// itself, so a bare wiki link came out aliased to itself.
		const result = processNote(
			"[[My Note]]",
			stubPlugin(["My Note"]),
			exported("My Note.md", "My Note.md"),
			spacey
		);
		expect(result.outputContent).toBe("[[My Note]]");
	});

	test("the [](...) form is still percent-encoded", () => {
		const result = processNote(
			"[[My Note]]",
			stubPlugin(["My Note"]),
			exported("My Note.md", "out/My Note.md"),
			stubSettings({ normalizeSpacesInLinks: true })
		);
		expect(result.outputContent).toBe("[My Note](out/My%20Note)");
	});
});

// --------------------------------------------------------------------------
// D - parentheses delimit a markdown link destination
// --------------------------------------------------------------------------

describe("a note name with a parenthesis in it", () => {
	test("[[foo (bar]] still produces a link", () => {
		const parsed = getLinksAndAttachments("see [[foo (bar]] here");
		expect(parsed.internalLinks.length).toBe(1);
		expect(parsed.internalLinks[0].normalizedOriginalPath).toBe("foo (bar");
	});

	test("[[foo (bar]] leaves no wikilink:// url behind", () => {
		const result = processNote(
			"see [[foo (bar]] here",
			stubPlugin(["foo (bar"]),
			exported("foo (bar.md", "out/foo (bar.md")
		);
		expect(result.outputContent).not.toContain("wikilink://");
	});

	test("[[foo)bar]] keeps the whole name, not the part before the ')'", () => {
		const parsed = getLinksAndAttachments("see [[foo)bar]] here");
		expect(parsed.internalLinks.length).toBe(1);
		expect(parsed.internalLinks[0].text).toBe("foo)bar");
		expect(parsed.internalLinks[0].normalizedOriginalPath).toBe("foo)bar");
	});

	test("[[foo)bar]] does not corrupt the surrounding text", () => {
		// The truncated href made the write-back needle a PREFIX of the real link
		// text, and the replacement was spliced into the middle of it:
		// "see foo)barbar) here".
		const result = processNote(
			"see [[foo)bar]] here",
			stubPlugin(["foo)bar"]),
			exported("foo)bar.md", "out/foo)bar.md")
		);
		expect(result.outputContent).not.toContain("foo)barbar)");
		expect(result.outputContent.startsWith("see ")).toBe(true);
		expect(result.outputContent.endsWith(" here")).toBe(true);
	});

	test("the encoded target still decodes back to the name", () => {
		expect(normalizeUrl("wikilink://foo%20%28bar%29")).toBe("foo (bar)");
	});
});

// --------------------------------------------------------------------------
// E - a link label is not always one plain text token
// --------------------------------------------------------------------------

describe("a link label with formatting in it", () => {
	test("[[note|*fancy*]] is classified", () => {
		const parsed = getLinksAndAttachments("[[note|*fancy*]]");
		expect(parsed.internalLinks.length).toBe(1);
		expect(parsed.internalLinks[0].text).toBe("*fancy*");
		expect(parsed.internalLinks[0].normalizedOriginalPath).toBe("note");
	});

	test("[[note|*fancy*]] is rewritten, not left as wikilink://", () => {
		const result = processNote(
			"[[note|*fancy*]]",
			stubPlugin(["note"]),
			exported("note.md", "out/note.md")
		);
		expect(result.outputContent).toBe("[*fancy*](out/note)");
	});

	test("a markdown link keeps its whole label, not just the first word", () => {
		const parsed = getLinksAndAttachments("[my *cool* post](other.md)");
		expect(parsed.internalLinks.length).toBe(1);
		expect(parsed.internalLinks[0].text).toBe("my *cool* post");
	});

	test("bold, strikethrough and inline code labels survive too", () => {
		expect(getLinksAndAttachments("[a **bold** one](x.md)").internalLinks[0].text)
			.toBe("a **bold** one");
		expect(getLinksAndAttachments("[a ~~struck~~ one](x.md)").internalLinks[0].text)
			.toBe("a ~~struck~~ one");
		expect(getLinksAndAttachments("[the `code` one](x.md)").internalLinks[0].text)
			.toBe("the `code` one");
	});

	test("an attachment with a formatted label is an attachment", () => {
		const parsed = getLinksAndAttachments("See [a **bold** shot](pics/a.png) here");
		expect(parsed.attachments.length).toBe(1);
		expect(parsed.attachments[0].text).toBe("a **bold** shot");
	});

	test("the formatted label is what gets replaced in the document", () => {
		const result = processNote(
			"See [my *cool* post](other.md) now.",
			stubPlugin(["other.md"]),
			exported("other.md.md", "out/other.md")
		);
		expect(result.outputContent).toBe("See [my *cool* post](out/other) now.");
	});
});

// --------------------------------------------------------------------------
// G - `[[note#header]]` is a file AND a place inside it
// --------------------------------------------------------------------------

describe("splitAnchor", () => {
	test("a plain name has no anchor", () => {
		expect(splitAnchor("note")).toEqual({ path: "note", anchor: "" });
	});

	test("the first '#' starts the anchor", () => {
		expect(splitAnchor("note#h1#h2")).toEqual({ path: "note", anchor: "#h1#h2" });
	});

	test("a leading '#' leaves no path at all", () => {
		expect(splitAnchor("#header")).toEqual({ path: "", anchor: "#header" });
	});
});

describe("a wiki link with a header anchor (issue #14)", () => {
	test("the vault is asked for the file, not for 'note#header1'", () => {
		const result = processNote(
			"See [[note#header1]] now.",
			stubPlugin(["note"]),
			exported("note.md", "out/note.md")
		);
		expect(lookedUpPaths).toEqual(["note"]);
		expect(result.outputContent).toBe("See [note#header1](out/note#header1) now.");
	});

	test("an aliased anchor link keeps both the alias and the anchor", () => {
		const result = processNote(
			"See [[note#h|Alias]] now.",
			stubPlugin(["note"]),
			exported("note.md", "out/note.md")
		);
		expect(lookedUpPaths).toEqual(["note"]);
		expect(result.outputContent).toBe("See [Alias](out/note#h) now.");
	});

	test("a block reference is an anchor too", () => {
		const result = processNote(
			"See [[note#^abc123]] now.",
			stubPlugin(["note"]),
			exported("note.md", "out/note.md")
		);
		expect(lookedUpPaths).toEqual(["note"]);
		expect(result.outputContent).toBe("See [note#^abc123](out/note#^abc123) now.");
	});

	test("an ordinary markdown link carries its fragment across", () => {
		const result = processNote(
			"See [docs](notes/file.md#section) now.",
			stubPlugin(["notes/file.md"]),
			exported("notes/file.md.md", "out/file.md")
		);
		expect(lookedUpPaths).toEqual(["notes/file.md"]);
		expect(result.outputContent).toBe("See [docs](out/file#section) now.");
	});

	test("the wiki link form keeps the anchor inside the brackets", () => {
		const result = processNote(
			"See [[note#header1]] now.",
			stubPlugin(["note"]),
			exported("note.md", "out/note.md"),
			stubSettings({ preserveWikiLinks: true })
		);
		expect(result.outputContent).toBe("See [[out/note#header1|note#header1]] now.");
	});

	test("keepWikiLinksAsIs points at the original target, anchor included", () => {
		const result = processNote(
			"See [[note#header1]] now.",
			stubPlugin(["note"]),
			exported("note.md", "out/note.md"),
			stubSettings({ preserveWikiLinks: true, keepWikiLinksAsIs: true })
		);
		expect(result.outputContent).toBe("See [[note#header1]] now.");
	});

	test("normalizeSpacesInLinks encodes the path but never the anchor", () => {
		const result = processNote(
			"See [[My Note#My Heading]] now.",
			stubPlugin(["My Note"]),
			exported("My Note.md", "out/My Note.md"),
			stubSettings({ normalizeSpacesInLinks: true })
		);
		expect(result.outputContent)
			.toBe("See [My Note#My Heading](out/My%20Note#My Heading) now.");
	});

	test("a file that really is missing still reports itself by name", () => {
		processNote("See [[nope#header]] now.", stubPlugin());
		expect(lookedUpPaths).toEqual(["nope"]);
	});
});

describe("an anchor with no file part points inside this note", () => {
	test("[[#header]] is never looked up in the vault", () => {
		const result = processNote("Jump to [[#header]].", stubPlugin());
		expect(lookedUpPaths).toEqual([]);
		expect(result.outputContent).toBe("Jump to [#header](#header).");
	});

	test("[[#header]] survives as a wiki link when they are preserved", () => {
		const result = processNote(
			"Jump to [[#header]].",
			stubPlugin(),
			{},
			stubSettings({ preserveWikiLinks: true })
		);
		expect(lookedUpPaths).toEqual([]);
		expect(result.outputContent).toBe("Jump to [[#header]].");
	});

	test("[[#header|Alias]] keeps its alias", () => {
		const result = processNote("Jump to [[#header|Alias]].", stubPlugin());
		expect(lookedUpPaths).toEqual([]);
		expect(result.outputContent).toBe("Jump to [Alias](#header).");
	});

	test("it is not reported as a link that could not be found", () => {
		// It used to be looked up as a file called "#header", never found, and
		// stripped to bare text with a warning - `keepLinksNotFound` is off by
		// default.
		const result = processNote(
			"Jump to [[#header]].",
			stubPlugin(),
			{},
			stubSettings({ keepLinksNotFound: false })
		);
		expect(result.linkStats?.[0].error).toBeUndefined();
		expect(result.outputContent).toContain("(#header)");
	});
});

// --------------------------------------------------------------------------
// F - front matter is YAML, not markdown
// --------------------------------------------------------------------------

describe("a front matter value written as a wiki link", () => {
	const banner = '---\nbanner: "[[my-banner.png]]"\n---\nBody text.\n';

	test("the front matter is not wiki-link converted", () => {
		expect(getLinksAndAttachments(banner).markdownReplacedWikiStyleLinks).toBe(banner);
	});

	test("it is a HEADER attachment, under its key", () => {
		const found = getLinksAndAttachments(banner).internalHeaderAttachments;
		expect(found.length).toBe(1);
		expect(found[0].text).toBe("banner");
		// The needle the front matter write-back searches for is the value as the
		// document spells it - brackets and all.
		expect(found[0].originalPath).toBe("[[my-banner.png]]");
		// What the vault is asked for is the path it points at.
		expect(found[0].normalizedOriginalPath).toBe("my-banner.png");
	});

	test("it is NOT also an inline body attachment", () => {
		expect(getLinksAndAttachments(banner).internalAttachments.length).toBe(0);
	});

	test("the embed and alias spellings work too", () => {
		const embed = getLinksAndAttachments(
			'---\nbanner: "![[my-banner.png]]"\n---\nB\n').internalHeaderAttachments;
		expect(embed.length).toBe(1);
		expect(embed[0].normalizedOriginalPath).toBe("my-banner.png");

		const alias = getLinksAndAttachments(
			'---\nbanner: "[[my-banner.png|The banner]]"\n---\nB\n').internalHeaderAttachments;
		expect(alias.length).toBe(1);
		expect(alias[0].normalizedOriginalPath).toBe("my-banner.png");
	});

	test("a wiki link in the BODY is still converted", () => {
		const parsed = getLinksAndAttachments(
			'---\nbanner: "[[my-banner.png]]"\n---\nBody [[note]].\n');
		expect(parsed.internalLinks.length).toBe(1);
		expect(parsed.internalLinks[0].normalizedOriginalPath).toBe("note");
		expect(parsed.markdownReplacedWikiStyleLinks)
			.toContain('banner: "[[my-banner.png]]"');
	});
});

describe("exporting a note with a wiki-link banner", () => {
	let vaultFolder = "";
	let outputFolder = "";
	let vaultFiles: Array<string> = [];

	function createVaultFile(relativePath: string) {
		const absolute = join(vaultFolder, relativePath);
		mkdirSync(dirname(absolute), { recursive: true });
		writeFileSync(absolute, "pretend this is a png");
		vaultFiles.push(relativePath);
	}

	function attachmentPlugin(): BulkExporterPlugin {
		return {
			app: {
				metadataCache: {
					getFirstLinkpathDest(linkPath: string): { path: string } | null {
						const wanted = linkPath.replace(/^(\.{1,2}\/)+/, "").toLowerCase();
						const found = vaultFiles.find(
							(path) => path.toLowerCase() === wanted ||
								basename(path).toLowerCase() === basename(wanted));
						return found ? { path: found } : null;
					},
				},
				vault: { adapter: { basePath: vaultFolder } },
			},
		} as unknown as BulkExporterPlugin;
	}

	async function exportNote(markdown: string): Promise<ExportProperties> {
		const settings = Object.assign({}, DEFAULT_SETTINGS, {
			outputFolder,
			assetPath: "assets",
		});
		const parsed = getLinksAndAttachments(markdown);
		const exportProperties: ExportProperties = {
			from: "note.md",
			newFileName: "note.md",
			toRelative: "note.md",
			toRelativeToExportDirRoot: "",
			toAbsoluteFs: join(outputFolder, "note.md"),
			content: markdown,
			outputContent: parsed.markdownReplacedWikiStyleLinks,
			frontMatter: {},
			md5: "",
			lastExportDate: 0,
			linksAndAttachments: parsed,
		};
		const plugin = attachmentPlugin();
		await collectAndReplaceHeaderAttachments(
			plugin, settings, exportProperties, parsed.internalHeaderAttachments);
		await collectAndReplaceInlineAttachments(
			plugin, settings, exportProperties, parsed.internalAttachments);
		return exportProperties;
	}

	beforeEach(() => {
		vaultFolder = mkdtempSync(join(tmpdir(), "bulk-exporter-vault-"));
		outputFolder = mkdtempSync(join(tmpdir(), "bulk-exporter-out-"));
		vaultFiles = [];
	});

	afterEach(() => {
		rmSync(vaultFolder, { recursive: true, force: true });
		rmSync(outputFolder, { recursive: true, force: true });
	});

	test("the asset is copied and the YAML value points at the copy", async () => {
		createVaultFile("images/my-banner.png");

		const result = await exportNote(
			'---\nbanner: "[[my-banner.png]]"\n---\nBody text.\n');
		const match = result.outputContent.match(/^---\n([\s\S]*?)\n---\n/);
		if (!match) { throw new Error("The export lost the front matter entirely.") }
		const frontMatter = load(match[1]) as Record<string, unknown>;

		expect(String(frontMatter.banner))
			.toMatch(/^assets\/my-banner-[0-9a-f]{32}\.png$/);
		// Not a markdown link, and no leftover brackets.
		expect(result.outputContent).not.toContain("wikilink://");
		expect(result.outputContent).not.toContain("[[");
		expect(readdirSync(join(outputFolder, "assets")).length).toBe(1);
	});
});

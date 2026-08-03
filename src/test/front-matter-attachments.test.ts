/**
 * Regression tests for issue #19 - "Frontmatter image paths (thumb/feature) are
 * not transformed when filename is long".
 *
 * The title blames the length of the file name. It is not the length: it is the
 * CASE. The front matter extractor matched the image against a `toLocaleLowerCase()`
 * copy of the value and then stored a slice OF THAT LOWERCASED COPY as the
 * "original path". The write-back then looked for that lowercased text in the real
 * document, found nothing, and silently changed nothing. The reporter's rename
 * happened to change both the length and the case at once.
 *
 * The same hand-rolled matcher also ate the opening YAML quote, stopped at the
 * first space, and used an unescaped `.` before the extension list - so
 * `My Document` parsed as an attachment named "my doc".
 *
 * @see https://github.com/symunona/obsidian-bulk-exporter/issues/19
 */
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "fs";
import { parseYaml } from "obsidian";
import { tmpdir } from "os";
import { basename, dirname, join } from "path";
import { getLinksAndAttachments } from "../export/get-links-and-attachments";
import {
	collectAndReplaceHeaderAttachments,
	collectAndReplaceInlineAttachments,
} from "../export/get-markdown-attachments";
import { BulkExportSettings, DEFAULT_SETTINGS } from "../models/bulk-export-settings";
import { ExportProperties } from "../models/export-properties";
import type BulkExporterPlugin from "../main";

/** The exact line from the issue report. */
const REPORTED_LINE =
	'thumb: "../images/2026-01-15-freecad-1/IMG-20260115051638714-1.jpg"';
const REPORTED_PATH = "../images/2026-01-15-freecad-1/IMG-20260115051638714-1.jpg";

let vaultFolder = "";
let outputFolder = "";
let vaultFiles: Array<string> = [];

/** Wraps front matter lines into a note. */
function note(frontMatter: string, body = "Just some body text.\n"): string {
	return `---\n${frontMatter}\n---\n${body}`;
}

function headerAttachments(markdown: string) {
	return getLinksAndAttachments(markdown).internalHeaderAttachments;
}

/** Creates a real file in the temp vault, so `copyFileSync` has something to copy. */
function createVaultFile(relativePath: string) {
	const absolute = join(vaultFolder, relativePath);
	mkdirSync(dirname(absolute), { recursive: true });
	writeFileSync(absolute, "pretend this is a jpeg");
	vaultFiles.push(relativePath);
}

/**
 * Obsidian resolves a link case-insensitively and hands back the real file -
 * with the real spelling of its path. That difference is the whole point of the
 * duplicate-copy test below.
 */
function resolveLinkPath(linkPath: string): { path: string } | null {
	const wanted = linkPath.replace(/^(\.{1,2}\/)+/, "").toLowerCase();
	const found = vaultFiles.find(
		(path) =>
			path.toLowerCase() === wanted ||
			basename(path).toLowerCase() === basename(wanted)
	);
	return found ? { path: found } : null;
}

function stubPlugin(): BulkExporterPlugin {
	return {
		app: {
			metadataCache: {
				getFirstLinkpathDest: (linkPath: string) => resolveLinkPath(linkPath),
			},
			// A desktop vault: the exporter copies straight from the file system.
			vault: { adapter: { basePath: vaultFolder } },
		},
	} as unknown as BulkExporterPlugin;
}

/**
 * Runs the real front-matter half of the export over one note.
 *
 * Awaited: the collectors save the attachment and only then rewrite the link that
 * points at it, so their promise IS the "this note is finished" signal.
 */
async function exportNote(
	markdown: string,
	overrides: Partial<BulkExportSettings> = {}
): Promise<ExportProperties> {
	const settings = Object.assign({}, DEFAULT_SETTINGS, {
		outputFolder,
		assetPath: "assets",
	}, overrides);
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
	const plugin = stubPlugin();
	await collectAndReplaceHeaderAttachments(
		plugin,
		settings,
		exportProperties,
		parsed.internalHeaderAttachments
	);
	await collectAndReplaceInlineAttachments(
		plugin,
		settings,
		exportProperties,
		parsed.internalAttachments
	);
	return exportProperties;
}

/** The front matter of an exported note, as YAML understands it. */
function exportedFrontMatter(
	exportProperties: ExportProperties
): Record<string, unknown> {
	const match = exportProperties.outputContent.match(/^---\n([\s\S]*?)\n---\n/);
	if (!match) { throw new Error("The export lost the front matter entirely.") }
	return parseYaml(match[1]) as Record<string, unknown>;
}

function exportedAssets(): Array<string> {
	const assetFolder = join(outputFolder, "assets");
	try {
		return readdirSync(assetFolder).sort();
	} catch {
		return [];
	}
}

// Unparseable front matter entries are narrated to the developer console.
let consoleWarn: jest.SpyInstance;

beforeEach(() => {
	vaultFolder = mkdtempSync(join(tmpdir(), "bulk-exporter-vault-"));
	outputFolder = mkdtempSync(join(tmpdir(), "bulk-exporter-out-"));
	vaultFiles = [];
	consoleWarn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
	consoleWarn.mockRestore();
	rmSync(vaultFolder, { recursive: true, force: true });
	rmSync(outputFolder, { recursive: true, force: true });
});

describe("a front matter image path is read verbatim (issue #19)", () => {
	test("an UPPERCASE file name keeps its case", () => {
		const found = headerAttachments(note("thumb: images/A.jpg"));
		expect(found.length).toBe(1);
		expect(found[0].originalPath).toBe("images/A.jpg");
		expect(found[0].text).toBe("thumb");
	});

	test("the exact line from the issue report", () => {
		const found = headerAttachments(note(REPORTED_LINE));
		expect(found.length).toBe(1);
		expect(found[0].originalPath).toBe(REPORTED_PATH);
	});

	test("a double quoted value does not keep its quote", () => {
		const found = headerAttachments(note('feature: "../images/x.jpg"'));
		expect(found.length).toBe(1);
		expect(found[0].originalPath).toBe("../images/x.jpg");
	});

	test("a single quoted value does not keep its quote", () => {
		const found = headerAttachments(note("feature: '../images/x.jpg'"));
		expect(found.length).toBe(1);
		expect(found[0].originalPath).toBe("../images/x.jpg");
	});

	test("a path containing spaces is not truncated at the space", () => {
		const found = headerAttachments(note("thumb: ../images/my photo.jpg"));
		expect(found.length).toBe(1);
		expect(found[0].originalPath).toBe("../images/my photo.jpg");
	});

	test("a windows style path survives its colon", () => {
		const found = headerAttachments(note("thumb: C:/images/A.jpg"));
		expect(found.length).toBe(1);
		expect(found[0].originalPath).toBe("C:/images/A.jpg");
	});

	test("every image of a list valued key is found", () => {
		const found = headerAttachments(
			note("gallery:\n  - images/A.jpg\n  - images/B.png\n  - not an image")
		);
		expect(found.map((attachment) => attachment.originalPath))
			.toEqual(["images/A.jpg", "images/B.png"]);
		expect(found.map((attachment) => attachment.text)).toEqual(["gallery", "gallery"]);
	});

	test("an image under a nested key is found, named after the top level key", () => {
		const found = headerAttachments(note("cover:\n  src: images/A.jpg\n  alt: A photo"));
		expect(found.length).toBe(1);
		expect(found[0].originalPath).toBe("images/A.jpg");
		expect(found[0].text).toBe("cover");
	});

	test("a windows note with CRLF line endings", () => {
		const found = getLinksAndAttachments(
			"---\r\nthumb: images/A.jpg\r\n---\r\nBody.\r\n"
		).internalHeaderAttachments;
		expect(found.length).toBe(1);
		expect(found[0].originalPath).toBe("images/A.jpg");
	});

	test("an external image is not counted as a local one", () => {
		const parsed = getLinksAndAttachments(note("thumb: https://x.example/A.jpg"));
		expect(parsed.internalHeaderAttachments.length).toBe(0);
		expect(parsed.externalHeaderAttachments.length).toBe(1);
	});
});

describe("what is NOT a front matter attachment", () => {
	test("a word merely ending in an extension name", () => {
		expect(headerAttachments(note("thumb: notanimagexxxjpg")).length).toBe(0);
	});

	test("an ordinary title with the word 'Document' in it", () => {
		// `([^\s]*).(doc|...)` used to match "my doc" here - the unescaped `.`
		// happily consumed the space.
		expect(headerAttachments(note("title: My Document")).length).toBe(0);
	});

	test("a note with no front matter at all", () => {
		// The old splitter took everything before the first '\n---\n' as front
		// matter, so a plain note with a colon in it was parsed as YAML.
		expect(headerAttachments("Look at this: photo.png in my note.\n").length).toBe(0);
	});

	test("one unparseable entry does not lose the others", () => {
		const found = headerAttachments(note("title: Bad: unquoted: colons\nthumb: images/A.jpg"));
		expect(found.length).toBe(1);
		expect(found[0].originalPath).toBe("images/A.jpg");
	});
});

describe("link and attachment classification (the unescaped dot)", () => {
	test("[[Some Document|Alias]] is a link, not an attachment", () => {
		const parsed = getLinksAndAttachments("See [[Some Document|Alias]] for more.");
		expect(parsed.attachments.length).toBe(0);
		expect(parsed.links.length).toBe(1);
		expect(parsed.internalLinks[0].normalizedOriginalPath).toBe("Some Document");
	});

	test("a genuine attachment link is still an attachment", () => {
		const parsed = getLinksAndAttachments("See [the plan](files/plan.docx) please.");
		expect(parsed.attachments.length).toBe(1);
		expect(parsed.links.length).toBe(0);
	});

	test("an UPPERCASE attachment link is still an attachment", () => {
		const parsed = getLinksAndAttachments("See [the shot](images/A.JPG) please.");
		expect(parsed.attachments.length).toBe(1);
	});
});

describe("rewriting the front matter of an exported note (issue #19)", () => {
	test("the reported path is copied out and the link is rewritten", async () => {
		createVaultFile("images/2026-01-15-freecad-1/IMG-20260115051638714-1.jpg");

		const result = await exportNote(note(REPORTED_LINE));
		const thumb = exportedFrontMatter(result).thumb;

		expect(result.linksAndAttachments?.internalHeaderAttachments[0].status)
			.not.toBe("assetNotFound");
		expect(thumb).not.toBe(REPORTED_PATH);
		expect(String(thumb)).toMatch(/^assets\/img-20260115051638714-1-[0-9a-f]{32}\.jpg$/);
		expect(exportedAssets().length).toBe(1);
	});

	test("the rewritten value is still valid YAML - no orphan quote", async () => {
		createVaultFile("images/x.jpg");

		const result = await exportNote(note('feature: "../images/x.jpg"'));
		const feature = String(exportedFrontMatter(result).feature);

		expect(feature).not.toContain('"');
		expect(feature).toMatch(/^assets\/x-[0-9a-f]{32}\.jpg$/);
	});

	test("an UPPERCASE file name is rewritten", async () => {
		createVaultFile("images/A.jpg");

		const result = await exportNote(note("thumb: images/A.jpg"));

		expect(String(exportedFrontMatter(result).thumb))
			.toMatch(/^assets\/a-[0-9a-f]{32}\.jpg$/);
	});

	test("a path with a space in it is rewritten whole", async () => {
		createVaultFile("images/my photo.jpg");

		const result = await exportNote(note("thumb: ../images/my photo.jpg"));
		const thumb = String(exportedFrontMatter(result).thumb);

		expect(thumb).toMatch(/^assets\/my-photo-[0-9a-f]{32}\.jpg$/);
		expect(result.outputContent).not.toContain("../images/my ");
	});

	test("only the key that owns the image is touched, and the body is left alone", async () => {
		createVaultFile("images/A.jpg");

		const result = await exportNote(
			note("title: A note\nthumb: images/A.jpg\ntags:\n  - blog"),
			{}
		);
		const frontMatter = exportedFrontMatter(result);

		expect(String(frontMatter.thumb)).toMatch(/^assets\/a-[0-9a-f]{32}\.jpg$/);
		expect(frontMatter.title).toBe("A note");
		expect(frontMatter.tags).toEqual(["blog"]);
		expect(result.outputContent).toContain("\n---\nJust some body text.\n");
	});

	test("every image of a list valued key is rewritten", async () => {
		createVaultFile("images/A.jpg");
		createVaultFile("images/B.png");

		const result = await exportNote(note("gallery:\n  - images/A.jpg\n  - images/B.png"));
		const gallery = exportedFrontMatter(result).gallery as Array<string>;

		expect(gallery.length).toBe(2);
		expect(gallery[0]).toMatch(/^assets\/a-[0-9a-f]{32}\.jpg$/);
		expect(gallery[1]).toMatch(/^assets\/b-[0-9a-f]{32}\.png$/);
	});

	test("an image under a nested key is rewritten in place", async () => {
		createVaultFile("images/A.jpg");

		const result = await exportNote(note("cover:\n  src: images/A.jpg\n  alt: A photo"));
		const cover = exportedFrontMatter(result).cover as Record<string, string>;

		expect(cover.src).toMatch(/^assets\/a-[0-9a-f]{32}\.jpg$/);
		expect(cover.alt).toBe("A photo");
	});

	test("CRLF line endings survive the rewrite", async () => {
		createVaultFile("images/A.jpg");

		const result = await exportNote("---\r\nthumb: images/A.jpg\r\n---\r\nBody.\r\n");

		expect(result.outputContent).toMatch(
			/^---\r\nthumb: assets\/a-[0-9a-f]{32}\.jpg\r\n---\r\nBody\.\r\n$/
		);
	});

	test("the 'copy' key is still left to the glob copier", async () => {
		createVaultFile("images/A.jpg");

		const result = await exportNote(note("copy: images/A.jpg"));

		expect(String(exportedFrontMatter(result).copy)).toBe("images/A.jpg");
		expect(exportedAssets()).toEqual([]);
	});
});

describe("the same image under two spellings is copied once", () => {
	test("the target name comes from the resolved file, not from the link text", async () => {
		// One real file. The front matter spells it lowercase, the body spells it
		// the way it really is - and Obsidian resolves both to that one file.
		createVaultFile("images/A.jpg");

		const result = await exportNote(
			note("thumb: images/a.jpg", "Here it is: ![shot](images/A.jpg)\n"),
			{ keepOriginalAttachmentFileNames: true }
		);
		const fromHeader = result.linksAndAttachments?.internalHeaderAttachments || [];
		const fromBody = result.linksAndAttachments?.internalAttachments || [];

		expect(fromHeader.length).toBe(1);
		expect(fromBody.length).toBe(1);
		expect(fromHeader[0].newPath).toBe(fromBody[0].newPath);
		expect(exportedAssets().length).toBe(1);
	});
});

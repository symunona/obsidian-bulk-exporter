/**
 * The write-back layer: what actually lands in the document once an attachment
 * has (or has not) been copied out.
 *
 * Three bugs, one theme - a value was written using a representation other than
 * the one that was read:
 *
 * A. An attachment that was never found still had its link rewritten, with an
 *    EMPTY target. The header path guarded on `newPath`, the inline path did not
 *    and passed '' instead, so `![[missing.png]]` came out as `![missing.png]()`
 *    (or `![[|missing.png]]` with preserveWikiLinks on). State written in one
 *    branch, read in all of them.
 *
 * B. A front matter value was replaced by LITERAL SUBSTRING inside its key block,
 *    so `hero.png` also rewrote the tail of `thumbs/hero.png` - and the second
 *    attachment then found nothing to change and silently no-oped.
 *
 * C. The same replace compared the PARSED value against the RAW text. `it's.png`
 *    does not occur anywhere in `thumb: 'it''s.png'`, so the asset was copied and
 *    the link was never updated - no error, no change, nothing.
 *
 * Plus: `replaceAll` escaped its needle but not its replacement, so `$&` in a file
 * name was expanded by `String.replace` into the text it had just matched.
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
import replaceAll from "../utils/replace-all";
import type BulkExporterPlugin from "../main";

let vaultFolder = "";
let outputFolder = "";
let vaultFiles: Array<string> = [];

/** Wraps front matter lines into a note. */
function note(frontMatter: string, body = "Just some body text.\n"): string {
	return `---\n${frontMatter}\n---\n${body}`;
}

/** Creates a real file in the temp vault, so `copyFileSync` has something to copy. */
function createVaultFile(relativePath: string) {
	const absolute = join(vaultFolder, relativePath);
	mkdirSync(dirname(absolute), { recursive: true });
	writeFileSync(absolute, "pretend this is a jpeg");
	vaultFiles.push(relativePath);
}

/**
 * Obsidian resolves a link case-insensitively, and prefers the file whose whole
 * path matches over one that merely shares a base name - which is exactly the
 * distinction `hero.png` versus `thumbs/hero.png` turns on.
 */
function resolveLinkPath(linkPath: string): { path: string } | null {
	const wanted = linkPath.replace(/^(\.{1,2}\/)+/, "").toLowerCase();
	const exact = vaultFiles.find((path) => path.toLowerCase() === wanted);
	if (exact) { return { path: exact } }
	const byName = vaultFiles.find(
		(path) => basename(path).toLowerCase() === basename(wanted));
	return byName ? { path: byName } : null;
}

function stubPlugin(): BulkExporterPlugin {
	return {
		app: {
			metadataCache: {
				getFirstLinkpathDest: (linkPath: string) => resolveLinkPath(linkPath),
			},
			vault: { adapter: { basePath: vaultFolder } },
		},
	} as unknown as BulkExporterPlugin;
}

/** Runs the real attachment half of the export - front matter, then body. */
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
		plugin, settings, exportProperties, parsed.internalHeaderAttachments);
	await collectAndReplaceInlineAttachments(
		plugin, settings, exportProperties, parsed.internalAttachments);
	return exportProperties;
}

/** The front matter of an exported note, as YAML understands it. */
function exportedFrontMatter(
	exportProperties: ExportProperties
): Record<string, unknown> {
	const match = exportProperties.outputContent.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
	if (!match) { throw new Error("The export lost the front matter entirely.") }
	return parseYaml(match[1]) as Record<string, unknown>;
}

function exportedAssets(): Array<string> {
	try {
		return readdirSync(join(outputFolder, "assets")).sort();
	} catch {
		return [];
	}
}

function warnedAbout(needle: string): boolean {
	return consoleWarn.mock.calls.some(
		(call: Array<unknown>) => call.map(String).join(" ").indexOf(needle) > -1);
}

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

describe("an attachment that was never found (bug A)", () => {
	test("a wiki embed does not become a link to nowhere", async () => {
		// Defaults: preserveWikiLinks on, keepLinksNotFound off.
		const result = await exportNote("Here it is: ![[missing.png]]\n");

		expect(result.outputContent).not.toContain("]()");
		expect(result.outputContent).not.toContain("[[|");
		expect(result.outputContent).not.toContain("wikilink://");
		// Same answer `replaceLocalLink` gives an unresolvable note link: the link
		// goes, its text stays.
		expect(result.outputContent).toBe("Here it is: missing.png\n");
	});

	test("with preserveWikiLinks off, it is still not a link to nowhere", async () => {
		const result = await exportNote(
			"Here it is: ![[missing.png]]\n", { preserveWikiLinks: false });

		expect(result.outputContent).not.toContain("]()");
		expect(result.outputContent).toBe("Here it is: missing.png\n");
	});

	test("a markdown embed keeps its alt text, without a stray bang", async () => {
		const result = await exportNote("Here it is: ![shot](images/missing.png)\n");

		expect(result.outputContent).not.toContain("]()");
		expect(result.outputContent).not.toContain("!shot");
		expect(result.outputContent).toBe("Here it is: shot\n");
	});

	test("a plain link to a missing attachment keeps its text", async () => {
		// Not an embed - `extractAttachments` also collects [text](file.docx).
		const result = await exportNote("See [the plan](files/plan.docx) please.\n");

		expect(result.outputContent).not.toContain("]()");
		expect(result.outputContent).toBe("See the plan please.\n");
	});

	test("keepLinksNotFound leaves a wiki embed on the original name", async () => {
		const result = await exportNote(
			"Here it is: ![[missing.png]]\n", { keepLinksNotFound: true });

		expect(result.outputContent).not.toContain("]()");
		expect(result.outputContent).toBe("Here it is: ![[missing.png]]\n");
	});

	test("keepLinksNotFound without wiki links keeps a plain markdown embed", async () => {
		const result = await exportNote(
			"Here it is: ![[missing.png]]\n",
			{ keepLinksNotFound: true, preserveWikiLinks: false });

		expect(result.outputContent).toBe("Here it is: ![missing.png](missing.png)\n");
	});

	test("keepLinksNotFound leaves a markdown embed exactly as written", async () => {
		const result = await exportNote(
			"Here it is: ![shot](images/missing.png)\n", { keepLinksNotFound: true });

		expect(result.outputContent).toBe("Here it is: ![shot](images/missing.png)\n");
	});

	test("either way the user is told, in the log and on the console", async () => {
		for (const keepLinksNotFound of [false, true]) {
			consoleWarn.mockClear();
			const result = await exportNote(
				"Here it is: ![[missing.png]]\n", { keepLinksNotFound });
			const attachment = (result.linksAndAttachments?.internalAttachments || [])[0];

			// `status` is what paints the entry red in the export log.
			expect(attachment.status).toBe("assetNotFound");
			expect(attachment.newPath).toBeUndefined();
			expect(attachment.error).toContain("Asset not found!");
			expect(warnedAbout("Attachment not found!")).toBe(true);
		}
	});

	test("a missing attachment does not stop the ones around it", async () => {
		createVaultFile("images/A.jpg");

		const result = await exportNote(
			"![[missing.png]] and ![shot](images/A.jpg) together.\n");

		expect(result.outputContent).toMatch(
			/^missing\.png and !\[shot\]\(assets\/a-[0-9a-f]{32}\.jpg\) together\.\n$/);
		expect(exportedAssets().length).toBe(1);
	});

	test("a front matter attachment that is missing is left as written", async () => {
		// The header path was already guarded; this pins that it stays that way. A
		// YAML scalar has no link to strip - the value IS the text - so leaving it
		// alone is the `keepLinksNotFound: true` answer, the only one available.
		const result = await exportNote(note("thumb: images/missing.png"));

		expect(exportedFrontMatter(result).thumb).toBe("images/missing.png");
		expect(result.linksAndAttachments?.internalHeaderAttachments[0].status)
			.toBe("assetNotFound");
	});
});

describe("one value of a front matter list, not any substring of it (bug B)", () => {
	test("a value that is a suffix of the next one rewrites only itself", async () => {
		createVaultFile("hero.png");
		createVaultFile("thumbs/hero.png");

		const result = await exportNote(
			note("images:\n  - hero.png\n  - thumbs/hero.png"));
		const images = exportedFrontMatter(result).images as Array<string>;

		// `thumbs/assets/hero-HASH.png` was the old output: replacing `hero.png`
		// hit the tail of the second entry too, and the second attachment then
		// found no block still holding its value and silently changed nothing.
		expect(result.outputContent).not.toContain("thumbs/assets");
		expect(images.length).toBe(2);
		expect(images[0]).toMatch(/^assets\/hero-[0-9a-f]{32}\.png$/);
		expect(images[1]).toMatch(/^assets\/hero-[0-9a-f]{32}\.png$/);
		expect(images[0]).not.toBe(images[1]);
		expect(exportedAssets().length).toBe(2);
	});

	test("the same, with the longer entry first", async () => {
		createVaultFile("hero.png");
		createVaultFile("thumbs/hero.png");

		const result = await exportNote(
			note("images:\n  - thumbs/hero.png\n  - hero.png"));
		const images = exportedFrontMatter(result).images as Array<string>;

		expect(result.outputContent).not.toContain("thumbs/assets");
		expect(images[0]).not.toBe(images[1]);
		expect(images.every((image) => /^assets\/hero-[0-9a-f]{32}\.png$/.test(image)))
			.toBe(true);
	});

	test("a value repeated in the same list is rewritten at both places", async () => {
		createVaultFile("hero.png");

		const result = await exportNote(
			note("images:\n  - hero.png\n  - hero.png"));
		const images = exportedFrontMatter(result).images as Array<string>;

		expect(images.length).toBe(2);
		expect(images[0]).toMatch(/^assets\/hero-[0-9a-f]{32}\.png$/);
		expect(images[1]).toBe(images[0]);
	});
});

describe("the value as it is WRITTEN, not as YAML parses it (bug C)", () => {
	test("a single quoted value with a YAML escaped quote is rewritten", async () => {
		createVaultFile("it's.png");

		const result = await exportNote(note("thumb: 'it''s.png'"));
		const thumb = String(exportedFrontMatter(result).thumb);

		// `it's.png` occurs nowhere in `'it''s.png'`, so the literal replace used to
		// match nothing and hand the document straight back.
		expect(thumb).not.toBe("it's.png");
		expect(thumb).toMatch(/^assets\/its-[0-9a-f]{32}\.png$/);
		expect(exportedAssets().length).toBe(1);
	});

	test("a double quoted value with a backslash escape is rewritten", async () => {
		createVaultFile('a"b.png');

		const result = await exportNote(note('thumb: "a\\"b.png"'));
		const thumb = String(exportedFrontMatter(result).thumb);

		expect(thumb).toMatch(/^assets\/ab-[0-9a-f]{32}\.png$/);
		expect(exportedAssets().length).toBe(1);
	});

	test("the quoting style the user chose survives the rewrite", async () => {
		createVaultFile("images/x.jpg");
		createVaultFile("images/y.jpg");

		const result = await exportNote(
			note('feature: "images/x.jpg"\nthumb: \'images/y.jpg\''));

		expect(result.outputContent).toMatch(/\nfeature: "assets\/x-[0-9a-f]{32}\.jpg"\n/);
		expect(result.outputContent).toMatch(/\nthumb: 'assets\/y-[0-9a-f]{32}\.jpg'\n/);
	});

	test("a trailing comment is not swallowed by the rewrite", async () => {
		createVaultFile("images/A.jpg");

		const result = await exportNote(note("thumb: images/A.jpg # the hero"));

		expect(result.outputContent).toMatch(
			/\nthumb: assets\/a-[0-9a-f]{32}\.jpg # the hero\n/);
		expect(String(exportedFrontMatter(result).thumb))
			.toMatch(/^assets\/a-[0-9a-f]{32}\.jpg$/);
	});

	test("a form the scanner cannot place still gets the old literal replace", async () => {
		// A flow sequence has no per-line scalar to point at, so the write-back
		// falls back to what it always did. Not a fix - a promise not to regress.
		createVaultFile("images/A.jpg");

		const result = await exportNote(note("images: [images/A.jpg]"));
		const images = exportedFrontMatter(result).images as Array<string>;

		expect(images[0]).toMatch(/^assets\/a-[0-9a-f]{32}\.jpg$/);
	});
});

describe("replaceAll keeps its replacement literal", () => {
	test("$& in the replacement is not expanded into the match", () => {
		expect(replaceAll("needle", "a needle b", "x$&y")).toBe("a x$&y b");
	});

	test("neither are the other substitution patterns", () => {
		expect(replaceAll("n", "anb", "$`$'$$")).toBe("a$`$'$$b");
	});

	test("$1 stays put, rather than depending on there being no capture group", () => {
		expect(replaceAll("n", "anb", "$1")).toBe("a$1b");
	});

	test("an asset named with $& is linked to its real new path", async () => {
		createVaultFile("images/a$&b.png");

		const result = await exportNote(
			"Here it is: ![shot](images/a$&b.png)\n",
			{ keepOriginalAttachmentFileNames: true });

		// `assets/aimages/a$&b.pngb.png` was the old output - `$&` in the
		// replacement expanded to the text it had just matched.
		expect(result.outputContent).toBe("Here it is: ![shot](assets/a$&b.png)\n");
		expect(exportedAssets()).toEqual(["a$&b.png"]);
	});

	test("the same in the front matter", async () => {
		createVaultFile("images/a$&b.png");

		const result = await exportNote(
			note("thumb: images/a$&b.png"), { keepOriginalAttachmentFileNames: true });

		expect(exportedFrontMatter(result).thumb).toBe("assets/a$&b.png");
	});
});

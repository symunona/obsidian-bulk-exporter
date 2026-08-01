/**
 * The attachment save must be awaited, all the way up the chain:
 *
 *   saveAttachmentToLocation
 *     -> collectAndReplace{Header,Inline}Attachments
 *     -> collectAssetsReplaceLinks
 *     -> convertAndCopy
 *     -> the per-file try/catch in exportSelection
 *
 * It used to be fired with `void` and never awaited, which cost two things:
 *
 * 1. A failed attachment copy rejected into nowhere. It became an unhandled
 *    rejection - never collected as an `ExportFailure`, never in the export log,
 *    never counted in the Notice. The user saw a clean, successful export that
 *    was quietly missing an image.
 *
 * 2. It was a landmine. Both call sites read `attachment.newPath` on the very next
 *    line, and that only worked because `saveAttachmentToLocation` happened to
 *    reach the assignment before its first `await`. One `await` inserted above that
 *    line and every attachment link rewrite would have stopped happening, silently.
 *
 * These tests drive the real `exportSelection()` over a stub vault whose attachment
 * reads finish on a LATER MACROTASK - the same genuine async boundary the real
 * `vault.readBinary()` has on a non-desktop adapter. Un-awaited, the export resolves
 * before those reads land.
 *
 * @see https://github.com/symunona/obsidian-bulk-exporter/issues/17
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { ExportFailure } from "../export/export-log";
import { BulkExportSettings, DEFAULT_SETTINGS } from "../models/bulk-export-settings";
import { ExportMap, ExportProperties } from "../models/export-properties";
import type BulkExporterPlugin from "../main";

const mockLogged: Array<string> = [];
/** One entry per `exportedLogEntry` call: the failures it was handed. */
const mockLoggedFailures: Array<Array<ExportFailure>> = [];

// The real log() writes into a DOM element the plugin UI registers, and throws
// when there is none.
jest.mock("../utils/log", () => ({
	COLORS: { LOG: "", WARN: "#838009", ERROR: "red" },
	log: (...args: unknown[]) => { mockLogged.push("[log] " + args.join(" ")) },
	warn: (...args: unknown[]) => { mockLogged.push("[warn] " + args.join(" ")) },
	error: (...args: unknown[]) => { mockLogged.push("[error] " + args.join(" ")) },
}));

// exportedLogEntry builds the stats tree with obsidian's DOM helpers, which
// only exist inside the app. Capture what it is handed instead.
jest.mock("../export/export-log", () => ({
	exportedLogEntry: (
		outputPathMap: unknown,
		plugin: unknown,
		failures: Array<ExportFailure> = []
	) => { mockLoggedFailures.push(failures) },
}));

import { exportSelection } from "../export/exporter";
import { getLinksAndAttachments } from "../export/get-links-and-attachments";
import { collectAndReplaceInlineAttachments } from "../export/get-markdown-attachments";

/** Stand-in for image bytes. Content does not matter, only that it arrives. */
const ASSET_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

/** The image every good note embeds. */
const GOOD_ASSET = "images/A.png";
/** The image whose read blows up. */
const BAD_ASSET = "images/broken.png";

const GOOD_NOTES = ["note-0.md", "note-2.md", "note-3.md"];
const BAD_NOTE = "note-1.md";
/** In export order, so "the ones after the bad one" is a meaningful phrase. */
const ALL_NOTES = ["note-0.md", BAD_NOTE, "note-2.md", "note-3.md"];

/** The name `saveAttachmentToLocation` gives a copied asset: <slug>-<md5>.<ext>. */
const HASHED_ASSET_NAME = /^a-[0-9a-f]{32}\.png$/;

let outputFolder = "";

/** A real macrotask boundary - not a microtask, which an un-awaited chain could still win. */
function laterTick(): Promise<void> {
	return new Promise((resolve) => window.setTimeout(resolve, 0));
}

function settingsFor(folder: string): BulkExportSettings {
	return Object.assign({}, DEFAULT_SETTINGS, {
		outputFolder: folder,
		assetPath: "assets",
		emptyTargetFolder: false,
		preserveWikiLinks: false,
		shell: "",
	});
}

function exportPropertiesFor(from: string, folder: string): ExportProperties {
	return {
		from,
		newFileName: from,
		toRelative: from,
		toRelativeToExportDirRoot: "",
		toAbsoluteFs: join(folder, from),
		content: "",
		outputContent: "",
		frontMatter: {},
		md5: "",
		lastExportDate: 0,
		// Only `path` and `mtime.toMillis()` are read out of the dataview page.
		file: {
			path: from,
			mtime: { toMillis: () => 0 },
		},
	};
}

function noteEmbedding(assetPath: string) {
	return `Look at this: ![shot](${assetPath})\n`;
}

/** Four notes, one of which embeds the image that cannot be read. */
function buildVault(folder: string) {
	const contents: { [path: string]: string } = {};
	const fileList: ExportMap = {};
	ALL_NOTES.forEach((path) => {
		contents[path] = noteEmbedding(path === BAD_NOTE ? BAD_ASSET : GOOD_ASSET);
		fileList[path] = exportPropertiesFor(path, folder);
	});
	return { contents, fileList };
}

/**
 * A vault whose adapter has no `basePath`, so the exporter takes the
 * `await vault.readBinary()` branch instead of the synchronous `copyFileSync` one.
 * That await is the genuine async boundary these tests hang everything on.
 */
function pluginFor(contents: { [path: string]: string }): BulkExporterPlugin {
	return {
		app: {
			metadataCache: {
				getFirstLinkpathDest: (linkPath: string) =>
					linkPath === GOOD_ASSET || linkPath === BAD_ASSET
						? { path: linkPath }
						: null,
			},
			vault: {
				// No `basePath` on purpose - see the doc comment above.
				adapter: {
					read: async (path: string) => contents[path],
				},
				readBinary: async (asset: { path: string }) => {
					await laterTick();
					if (asset.path === BAD_ASSET) {
						throw new Error(`EIO: could not read ${asset.path}`);
					}
					return ASSET_BYTES.slice().buffer;
				},
			},
		},
	} as unknown as BulkExporterPlugin;
}

function reportedFailures(): Array<ExportFailure> {
	return mockLoggedFailures[0] || [];
}

function exportedAssets(): Array<string> {
	try {
		return readdirSync(join(outputFolder, "assets")).sort();
	} catch {
		return [];
	}
}

function exportedNotes(): Array<string> {
	return readdirSync(outputFolder).filter((name) => name.endsWith(".md")).sort();
}

// The plugin also dumps failures to the developer console on purpose; that is
// signal for a user with the dev tools open, but noise in a test run.
let consoleError: jest.SpyInstance;
let consoleWarn: jest.SpyInstance;

beforeEach(() => {
	outputFolder = mkdtempSync(join(tmpdir(), "bulk-exporter-attachment-"));
	mockLogged.length = 0;
	mockLoggedFailures.length = 0;
	consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
	consoleWarn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
	consoleError.mockRestore();
	consoleWarn.mockRestore();
	rmSync(outputFolder, { recursive: true, force: true });
});

describe("an attachment that cannot be copied", () => {
	test("is reported as a failed file, not swallowed", async () => {
		const { contents, fileList } = buildVault(outputFolder);

		await exportSelection(fileList, settingsFor(outputFolder), pluginFor(contents));

		const failures = reportedFailures();
		expect(failures.map((failure) => failure.exportProperties.from)).toEqual([BAD_NOTE]);
		expect(failures[0].message).toContain("could not read " + BAD_ASSET);
	});

	test("is named in the export log", async () => {
		const { contents, fileList } = buildVault(outputFolder);

		await exportSelection(fileList, settingsFor(outputFolder), pluginFor(contents));

		expect(mockLogged.filter((entry) => entry.startsWith("[error]")).join("\n"))
			.toContain(BAD_NOTE);
	});

	test("does not take the batch down with it", async () => {
		const { contents, fileList } = buildVault(outputFolder);

		const result = await exportSelection(
			fileList,
			settingsFor(outputFolder),
			pluginFor(contents)
		);

		// Every other note is out, with its image alongside it. The notes AFTER the
		// bad one are the point: they must not be collateral damage.
		expect(exportedNotes()).toEqual(GOOD_NOTES);
		expect(exportedAssets().length).toBe(1);
		expect(Object.keys(result).length).toBe(ALL_NOTES.length);
		expect(mockLoggedFailures.length).toBe(1);
	});
});

describe("the export does not resolve before its attachments are written", () => {
	test("every copied asset is on disk the moment exportSelection returns", async () => {
		const { contents, fileList } = buildVault(outputFolder);

		await exportSelection(fileList, settingsFor(outputFolder), pluginFor(contents));

		const assets = exportedAssets();
		expect(assets.length).toBe(1);
		expect(assets[0]).toMatch(HASHED_ASSET_NAME);
		expect(readFileSync(join(outputFolder, "assets", assets[0])))
			.toEqual(Buffer.from(ASSET_BYTES));
	});

	test("the rewritten link points at a file that already exists", async () => {
		const { contents, fileList } = buildVault(outputFolder);

		await exportSelection(fileList, settingsFor(outputFolder), pluginFor(contents));

		const exported = readFileSync(join(outputFolder, GOOD_NOTES[0]), "utf-8");
		const rewritten = exported.match(/!\[shot\]\((.*?)\)/);

		// The link was rewritten away from the vault path...
		expect(rewritten).not.toBeNull();
		expect(rewritten && rewritten[1]).not.toBe(GOOD_ASSET);
		expect(rewritten && rewritten[1]).toMatch(/^assets\/a-[0-9a-f]{32}\.png$/);
		// ...and it is not a promise to write that file later. It is there.
		expect(existsSync(join(outputFolder, rewritten ? rewritten[1] : "")))
			.toBe(true);
	});
});

describe("the collector's promise is the 'this note is done' signal", () => {
	/**
	 * The landmine guard. It pins BOTH halves:
	 *   - the save really does span an async boundary (nothing is on disk yet), and
	 *   - awaiting the collector is what closes it.
	 * De-await the chain and the second half fails, whichever way the code is
	 * reshuffled - there is no ordering of synchronous statements that can satisfy
	 * it.
	 */
	test("nothing is written before the await, everything after it", async () => {
		const contents = noteEmbedding(GOOD_ASSET);
		const parsed = getLinksAndAttachments(contents);
		const exportProperties = exportPropertiesFor("note-0.md", outputFolder);
		exportProperties.content = contents;
		exportProperties.outputContent = parsed.markdownReplacedWikiStyleLinks;

		const finished = collectAndReplaceInlineAttachments(
			pluginFor({ "note-0.md": contents }),
			settingsFor(outputFolder),
			exportProperties,
			parsed.internalAttachments
		);

		expect(parsed.internalAttachments.length).toBe(1);
		expect(exportedAssets()).toEqual([]);

		await finished;

		expect(exportedAssets().length).toBe(1);
		expect(exportedAssets()[0]).toMatch(HASHED_ASSET_NAME);
		expect(exportProperties.outputContent)
			.toContain("(assets/" + exportedAssets()[0] + ")");
	});

	test("a rejected save rejects the collector, so the caller can catch it", async () => {
		const contents = noteEmbedding(BAD_ASSET);
		const parsed = getLinksAndAttachments(contents);
		const exportProperties = exportPropertiesFor("note-1.md", outputFolder);
		exportProperties.content = contents;
		exportProperties.outputContent = parsed.markdownReplacedWikiStyleLinks;

		await expect(
			collectAndReplaceInlineAttachments(
				pluginFor({ "note-1.md": contents }),
				settingsFor(outputFolder),
				exportProperties,
				parsed.internalAttachments
			)
		).rejects.toThrow("could not read " + BAD_ASSET);
	});
});

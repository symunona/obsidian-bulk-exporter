/**
 * Degrading, rather than failing.
 *
 * Two ways this plugin used to turn a small problem into a total one:
 *
 * 1. An attachment that could not be COPIED failed the whole note. The copy sits
 *    inside `collectAssetsReplaceLinks` -> `convertAndCopy` -> the per-file guard
 *    in `exportSelection`, so one unreadable image meant the `.md` was never
 *    written at all. For a static site export that is the wrong trade: a hole in
 *    a page beats a missing page. A missing asset already degraded this way
 *    (`assetNotFound` returns normally); a failed copy now does too.
 *
 * 2. `log()` THREW when no log target was registered - `setLogOutput` only runs
 *    in `BulkExporterView.onOpen`. The `bulk-export` command exports before it
 *    opens the view, and the `metadataCache "resolved"` startup search never
 *    opens one, so `searchFilesToExport`'s unconditional `log()` rejected those
 *    paths outright. Both call sites were fire-and-forget, so the user saw
 *    absolutely nothing happen.
 *
 * What must NOT change: a failure that is not an attachment copy still fails its
 * file and is reported. The per-file guard is a guard, not a blanket swallow.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { ExportFailure } from "../export/export-log";
import { BulkExportSettings, DEFAULT_SETTINGS } from "../models/bulk-export-settings";
import { ExportMap, ExportProperties } from "../models/export-properties";
import type BulkExporterPlugin from "../main";

const mockLogged: Array<string> = [];
/** One entry per `exportedLogEntry` call: the failures it was handed. */
const mockLoggedFailures: Array<Array<ExportFailure>> = [];

// The real log() writes into a DOM element the plugin UI registers. The last
// describe() in this file reaches past this mock, with `jest.requireActual`, to
// test the real module - everything else just wants to read what was said.
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

/** Stand-in for image bytes. */
const ASSET_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

/** The image that copies fine. */
const GOOD_ASSET = "images/A.png";
/** The image whose read blows up half way through the export. */
const BAD_ASSET = "images/broken.png";

/** The note whose attachment cannot be copied. */
const DEGRADED_NOTE = "note-1.md";
/** The note the vault cannot even read - a genuine per-file failure. */
const UNREADABLE_NOTE = "note-2.md";
/** The note whose own `.md` write blows up - a failure AFTER the attachments. */
const UNWRITABLE_NOTE = "note-3.md";

const ALL_NOTES = ["note-0.md", DEGRADED_NOTE, UNREADABLE_NOTE, UNWRITABLE_NOTE, "note-4.md"];

let outputFolder = "";

/** A real macrotask boundary, like the real `vault.readBinary()` has. */
function laterTick(): Promise<void> {
	return new Promise((resolve) => window.setTimeout(resolve, 0));
}

function settingsFor(
	folder: string,
	overrides: Partial<BulkExportSettings> = {}
): BulkExportSettings {
	return Object.assign({}, DEFAULT_SETTINGS, {
		outputFolder: folder,
		assetPath: "assets",
		emptyTargetFolder: false,
		preserveWikiLinks: false,
		shell: "",
	}, overrides);
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

/**
 * Five notes: one whose image cannot be copied, one the vault cannot read, one
 * whose own file cannot be written, and two perfectly ordinary ones - one of
 * them AFTER every problem, because "the rest of the batch" is the point.
 */
function buildVault(folder: string) {
	const contents: { [path: string]: string } = {};
	const fileList: ExportMap = {};
	ALL_NOTES.forEach((path) => {
		contents[path] = noteEmbedding(path === DEGRADED_NOTE ? BAD_ASSET : GOOD_ASSET);
		fileList[path] = exportPropertiesFor(path, folder);
	});
	// `writeFileSync` onto a path that is a DIRECTORY throws EISDIR. That is a
	// real "the .md itself could not be written" failure, and - unlike an
	// unreadable note - it happens AFTER the attachments have been collected,
	// which is exactly where a catch that was too wide would swallow it.
	mkdirSync(join(folder, UNWRITABLE_NOTE), { recursive: true });
	return { contents, fileList };
}

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
				// No `basePath` on purpose: that sends the exporter down the
				// `await vault.readBinary()` branch instead of `copyFileSync`.
				adapter: {
					read: async (path: string) => {
						if (path === UNREADABLE_NOTE) {
							throw new Error(`ENOENT: cannot read ${path}`);
						}
						return contents[path];
					},
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

function failedFileNames(): Array<string> {
	return reportedFailures().map((failure) => failure.exportProperties.from).sort();
}

/** Only real files: `UNWRITABLE_NOTE` is a directory sitting in the way. */
function exportedNotes(): Array<string> {
	return readdirSync(outputFolder)
		.filter((name) => name.endsWith(".md"))
		.filter((name) => statSync(join(outputFolder, name)).isFile())
		.sort();
}

function exportedAssets(): Array<string> {
	try {
		return readdirSync(join(outputFolder, "assets")).sort();
	} catch {
		return [];
	}
}

function logged(level: "log" | "warn" | "error"): string {
	return mockLogged.filter((entry) => entry.startsWith(`[${level}]`)).join("\n");
}

/** The attachments of one file, whatever they ended up as. */
function attachmentsOf(exportProperties: ExportProperties) {
	const parsed = exportProperties.linksAndAttachments;
	return (parsed?.internalAttachments || []).concat(parsed?.internalHeaderAttachments || []);
}

// The plugin also dumps failures to the developer console on purpose; that is
// signal for a user with the dev tools open, but noise in a test run.
let consoleError: jest.SpyInstance;
let consoleWarn: jest.SpyInstance;
let consoleLog: jest.SpyInstance;

beforeEach(() => {
	outputFolder = mkdtempSync(join(tmpdir(), "bulk-exporter-degradation-"));
	mockLogged.length = 0;
	mockLoggedFailures.length = 0;
	consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
	consoleWarn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
	consoleLog = jest.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
	consoleError.mockRestore();
	consoleWarn.mockRestore();
	consoleLog.mockRestore();
	rmSync(outputFolder, { recursive: true, force: true });
});

describe("an attachment whose copy throws", () => {
	test("does not cost the note - the .md is still written", async () => {
		const { contents, fileList } = buildVault(outputFolder);

		await exportSelection(fileList, settingsFor(outputFolder), pluginFor(contents));

		expect(existsSync(join(outputFolder, DEGRADED_NOTE))).toBe(true);
		expect(failedFileNames()).not.toContain(DEGRADED_NOTE);
	});

	test("degrades the link exactly as a missing asset does", async () => {
		const { contents, fileList } = buildVault(outputFolder);

		await exportSelection(fileList, settingsFor(outputFolder), pluginFor(contents));

		// keepLinksNotFound is off: drop the link, keep its text. Never a link
		// pointing at an asset that is not in the output, and never `![shot]()`.
		const exported = readFileSync(join(outputFolder, DEGRADED_NOTE), "utf-8");
		expect(exported).toBe("Look at this: shot\n");
		expect(exported).not.toContain("]()");
		expect(exported).not.toContain(BAD_ASSET);
	});

	test("with keepLinksNotFound it stays on the name as written", async () => {
		const { contents, fileList } = buildVault(outputFolder);

		await exportSelection(
			fileList,
			settingsFor(outputFolder, { keepLinksNotFound: true }),
			pluginFor(contents)
		);

		// The other half of the same policy - the one `replaceLocalLink` applies
		// to a note link that resolves to nothing.
		expect(readFileSync(join(outputFolder, DEGRADED_NOTE), "utf-8"))
			.toBe(noteEmbedding(BAD_ASSET));
	});

	test("never leaves newPath pointing at a file that was not written", async () => {
		const { contents, fileList } = buildVault(outputFolder);

		await exportSelection(fileList, settingsFor(outputFolder), pluginFor(contents));

		const attachment = attachmentsOf(fileList[DEGRADED_NOTE])[0];
		expect(attachment.newPath).toBeUndefined();
		expect(exportedAssets().length).toBe(1);
	});

	test("is recorded on the attachment, with what went wrong", async () => {
		const { contents, fileList } = buildVault(outputFolder);

		await exportSelection(fileList, settingsFor(outputFolder), pluginFor(contents));

		const attachment = attachmentsOf(fileList[DEGRADED_NOTE])[0];
		// The status the export log paints red - the asset is not in the output,
		// which is the only thing the reader of the exported site can tell.
		expect(attachment.status).toBe("assetNotFound");
		expect(attachment.error).toContain("Could not copy asset");
		expect(attachment.error).toContain("could not read " + BAD_ASSET);
		// ...and what was done about it, so the log row is self-explanatory.
		expect(attachment.error).toContain("Removed the link, kept its text.");
	});

	test("is visible in the export log, naming the file and the asset", async () => {
		const { contents, fileList } = buildVault(outputFolder);

		await exportSelection(fileList, settingsFor(outputFolder), pluginFor(contents));

		const warnings = logged("warn");
		expect(warnings).toContain(DEGRADED_NOTE);
		expect(warnings).toContain(BAD_ASSET);
		expect(warnings).toContain("could not read " + BAD_ASSET);
		expect(warnings).toContain("1 file(s) exported with attachment(s) missing");
	});

	test("counts as degraded, not as a failed file", async () => {
		const { contents, fileList } = buildVault(outputFolder);

		await exportSelection(fileList, settingsFor(outputFolder), pluginFor(contents));

		// The failure count means "not in the output at all". Inflating it with
		// files that ARE out, just imperfectly, would make one number mean two
		// things - so the degraded ones get their own line instead.
		expect(failedFileNames()).toEqual([UNREADABLE_NOTE, UNWRITABLE_NOTE].sort());
		expect(logged("warn")).toContain("exported with attachment(s) missing");
	});

	test("says nothing about degradation when nothing degraded", async () => {
		const { contents, fileList } = buildVault(outputFolder);
		delete fileList[DEGRADED_NOTE];

		await exportSelection(fileList, settingsFor(outputFolder), pluginFor(contents));

		expect(logged("warn")).not.toContain("missing from the output");
	});
});

describe("the rest of the batch", () => {
	test("completes, and the other files are untouched by it", async () => {
		const { contents, fileList } = buildVault(outputFolder);

		const result = await exportSelection(
			fileList,
			settingsFor(outputFolder),
			pluginFor(contents)
		);

		// Everything except the two that genuinely could not be written.
		expect(exportedNotes()).toEqual(["note-0.md", DEGRADED_NOTE, "note-4.md"].sort());
		expect(Object.keys(result).length).toBe(ALL_NOTES.length);
		expect(mockLogged.join("\n")).toContain("Export took");
	});

	test("the good notes still get their image, rewritten and on disk", async () => {
		const { contents, fileList } = buildVault(outputFolder);

		await exportSelection(fileList, settingsFor(outputFolder), pluginFor(contents));

		const assets = exportedAssets();
		expect(assets.length).toBe(1);

		const exported = readFileSync(join(outputFolder, "note-4.md"), "utf-8");
		const rewritten = exported.match(/!\[shot\]\((.*?)\)/);
		expect(rewritten && rewritten[1]).toBe("assets/" + assets[0]);
		expect(existsSync(join(outputFolder, "assets", assets[0]))).toBe(true);
	});
});

describe("a failure that is NOT an attachment copy", () => {
	test("still fails its file, and only its file", async () => {
		const { contents, fileList } = buildVault(outputFolder);

		await exportSelection(fileList, settingsFor(outputFolder), pluginFor(contents));

		expect(exportedNotes()).not.toContain(UNREADABLE_NOTE);
		expect(failedFileNames()).toContain(UNREADABLE_NOTE);
		expect(logged("error")).toContain("cannot read " + UNREADABLE_NOTE);
	});

	test("a .md write that blows up AFTER the attachments still fails the file", async () => {
		const { contents, fileList } = buildVault(outputFolder);

		await exportSelection(fileList, settingsFor(outputFolder), pluginFor(contents));

		// The catch is around the COPY, not around the write - so this one, which
		// happens later in the same call, must still reach the per-file guard.
		expect(failedFileNames()).toContain(UNWRITABLE_NOTE);
		expect(reportedFailures()
			.filter((failure) => failure.exportProperties.from === UNWRITABLE_NOTE)[0]
			.message).toMatch(/EISDIR|illegal operation on a directory/i);
		expect(logged("error")).toContain(UNWRITABLE_NOTE);
	});

	test("the guard is not a blanket swallow - both kinds are still counted", async () => {
		const { contents, fileList } = buildVault(outputFolder);

		await exportSelection(fileList, settingsFor(outputFolder), pluginFor(contents));

		expect(reportedFailures().length).toBe(2);
	});
});

/**
 * The obsidian globals `logEntry`/`setLogOutput` build their DOM with. They live
 * on the app's window, not in jsdom, so the real log module can only be
 * exercised with them put back.
 */
function installObsidianDomHelpers() {
	// The one place `document.createElement` is unavoidable: it is the primitive
	// the helpers being installed are made OF.
	const element = (tag: string) => document.createElement(tag);

	const globals = window as unknown as Record<string, unknown>;
	globals.createEl = element;
	globals.createDiv = () => element("div");
	globals.createSpan = (options?: { attr?: Record<string, string> }) => {
		const span = element("span");
		const attributes = options?.attr || {};
		Object.keys(attributes).forEach((key) => span.setAttribute(key, attributes[key]));
		return span;
	};
	HTMLElement.prototype.addClass = function (this: HTMLElement, ...classes: string[]) {
		this.classList.add(...classes);
	};
}

/**
 * The REAL log module, past the `jest.mock` at the top of this file - the throw
 * being fixed lives in there, so nothing else can pin it - and a FRESH copy of
 * it every time, because whether a target is registered is module state and
 * "before the view exists" is precisely the state under test.
 */
function freshLog(): typeof import("../utils/log") {
	let module: typeof import("../utils/log") | undefined;
	jest.isolateModules(() => {
		module = jest.requireActual<typeof import("../utils/log")>("../utils/log");
	});
	if (!module) { throw new Error("could not load the log module") }
	return module;
}

describe("logging before the view exists", () => {
	beforeAll(installObsidianDomHelpers);

	test("does not throw, and the message is not lost", () => {
		const realLog = freshLog();

		// `setLogOutput` has never been called - this is `main.ts`'s startup
		// search and the `bulk-export` command, both of which run before the
		// view (and therefore the log target) exists.
		expect(() => realLog.log("found 12 files")).not.toThrow();
		expect(() => realLog.warn("a link looks odd")).not.toThrow();
		expect(() => realLog.error("the query is broken")).not.toThrow();

		// Then the user opens the pane, and finds out what happened.
		const pane = createDiv();
		realLog.setLogOutput(pane);

		expect(pane.textContent).toContain("found 12 files");
		expect(pane.textContent).toContain("a link looks odd");
		expect(pane.textContent).toContain("the query is broken");
	});

	test("the buffer is drained, so re-opening the pane does not replay it", () => {
		const realLog = freshLog();
		realLog.log("only once");

		const first = createDiv();
		realLog.setLogOutput(first);
		const second = createDiv();
		realLog.setLogOutput(second);

		expect(first.textContent).toContain("only once");
		expect(second.textContent).not.toContain("only once");
	});

	test("with a target registered it still writes straight through", () => {
		const realLog = freshLog();
		const pane = createDiv();
		realLog.setLogOutput(pane);

		realLog.log("live entry");

		expect(pane.textContent).toContain("live entry");
	});

	test("echoes to the console too, for whoever has the dev tools open", () => {
		// The pane is the answer for a user; the console is the answer for the
		// bug report that says "nothing happened".
		freshLog().error("something broke early");

		expect(consoleError).toHaveBeenCalled();
		expect(consoleError.mock.calls.some(
			(call: unknown[]) => call.indexOf("something broke early") > -1
		)).toBe(true);
	});
});

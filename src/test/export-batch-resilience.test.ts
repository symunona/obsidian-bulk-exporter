/**
 * End-to-end regression tests for issue #17.
 *
 * These drive the real `exportSelection()` over a stub vault and a real
 * temp directory. The invariant they encode: a per-file error must never
 * escape the per-file loop - the export always completes, always writes every
 * file it can, and always reports the ones it dropped.
 *
 * Before the fix, one note holding `[[100% sure]]` threw a `URIError` that
 * aborted the loop, so every file after it was silently never written.
 *
 * @see https://github.com/symunona/obsidian-bulk-exporter/issues/17
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "fs";
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

const NOTE_COUNT = 10;
/** 0 based: the 4th note is the poisoned one, so 6 come after it. */
const BAD_INDEX = 3;

let outputFolder = "";

function settingsFor(folder: string): BulkExportSettings {
	return Object.assign({}, DEFAULT_SETTINGS, {
		outputFolder: folder,
		emptyTargetFolder: false,
		preserveWikiLinks: false,
		shell: "",
	});
}

function noteName(index: number) {
	return `note-${index}.md`;
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

/**
 * `NOTE_COUNT` notes, all but one perfectly ordinary.
 * @param badNote what the note at BAD_INDEX contains.
 */
function buildVault(badNote: string, folder: string) {
	const contents: { [path: string]: string } = {};
	const fileList: ExportMap = {};
	for (let i = 0; i < NOTE_COUNT; i++) {
		const path = noteName(i);
		contents[path] = i === BAD_INDEX ? badNote : `Just a [[normal note ${i}]] link.\n`;
		fileList[path] = exportPropertiesFor(path, folder);
	}
	return { contents, fileList };
}

function pluginFor(
	contents: { [path: string]: string },
	unreadable: Array<string> = []
): BulkExporterPlugin {
	return {
		app: {
			metadataCache: { getFirstLinkpathDest: () => null },
			vault: {
				adapter: {
					read: async (path: string) => {
						if (unreadable.indexOf(path) > -1) {
							throw new Error(`ENOENT: cannot read ${path}`);
						}
						return contents[path];
					},
				},
			},
		},
	} as unknown as BulkExporterPlugin;
}

function reportedFailures(): Array<ExportFailure> {
	return mockLoggedFailures[0] || [];
}

// The plugin also dumps failures to the developer console on purpose; that is
// signal for a user with the dev tools open, but noise in a test run.
let consoleError: jest.SpyInstance;
let consoleWarn: jest.SpyInstance;

beforeEach(() => {
	outputFolder = mkdtempSync(join(tmpdir(), "bulk-exporter-test-"));
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

describe("a note whose title holds a literal % (issue #17)", () => {
	test("does not abort the batch - every file is exported", async () => {
		const { contents, fileList } = buildVault(
			"Progress is [[100% sure]] today.\n",
			outputFolder
		);

		const result = await exportSelection(fileList, settingsFor(outputFolder), pluginFor(contents));

		expect(readdirSync(outputFolder).sort()).toEqual(
			Object.keys(fileList).sort()
		);
		expect(Object.keys(result).length).toBe(NOTE_COUNT);
		expect(reportedFailures()).toEqual([]);
	});

	test("the poisoned note itself is written out, with the link handled", async () => {
		const { contents, fileList } = buildVault(
			"Progress is [[100% sure]] today.\n",
			outputFolder
		);

		await exportSelection(fileList, settingsFor(outputFolder), pluginFor(contents));

		// Nothing in the vault resolves, so the link is stripped to its text -
		// but the note is exported, which is the whole point.
		expect(readFileSync(join(outputFolder, noteName(BAD_INDEX)), "utf-8"))
			.toBe("Progress is 100% sure today.\n");
	});

	test("the '%' earns a portability warning, not a skipped file", async () => {
		const { contents, fileList } = buildVault(
			"Progress is [[100% sure]] today.\n",
			outputFolder
		);

		await exportSelection(fileList, settingsFor(outputFolder), pluginFor(contents));

		const warnings = mockLogged.filter((entry) => entry.startsWith("[warn]"));
		expect(warnings.join("\n")).toContain("100% sure");
		expect(warnings.join("\n")).toContain("'%'");
		expect(readdirSync(outputFolder).length).toBe(NOTE_COUNT);
	});
});

describe("a file that genuinely cannot be exported", () => {
	test("is skipped, but the rest of the batch still goes out", async () => {
		const { contents, fileList } = buildVault("A normal note.\n", outputFolder);
		const plugin = pluginFor(contents, [noteName(BAD_INDEX)]);

		const result = await exportSelection(fileList, settingsFor(outputFolder), plugin);

		expect(readdirSync(outputFolder).length).toBe(NOTE_COUNT - 1);
		expect(readdirSync(outputFolder)).not.toContain(noteName(BAD_INDEX));
		// The files AFTER the failing one are the regression: they used to be lost.
		expect(readdirSync(outputFolder)).toContain(noteName(NOTE_COUNT - 1));
		expect(Object.keys(result).length).toBe(NOTE_COUNT);
	});

	test("is reported, naming the file and what went wrong", async () => {
		const { contents, fileList } = buildVault("A normal note.\n", outputFolder);
		const plugin = pluginFor(contents, [noteName(BAD_INDEX)]);

		await exportSelection(fileList, settingsFor(outputFolder), plugin);

		const failures = reportedFailures();
		expect(failures.length).toBe(1);
		expect(failures[0].exportProperties.from).toBe(noteName(BAD_INDEX));
		expect(failures[0].message).toContain("cannot read " + noteName(BAD_INDEX));

		expect(mockLogged.filter((entry) => entry.startsWith("[error]")).join("\n"))
			.toContain(noteName(BAD_INDEX));
	});

	test("the export still finishes: the log entry and the shell hook run", async () => {
		const { contents, fileList } = buildVault("A normal note.\n", outputFolder);
		const plugin = pluginFor(contents, [noteName(BAD_INDEX)]);

		await expect(
			exportSelection(fileList, settingsFor(outputFolder), plugin)
		).resolves.toBeDefined();

		expect(mockLoggedFailures.length).toBe(1);
		expect(mockLogged.join("\n")).toContain("Export took");
	});

	test("every single file failing still completes the export", async () => {
		const { contents, fileList } = buildVault("A normal note.\n", outputFolder);
		const plugin = pluginFor(contents, Object.keys(fileList));

		await exportSelection(fileList, settingsFor(outputFolder), plugin);

		expect(readdirSync(outputFolder)).toEqual([]);
		expect(reportedFailures().length).toBe(NOTE_COUNT);
	});
});

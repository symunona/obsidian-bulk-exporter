/**
 * End-to-end regression tests for issue #18 - "No export happening".
 *
 * The reporter's output format was `food/`: a bare folder, trailing slash, no
 * file name part. `path.parse("food/")` hands back `{ dir: "", base: "food" }`,
 * so the export believed its target directory was the export root itself,
 * never created `<root>/food`, and the first `writeFileSync` died of ENOENT.
 * Every single file failed. The log stopped after "Export to ...".
 *
 * These drive the real `createPathMap()` (so the template is genuinely
 * evaluated) into the real `exportSelection()` over a real temp directory.
 *
 * @see https://github.com/symunona/obsidian-bulk-exporter/issues/18
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { ExportFailure } from "../export/export-log";
import { BulkExportSettings, DEFAULT_SETTINGS } from "../models/bulk-export-settings";
import { ExportMap } from "../models/export-properties";
import type BulkExporterPlugin from "../main";
import type { SMarkdownPage } from "obsidian-dataview/lib/data-model/serialized/markdown";
import type { Link } from "obsidian-dataview/lib/data-model/value";

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
// only exist inside the app.
jest.mock("../export/export-log", () => ({
	exportedLogEntry: (
		outputPathMap: unknown,
		plugin: unknown,
		failures: Array<ExportFailure> = []
	) => { mockLoggedFailures.push(failures) },
}));

import { exportSelection, getGroups } from "../export/exporter";
import { createPathMap, outputFormatWarning } from "../utils/indexing/create-path-map";

const NOTE_COUNT = 4;

let outputFolder = "";

function settingsFor(folder: string, outputFormat: string): BulkExportSettings {
	return Object.assign({}, DEFAULT_SETTINGS, {
		outputFolder: folder,
		outputFormat,
		emptyTargetFolder: false,
		preserveWikiLinks: false,
		shell: "",
	});
}

function noteName(index: number) {
	return `note-${index}`;
}

/**
 * A dataview page as this plugin consumes it: the flattened "implicit fields"
 * shape (`path`, `mtime`), with `mtime` answering both `.ts` (create-path-map)
 * and `.toMillis()` (exporter).
 */
function pageFor(index: number, frontMatter: Record<string, unknown>) {
	const stamp = { ts: 0, toMillis: () => 0 };
	return {
		path: noteName(index) + ".md",
		frontmatter: frontMatter,
		ctime: stamp,
		mtime: stamp,
	} as unknown as SMarkdownPage;
}

/**
 * `NOTE_COUNT` ordinary notes, run through the real path map with the given
 * output format - exactly what `searchFilesToExport()` does.
 */
function buildVault(
	settings: BulkExportSettings,
	frontMatter: Record<string, unknown> = {}
) {
	const contents: { [path: string]: string } = {};
	const queryResults: Array<[Link, SMarkdownPage]> = [];
	for (let i = 0; i < NOTE_COUNT; i++) {
		contents[noteName(i) + ".md"] = `Note number ${i}.\n`;
		// createPathMap ignores the Link half of the row.
		queryResults.push([{} as unknown as Link, pageFor(i, frontMatter)]);
	}
	const fileList: ExportMap = createPathMap(queryResults, settings);
	return { contents, fileList };
}

function pluginFor(contents: { [path: string]: string }): BulkExporterPlugin {
	return {
		app: {
			metadataCache: { getFirstLinkpathDest: () => null },
			vault: { adapter: { read: async (path: string) => contents[path] } },
		},
	} as unknown as BulkExporterPlugin;
}

function reportedFailures(): Array<ExportFailure> {
	return mockLoggedFailures[0] || [];
}

/** Every exported note, as paths relative to the export root. */
function exported(dir: string = outputFolder, prefix = ""): Array<string> {
	const ret: Array<string> = [];
	readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
		const relative = prefix + entry.name;
		if (entry.isDirectory()) {
			ret.push(...exported(join(dir, entry.name), relative + "/"));
		} else {
			ret.push(relative);
		}
	});
	return ret.sort();
}

let consoleError: jest.SpyInstance;
let consoleWarn: jest.SpyInstance;

beforeEach(() => {
	outputFolder = mkdtempSync(join(tmpdir(), "bulk-exporter-paths-"));
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

async function exportWith(
	outputFormat: string,
	frontMatter: Record<string, unknown> = {}
) {
	const settings = settingsFor(outputFolder, outputFormat);
	const { contents, fileList } = buildVault(settings, frontMatter);
	await exportSelection(fileList, settings, pluginFor(contents));
	return fileList;
}

describe("an output format naming only a folder (issue #18)", () => {
	test("'food/' exports every note into <root>/food/", async () => {
		await exportWith("food/");

		expect(exported()).toEqual([
			"food/note-0.md",
			"food/note-1.md",
			"food/note-2.md",
			"food/note-3.md",
		]);
		expect(reportedFailures()).toEqual([]);
		expect(readFileSync(join(outputFolder, "food", "note-2.md"), "utf-8"))
			.toBe("Note number 2.\n");
	});

	test("nested 'food/blog/' works the same way", async () => {
		await exportWith("food/blog/");

		expect(exported()).toEqual([
			"food/blog/note-0.md",
			"food/blog/note-1.md",
			"food/blog/note-2.md",
			"food/blog/note-3.md",
		]);
		expect(reportedFailures()).toEqual([]);
	});

	test("the folder still groups as one folder in the log and preview", async () => {
		const fileList = await exportWith("food/");

		expect(Object.keys(getGroups(fileList))).toEqual(["food"]);
		expect(fileList["note-0.md"].toRelativeToExportDirRoot).toBe("food");
		expect(fileList["note-0.md"].newFileName).toBe("note-0");
		expect(fileList["note-0.md"].toRelative).toBe(join("food", "note-0.md"));
	});

	test("an empty output format falls back to the note's own name", async () => {
		await exportWith("");

		expect(exported()).toEqual([
			"note-0.md",
			"note-1.md",
			"note-2.md",
			"note-3.md",
		]);
	});

	test("the log says what it did with the trailing slash", async () => {
		await exportWith("food/");

		const warnings = mockLogged.filter((entry) => entry.startsWith("[warn]"));
		expect(warnings.join("\n")).toContain("only names a folder");
	});
});

describe("output formats that already worked", () => {
	test("'food/${fileName}' - the documented control - still works", async () => {
		await exportWith("food/${fileName}");

		expect(exported()).toEqual([
			"food/note-0.md",
			"food/note-1.md",
			"food/note-2.md",
			"food/note-3.md",
		]);
		expect(reportedFailures()).toEqual([]);
	});

	test("deep nesting '${a}/${b}/${c}' lands where it says", async () => {
		const fileList = await exportWith("${a}/${b}/${c}", {
			a: "blog",
			b: "2026",
			c: "post",
		});

		// Every note evaluates to the same path here, so this documents the
		// nesting, not the file count.
		expect(exported()).toEqual(["blog/2026/post.md"]);
		expect(fileList["note-0.md"].toRelativeToExportDirRoot)
			.toBe(join("blog", "2026"));
		expect(reportedFailures()).toEqual([]);
	});
});

describe("an output format with no ${...} in it at all", () => {
	// Deliberately NOT changed: "food" is a valid, if useless, file name, and
	// guessing that the user meant a folder would silently move everybody's
	// output. It is loud instead - see the warning assertion below and the
	// settings tab, which shows the same sentence while it is being typed.
	test("collapses every note onto one file - documented, not fixed", async () => {
		await exportWith("food");

		expect(exported()).toEqual(["food.md"]);
		expect(readFileSync(join(outputFolder, "food.md"), "utf-8"))
			.toBe(`Note number ${NOTE_COUNT - 1}.\n`);
		expect(existsSync(join(outputFolder, "food"))).toBe(false);
	});

	test("is warned about in the export log", async () => {
		await exportWith("food");

		const warnings = mockLogged.filter((entry) => entry.startsWith("[warn]"));
		expect(warnings.join("\n")).toContain("overwrite each other");
	});
});

describe("outputFormatWarning - what the settings tab shows", () => {
	test("flags an empty format", () => {
		expect(outputFormatWarning("")).toContain("is empty");
		expect(outputFormatWarning("   ")).toContain("is empty");
	});

	test("flags a folder-only format", () => {
		expect(outputFormatWarning("food/")).toContain("only names a folder");
		expect(outputFormatWarning("${blog}/")).toContain("only names a folder");
	});

	test("flags a format that has no expression in it", () => {
		expect(outputFormatWarning("food")).toContain("overwrite each other");
	});

	test("says nothing about a sane format", () => {
		expect(outputFormatWarning("${blog}/${slug}")).toBeNull();
		expect(outputFormatWarning("food/${fileName}")).toBeNull();
	});
});

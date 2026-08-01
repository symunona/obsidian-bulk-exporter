import { BulkExportSettings } from "../../models/bulk-export-settings";
import path, { basename, join } from "path";
import normalizeFileName from "../normalize-file-name";
import { ExportMap, ExportProperties } from "src/models/export-properties";
import { error } from "../log";
import ScopedEval from "scoped-eval";
import { Link, SMarkdownPage } from "obsidian-dataview";

/**
 * `obsidian-dataview`'s shipped `.d.ts` files re-export their public types
 * (`SMarkdownPage`, `Link`, ...) from bare specifiers like `"api/plugin-api"`
 * instead of relative paths. Those only resolve inside the package's own
 * build, so from this project every type that flows through them is an
 * unchecked/error type - `fileDescriptor.path`, `.frontmatter` etc. all come
 * back as `any` no matter how the value is declared. This interface
 * documents, honestly, the subset of the real Dataview page shape this
 * module reads (see `obsidian-dataview`'s
 * `data-model/serialized/markdown.d.ts`), so the rest of the file can be
 * typed normally.
 */
interface DataviewFileDescriptor {
	path: string;
	frontmatter: Record<string, unknown>;
	// Dataview exposes these as luxon DateTime instances; `.ts` is the epoch
	// millisecond value, which is what `getDateKeys` consumes.
	ctime: { ts: number };
	mtime: { ts: number };
}

/**
 * Casts a Dataview page down to the fields this module actually reads.
 * `SMarkdownPage` itself can't be checked here (see above), so this is a
 * plain assertion rather than a runtime-validated narrowing - the shape is
 * guaranteed by the Dataview API, not user-controlled.
 */
function asFileDescriptor(page: SMarkdownPage): DataviewFileDescriptor {
	return page as DataviewFileDescriptor;
}

/**
 * From a DataView query results, it creates an output map, running
 * the output transformation.
 */
export function createPathMap(
	queryResults: Array<[Link, SMarkdownPage]>,
	settings: BulkExportSettings
): ExportMap {
	const foundFileMap: { [key: string]: ExportProperties } = {};
	const targetRoot = settings.outputFolder || '';

	queryResults.map(([, page]) => {
		const fileDescriptor = asFileDescriptor(page);

		try {
			const {targetPath} = getTargetPaths(page, settings);
			const newFileName = basename(targetPath);
			const extension = fileDescriptor.path.substring(fileDescriptor.path.lastIndexOf('.'))

			const newExportPropertyItem: ExportProperties = {
				file: fileDescriptor,
				frontMatter: fileDescriptor.frontmatter,
				from: fileDescriptor.path,
				newFileName: newFileName,
				toAbsoluteFs: join(targetRoot, targetPath + extension),
				toRelative: targetPath + extension,
				md5: "",
				content: "",
				outputContent: "",
				toRelativeToExportDirRoot: path.parse(targetPath).dir,
				lastExportDate: 0,
			};
			foundFileMap[fileDescriptor.path] = newExportPropertyItem;
		} catch (e) {
			console.error(e);
			error("File Export Error: ", fileDescriptor.path);
		}
	});
	return foundFileMap;
}

/**
 * Figure out what should be the output settings from the settings.
 * Each file comes with front-matter data, which gets merged together,
 * with some helper functions like created (date) and modified (date).
 * There are also helper functions that can be used like:
 * d(dateObj) - which will return a moment-style a key-map (see below) - or
 * norm(string) - which will remove all "weird" characters and replace spaces with dashes.
 *
 * @param fileDescriptor
 * @param settings
 * @returns
 */
function getTargetPaths(
	fileDescriptor: SMarkdownPage,
	settings: BulkExportSettings
): { targetPath: string } {
	// Populate an object with all the properties
	const fileMetaData: { [key: string]: string } = {};
	// Cast once here rather than at each call site (see the module-level note
	// on why `SMarkdownPage` can't be resolved).
	const descriptor = asFileDescriptor(fileDescriptor);
	const filePath = descriptor.path;

	// Arbitrary user front-matter, hence the `unknown` values.
	Object.assign(fileMetaData, descriptor.frontmatter);

	Object.assign(fileMetaData, {
		created: getDateKeys(descriptor.ctime.ts),
		modified: getDateKeys(descriptor.mtime.ts),

		fileName: path.parse(filePath).name,

		// Use it like this: ${norm(someMetaData)} - will replace every separator
		// character with a dash (-).
		norm: normalizeFileName,
		baseName: basename(filePath),
		slug:
			fileMetaData.slug ||
			normalizeFileName(fileMetaData.title) ||
			normalizeFileName(path.parse(filePath).name),
	});

	// Magic date conversion function, so it's easy to convert metadata dates
	// to strings and basic formats e.g. ${d(date_published).dateY}
	Object.assign(fileMetaData, { d: getDateKeys });

	// Serious black magic here: use the outputFormat string to evaluate.
	try {
		const scopedEval = new ScopedEval();
		const targetPath: unknown = scopedEval.eval(
			"`" + settings.outputFormat + "`",
			fileMetaData
		);
		if (typeof targetPath !== "string") {
			// A backtick-wrapped template literal always evaluates to a
			// string; this only trips if `scoped-eval` itself misbehaves.
			throw new Error(
				`Output format did not evaluate to a string: ${settings.outputFormat}`
			);
		}
		return {
			targetPath,
			// relativeRoot: scopedEval.eval("`" + settings.relativeFileRoot + "`", fileMetaData)
		}
	} catch (e) {
		console.error(e);
		error(e);
		throw e
	}
}

/**
 * Create a simple "format object" that is easy to be used in a string literal.
 * @param randomDateFormat
 * @returns
 */
function getDateKeys(randomDateFormat: Date | number): {
	[key: string]: string;
} {
	const ret: { [key: string]: string } = {};
	const date = new Date(randomDateFormat);
	ret.YYYY = String(date.getFullYear());
	ret.YY = ret.YYYY.substring(2);
	ret.M = String(date.getMonth()+1);
	ret.MM = ret.M.padStart(2, "0");
	ret.D = String(date.getDate());
	ret.DD = String(date.getDate()).padStart(2, "0");
	ret.h = String(date.getHours());
	ret.hh = String(date.getHours()).padStart(2, "0");
	ret.m = String(date.getMinutes());
	ret.mm = String(date.getMinutes()).padStart(2, "0");
	ret.s = String(date.getSeconds());
	ret.ss = String(date.getSeconds()).padStart(2, "0");

	ret.date = `${ret.YYYY}-${ret.MM}-${ret.DD}`;
	ret.time = `${ret.hh}-${ret.mm}`;

	return ret;
}

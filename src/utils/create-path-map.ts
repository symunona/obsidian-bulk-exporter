import { BulkExportSettings } from "../models/bulk-export-settings";
import path, { basename, join } from "path";
import normalizeFileName from "./normalize-file-name";
import { ExportMap, ExportProperties } from "src/models/export-properties";
import { error } from "./log";
import ScopedEval from "scoped-eval";
import { SMarkdownPage } from "obsidian-dataview";

/**
 * From a DataView query results, it creates an output map, running
 * the output transformation.
 */
export function createPathMap(
	queryResults: Array<[any, SMarkdownPage]>,
	settings: BulkExportSettings
): ExportMap {
	const foundFileMap: { [key: string]: ExportProperties } = {};
	const targetRoot = settings.outputFolder;

	queryResults.map(([link, fileDescriptor]) => {

		try {
			const targetPath = getTargetPath(fileDescriptor, settings);

			const newFileName = basename(targetPath);
			const extension = fileDescriptor.path.substring(fileDescriptor.path.lastIndexOf('.'))

			const newExportPropertyItem: ExportProperties = {
				file: fileDescriptor,
				frontMatter: fileDescriptor.frontmatter,
				from: fileDescriptor.path,
				newFileName: newFileName,
				to: join(targetRoot, targetPath + "." + extension),
				toRelative: targetPath + "." + extension,
				md5: "",
				content: "",
				toRelativeDir: path.parse(targetPath).dir,
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
function getTargetPath(
	fileDescriptor: SMarkdownPage,
	settings: BulkExportSettings
) {
	// Populate an object with all the properties
	const fileMetaData: { [key: string]: string } = {};

	// @ts-ignore - any front-matter data
	Object.assign(fileMetaData, fileDescriptor.frontmatter);

	Object.assign(fileMetaData, {
		// @ts-ignore
		created: getDateKeys(fileDescriptor.ctime.ts),
		// @ts-ignore
		modified: getDateKeys(fileDescriptor.mtime.ts),

		fileName: path.parse(fileDescriptor.path).name,

		// Use it like this: ${norm(someMetaData)} - will replace every separator
		// character with a dash (-).
		norm: normalizeFileName,
		baseName: basename(fileDescriptor.path),
		slug:
			fileMetaData.slug ||
			normalizeFileName(fileMetaData.title) ||
			normalizeFileName(path.parse(fileDescriptor.path).name),
	});

	// Magic date conversion function, so it's easy to convert metadata dates
	// to strings and basic formats e.g. ${d(date_published).dateY}
	Object.assign(fileMetaData, { d: getDateKeys });

	// Serious black magic here: use the outputFormat string to evaluate.
	try {
		const scopedEval = new ScopedEval();
		return scopedEval.eval("`" + settings.outputFormat + "`", fileMetaData);
	} catch (e) {
		console.error(e);
		error(e);
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

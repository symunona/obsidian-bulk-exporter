import { Scope, TAbstractFile } from "obsidian";
import { BulkExportSettings } from "../models/bulk-export-settings";
import path, { basename, join } from "path";
import normalizeFileName from "./normalize-file-name";
import { ExportMap, ExportProperties } from "src/models/export-properties";
import { error } from "./log";
import ScopedEval from "scoped-eval";

export function createPathMap(
	queryResults: Array<any>,
	settings: BulkExportSettings
): ExportMap {
	const foundFileMap: { [key: string]: ExportProperties } = {};
	const targetRoot = settings.outputFolder;

	queryResults.map((item) => {
		// let groupByValue = "";

		const fileDescriptor = item[1];
		// if (settings.groupBy) {
		// 	groupByValue =
		// 		(fileDescriptor.frontmatter &&
		// 			fileDescriptor.frontmatter[settings.groupBy]) ||
		// 		"";
		// }

		if (fileDescriptor instanceof TAbstractFile) {
			throw new Error(
				"fileDescriptor returned from dataview api is not a TAbstractFile"
			);
		}

		try {
			const targetPath = getTargetPath(fileDescriptor, settings);

			console.warn("t", targetPath);

			const newFileName = basename(targetPath);

			const newExportPropertyItem: ExportProperties = {
				file: fileDescriptor,
				from: fileDescriptor.path,
				newFileName: newFileName,
				to: join(targetRoot, targetPath + "." + fileDescriptor.ext),
				toRelative: targetPath + "." + fileDescriptor.ext,
				md5: "",
				content: "",
				toRelativeDir: path.parse(targetPath).dir,
				lastExportDate: 0,
			};
			foundFileMap[item[1].path] = newExportPropertyItem;
		} catch (e) {
			console.error(e);
			error("File Export Error: ", fileDescriptor.path);
		}
	});
	return foundFileMap;
}

function getTargetPath(
	fileDescriptor: TAbstractFile,
	settings: BulkExportSettings
) {
	if (settings.outputFormat) {
		// Populate an object with all the properties
		const fileMetaData: { [key: string]: string } = {};

		// @ts-ignore - any front-matter data
		Object.assign(fileMetaData, fileDescriptor.frontmatter);

		Object.assign(fileMetaData, {
			// @ts-ignore
			created: getDateKeys(fileDescriptor.ctime),
			// @ts-ignore
			modified: getDateKeys(fileDescriptor.mtime),

			// Use it like this: ${norm(someMetaData)} - will replace every separator
			// character with a dash (-).
			norm: normalizeFileName,
			baseName: basename(fileDescriptor.path),
			slug:
				fileMetaData.slug ||
				normalizeFileName(fileMetaData.title) ||
				normalizeFileName(basename(fileDescriptor.path)),
		});

		// Magic date conversion function, so it's easy to convert metadata dates
		// to strings and basic formats e.g. ${d(date_published).dateY}
		Object.assign(fileMetaData, { d: getDateKeys });

		// Serious black magic here: use the outputFormat string to evaluate.
		try {
			const scopedEval = new ScopedEval();
			return scopedEval.eval(
				"`" + settings.outputFormat + "`",
				fileMetaData
			);
		} catch (e) {
			console.error(e);
			error(e);
		}
	} else {
		let outPath = "";

		const fileMetaData: { [key: string]: string } =
			// @ts-ignore
			fileDescriptor.frontmatter;

		// Convert the file name to a web-friendly slug.
		// If there is a slug property or a title property, use these, otherwise
		// fall back to the file name.
		if (settings.smartSlug) {
			if ((fileMetaData && fileMetaData.slug) || fileMetaData.title) {
				outPath = fileMetaData.slug || fileMetaData.title;
			}
			outPath = normalizeFileName(outPath);
		}
		return outPath;
	}
}

function getDateKeys(randomDateFormat: Date | number): {
	[key: string]: string;
} {
	const ret: { [key: string]: string } = {};
	const date = new Date(randomDateFormat);
	ret.YYYY = String(date.getFullYear());
	ret.YY = ret.YYYY.substring(2);
	ret.M = String(date.getMonth());
	ret.MM = String(date.getMonth()).padStart(2, "0");
	ret.D = String(date.getDay());
	ret.DD = String(date.getDay()).padStart(2, "0");
	ret.h = String(date.getHours());
	ret.hh = String(date.getHours()).padStart(2, "0");
	ret.m = String(date.getMinutes());
	ret.mm = String(date.getMinutes()).padStart(2, "0");
	ret.s = String(date.getSeconds());
	ret.ss = String(date.getSeconds()).padStart(2, "0");

	ret.date = `${ret.MM}-${ret.DD}`;
	ret.dateY = `${ret.YYYY}-${ret.MM}-${ret.DD}`;
	ret.time = `${ret.hh}-${ret.mm}`;

	return ret;
}

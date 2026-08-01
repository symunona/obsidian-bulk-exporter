/**
 * Find files with DataView's API, organize exports.
 */
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { Notice, TFile } from "obsidian";

import { error, log, warn } from "src/utils/log";

import { normalizeQuery } from "src/utils/normalize-query";
import { createPathMap } from "src/utils/indexing/create-path-map";
import BulkExporterPlugin from "src/main";
import { Md5 } from "ts-md5";
import { FileListItemWrapper } from "src/ui/file-list-export-indicator";
import {
	ExportGroupMap,
	ExportMap,
	ExportProperties,
} from "src/models/export-properties";
import { ExportFailure, exportedLogEntry } from "./export-log";
import { unsafeCharacterWarning } from "./unsafe-characters";
import { join, normalize } from "path";
import { runShellCommand } from "src/utils/shell-runner";
import { getDataViewApi } from "src/utils/data-view-api";
// `obsidian-dataview`'s package root (`obsidian-dataview/lib/index.d.ts`) re-exports its
// types via non-relative specifiers (e.g. `from "data-model/value"`) that only resolve
// inside dataview's own build, not against this project's `baseUrl`. Importing from the
// package root therefore yields unresolved ("error") types everywhere. Deep-importing the
// concrete declaration files below sidesteps that and gives real, checked types for the
// shapes this file touches.
import type { SMarkdownPage } from "obsidian-dataview/lib/data-model/serialized/markdown";
import type { Link } from "obsidian-dataview/lib/data-model/value";
import type { Result } from "obsidian-dataview/lib/api/result";
import { collectAssetsReplaceLinks } from "./collect-assets";
import { sortBy } from "underscore";
import { BulkExportSettings } from "src/models/bulk-export-settings";
import { rmDirContent } from "src/utils/delete-folder-content";

/**
 * Luxon (a dataview dependency) ships no type declarations and `@types/luxon` isn't
 * installed, so `SMarkdownPage.file.mtime` resolves to an unresolved type. This captures
 * only the bit of the real `DateTime` API this file relies on.
 */
interface LuxonDateTimeLike {
	toMillis(): number;
}

/**
 * Dataview also mirrors `file.*` metadata directly onto the page object itself, as a
 * convenience shorthand (e.g. `page.path` for `page.file.path`); see the dataview docs on
 * "implicit fields". This plugin relies on that flattened shape throughout (see also
 * create-path-map.ts and the test-vault.ts fixture), which the vendor's own
 * `SMarkdownPage` interface only models nested under `.file`.
 */
interface DataviewPage extends SMarkdownPage {
	path: string;
	mtime: LuxonDateTimeLike;
}

/**
 * The row shape produced by the queries this plugin runs against dataview: a `TABLE`
 * query selecting a link and its matching page (consumed by `createPathMap`).
 */
type DataviewTableRow = [Link, DataviewPage];

interface DataviewTableQueryResult {
	type: "table";
	values: DataviewTableRow[];
}

/** Minimal surface of `DataviewApi` this file calls. */
interface DataviewQueryApi {
	query(source: string): Promise<Result<DataviewTableQueryResult, string>>;
}

export class Exporter {
	plugin: BulkExporterPlugin;

	display: FileListItemWrapper;

	constructor(plugin: BulkExporterPlugin) {
		this.plugin = plugin;
		this.display = new FileListItemWrapper(plugin);
	}


	async searchAll(): Promise<Array<{setting: BulkExportSettings, results: ExportMap}>>{
		const ret = []
		for (let item = 0; item < this.plugin.settings.items.length; item++){
			const setting = this.plugin.settings.items[item];
			ret.push({
				results: await this.searchFilesToExport(setting),
				setting
			})
		}
		return ret
	}

	async searchAndExportAll(){
		const ret = []
		for (let item = 0; item < this.plugin.settings.items.length; item++){
			const setting = this.plugin.settings.items[item];
			ret.push({
				results: await this.searchAndExport(setting),
				setting
			})
		}
		return ret
	}

	registerUpdates() {
		this.plugin.registerEvent(
			this.plugin.app.metadataCache.on(
				// @ts-ignore
				"dataview:metadata-change",
				(type: string, file: TFile) => {
					// `type`/`file` come through the generic `Events.on` fallback overload
					// (see the `@ts-ignore` above). The dataview plugin fires this event
					// with the underlying Obsidian `TFile`, not one of its own `SMarkdownPage`
					// wrappers, so that's the honest type here.
					this.plugin.settings.items.forEach((setting) => {
						// If this was already a file, see if it got updated!
						const previouslyExported =
							setting.lastExport[file.path];
						if (previouslyExported) {
							// we are updating this.
							this.display.updateElementStatus(previouslyExported, setting);
						} else {
							// File is not yet added to the list. This can be due
							// to not matching the filter in the previous search.
							// If a user is adding new metadata, we COULD match
							// that against a DataView filter, but I did not yet look into that.
							// One way could be to do the full search, and see if it's
							// in the map, but I find that too wasteful.
							// For now, if the user clicks on the Preview,
							// we do the search again, which updates the sidebar too.
							// This is good enough for me, but feel free to contribute :)
						}
					})

				}
			)
		);
	}

	/**
	 * 1.- Finds all the files that are matching our filter in settings.
	 * 2.- Updates file-explorer plugin with the proper exported status icons.
	 * @returns
	 */
	async searchFilesToExport(settings: BulkExportSettings): Promise<ExportMap> {
		// `getDataViewApi()` is typed via dataview's broken package-root re-exports (see the
		// note above); cast to the honest, deep-imported `DataviewQueryApi` shape this file
		// actually relies on.
		const dataViewApi = getDataViewApi() as DataviewQueryApi
		if (dataViewApi) {
			const initialQuery = normalizeQuery(
				settings.exportQuery
			);
			const data = await dataViewApi.query(initialQuery);

			if (data.successful) {
				const exportFileMap = createPathMap(
					data.value.values,
					settings
				);
				log(
					`Found ${data.value.values.length} files for`,
					` filter: '${settings.exportQuery}'`,
					` organized by: '${settings.outputFormat}'`
				);

				if (data.value && data.value.type === "table") {
					await this.display.applyStatusIcons(exportFileMap, settings);

					return exportFileMap;
				} else {
					throw new Error("[Bulk Exporter]: return type error");
				}
			}
			error(`[Bulk Exporter] Error in Query: "${initialQuery}"`);
			error(data.error)
			console.error(data)
			throw new Error("[Bulk Exporter] Query Error");
		} else {
			new Notice("Meta-dataview needs dataview plugin to be installed.");
			error("[Bulk Exporter] Dataview plugin to be installed.");
			throw new Error("Dataview plugin to be installed.");
		}
	}
	async searchAndExport(settings: BulkExportSettings) {
		const results = await this.searchFilesToExport(settings);
		// Uncomment this for the actual object info!
		// console.warn("Found files to export: ", results);
		let toBeExported : ExportMap = {}
		if (settings.isPublishedField) {
			Object.keys(results).map(path => {
				const fileMetaData = results[path].frontMatter;
				if (fileMetaData[settings.isPublishedField]) {
					toBeExported[path] = results[path]
				}
			})
		} else {
			toBeExported = results;
		}

		const lastExport = await exportSelection(
			toBeExported,
			settings,
			this.plugin
		);

		// Save the export properties, but do not save the whole content, just the MD5 hash.
		Object.keys(lastExport).forEach((absoluteFilePath)=>{
			const exportProperties = lastExport[absoluteFilePath]
			exportProperties.content = "";
			exportProperties.outputContent = "";
			exportProperties.file = undefined;
		})

		// Save the last export map so we can see what's already exported.
		settings.lastExport = lastExport
		// console.warn(settings.name, lastExport)

		await this.plugin.saveSettings();
		await this.display.applyStatusIcons(settings.lastExport, settings);
		return results
	}
}

/**
 * Collects all the separate export folders.
 * @param fileMap
 * @returns
 */
export function getGroups(
	fileMap: ExportMap
): ExportGroupMap {
	const ret: { [key: string]: Array<ExportProperties> } = {}

	Object.keys(fileMap).forEach((filePath) => {
		const dir = fileMap[filePath].toRelativeToExportDirRoot;
		if (!ret[dir]) { ret[dir] = [] }
		ret[dir].push(fileMap[filePath])
	})

	Object.keys(ret).forEach((pathGroup) => {
		ret[pathGroup] = sortBy(ret[pathGroup], 'newFileName')
	})
	return ret
}

/**
 * Takes the currently viewed elements, and exports them.
 */
export async function exportSelection(
	fileList: ExportMap,
	settings: BulkExportSettings,
	plugin: BulkExporterPlugin
): Promise<ExportMap> {
	const start = new Date();
	// Check if target directory exists
	const outputFolder = settings.outputFolder;
	const outputPathMap: { [path: string]: Array<ExportProperties> } = {}
	log("=============================");
	log("Export to " + outputFolder);

	if (!existsSync(outputFolder)) {
		mkdirSync(outputFolder, { recursive: true });
		log("Created new target folder: " + outputFolder);
	}

	// If emptying target folder is set, remove all files and folders within.
	if (settings.emptyTargetFolder) {
		rmDirContent(settings.outputFolder, settings.emptyTargetFolderIgnore)
	}

	const failures: Array<ExportFailure> = [];

	for (const fileIndex in fileList) {
		const exportProperties = fileList[fileIndex];
		// One unexportable file must never take the rest of the batch down with it.
		// Before this, a single throw in here (a `URIError` from a '%' in a note
		// title, say) aborted the loop, and with it every remaining file, the log
		// entry, the shell hook and the status icon refresh - with no clue as to
		// what had happened or which files never made it out.
		// @see https://github.com/symunona/obsidian-bulk-exporter/issues/17
		try {
			await convertAndCopy(
				outputFolder,
				exportProperties,
				fileList,
				settings,
				plugin
			);

			// `ExportProperties.file` is declared as dataview's (broken-typed) `SMarkdownPage`
			// in export-properties.ts; cast to our honestly-resolved type here.
			const exportedFile = exportProperties.file as DataviewPage | undefined;
			exportProperties.lastExportDate = new Date(
				exportedFile?.mtime.toMillis() ?? NaN
			).getTime();

			outputPathMap[exportProperties.toRelativeToExportDirRoot] = outputPathMap[exportProperties.toRelativeToExportDirRoot] || []
			outputPathMap[exportProperties.toRelativeToExportDirRoot].push(exportProperties)
		} catch (e) {
			failures.push(collectExportFailure(exportProperties, e));
			continue;
		}

		// Advice about the file we just wrote - so it must not be able to fail
		// the export it is advising on, nor the batch around it.
		try {
			warnAboutUnsafeCharacters(exportProperties);
		} catch (e) {
			console.warn("[Bulk Exporter] Could not check", exportProperties.from, e);
		}
	}

	exportedLogEntry(outputPathMap, plugin, failures)

	if (failures.length) {
		new Notice(
			`Bulk Export: ${failures.length} of ${Object.keys(fileList).length} ` +
			`file(s) could not be exported. See the export log for details.`
		);
	}

	if (settings.shell && settings.shell.trim()) {
		log('Starting shell script ', settings.shell)
		const shellStart = new Date()
		await runShellCommand(settings.shell)
		log('Finished shell script! ', (new Date().getTime() - shellStart.getTime()) / 1000, 's')
	}

	new Notice("Exported to " + outputFolder);
	log(
		`Export took ${(new Date().getTime() - start.getTime()) / 1000
		}s to ` + outputFolder
	);

	return fileList;
}

/**
 * Turns whatever `convertAndCopy` threw into a reportable record, blaming the
 * link that caused it when `replaceLocalLinks` managed to pin one down.
 */
function collectExportFailure(
	exportProperties: ExportProperties,
	thrown: unknown
): ExportFailure {
	const message = thrown instanceof Error
		? `${thrown.name}: ${thrown.message}`
		: String(thrown);

	// `linkStats` is populated before the links are processed, so it is there
	// even when processing them is what blew up.
	const links = (exportProperties.linkStats || [])
		.filter((link) => link.status === "error");

	console.error("[Bulk Exporter] Could not export", exportProperties.from, thrown);
	error(`Could not export ${exportProperties.from}: ${message}`);

	return { exportProperties, message, links };
}

/**
 * Advisory only: point out file names and links that hold characters which are
 * not portable across file systems and static site generators. Never skips the
 * file, never fails the export - it is a hint, not a rule.
 */
function warnAboutUnsafeCharacters(exportProperties: ExportProperties) {
	const fileNameWarning = unsafeCharacterWarning(exportProperties.from);
	if (fileNameWarning) {
		warn("File name: " + fileNameWarning);
	}

	const linksAndAttachments = exportProperties.linksAndAttachments;
	if (!linksAndAttachments) { return }

	const alreadyWarned: { [name: string]: boolean } = {};
	const internalTargets = linksAndAttachments.internalLinks
		.concat(linksAndAttachments.internalAttachments);

	internalTargets.forEach((link) => {
		const name = link.normalizedOriginalPath;
		if (alreadyWarned[name]) { return }
		alreadyWarned[name] = true;
		const linkWarning = unsafeCharacterWarning(name);
		if (linkWarning) {
			warn(`Link in "${exportProperties.from}": ` + linkWarning);
		}
	});
}

export async function convertAndCopy(
	rootPath: string,
	fileExportProperties: ExportProperties,
	allFileListMap: ExportMap,
	settings: BulkExportSettings,
	plugin: BulkExporterPlugin
) {
	const targetDir = join(normalize(rootPath), fileExportProperties.toRelativeToExportDirRoot);
	// `ExportProperties.file` is declared as dataview's (broken-typed) `SMarkdownPage`
	// in export-properties.ts; cast to our honestly-resolved type here.
	const fileDescriptor = fileExportProperties.file as DataviewPage | undefined;

	if (!existsSync(targetDir)) {
		mkdirSync(targetDir, { recursive: true });
	}
	if (!fileDescriptor) { throw new Error('Null Error') }

	const fileContent = await plugin.app.vault.adapter.read(fileDescriptor.path);
	fileExportProperties.outputContent = fileExportProperties.content = fileContent;

	fileExportProperties.md5 = Md5.hashStr(fileContent);

	// This populates fileExportProperties.outputContent
	await collectAssetsReplaceLinks(fileExportProperties, allFileListMap, settings, plugin);

	writeFileSync(
		fileExportProperties.toAbsoluteFs,
		fileExportProperties.outputContent,
		"utf-8"
	);

	return fileExportProperties;
}


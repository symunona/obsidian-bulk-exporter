/**
 * Find files with DataView's API, organize exports.
 */
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { Notice } from "obsidian";

import { error, log } from "src/utils/log";

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
import { exportedLogEntry } from "./export-log";
import { join, normalize } from "path";
import { runShellCommand } from "src/utils/shell-runner";
import { getDataViewApi } from "src/utils/data-view-api";
import { SMarkdownPage } from "obsidian-dataview";
import { collectAssetsReplaceLinks } from "./collect-assets";
import { sortBy } from "underscore";
import { BulkExportSettings } from "src/models/bulk-export-settings";
import { rmDirContent } from "src/utils/delete-folder-content";

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
				(type: string, file: SMarkdownPage) => {
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
		const dataViewApi = getDataViewApi()
		if (dataViewApi) {
			const initialQuery = normalizeQuery(
				settings.exportQuery
			);
			const data = await dataViewApi.query(initialQuery);

			if (data.successful) {
				const exportFileMap = createPathMap(
					// @ts-ignore
					data.value.values,
					settings
				);
				log(
					`Found ${data.value.values.length} files for`,
					` filter: '${settings.exportQuery}'`,
					` organized by: '${settings.outputFormat}'`
				);

				if (data.value && data.value.type === "table") {
					this.display.applyStatusIcons(exportFileMap, settings);

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
			new Notice("Meta-Dataview needs Dataview plugin to be installed.");
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

		this.plugin.saveSettings();
		this.display.applyStatusIcons(settings.lastExport, settings);
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
		const dir = fileMap[filePath].toRelativeToExportDirRoot as string;
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
		rmDirContent(settings.outputFolder)
	}

	for (const fileIndex in fileList) {
		const exportProperties = fileList[fileIndex] as ExportProperties;
		await convertAndCopy(
			outputFolder,
			exportProperties,
			fileList,
			settings,
			plugin
		);

		exportProperties.lastExportDate = new Date(
			exportProperties.file?.mtime
		).getTime();

		outputPathMap[exportProperties.toRelativeToExportDirRoot] = outputPathMap[exportProperties.toRelativeToExportDirRoot] || []
		outputPathMap[exportProperties.toRelativeToExportDirRoot].push(exportProperties)
	}

	exportedLogEntry(outputPathMap, plugin)

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

export async function convertAndCopy(
	rootPath: string,
	fileExportProperties: ExportProperties,
	allFileListMap: ExportMap,
	settings: BulkExportSettings,
	plugin: BulkExporterPlugin
) {
	const targetDir = join(normalize(rootPath), fileExportProperties.toRelativeToExportDirRoot);
	const fileDescriptor = fileExportProperties.file;

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


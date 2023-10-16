/**
 * Find files with DataView's API, organize exports.
 */
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { Notice, TAbstractFile } from "obsidian";
import { rmSync } from "fs";

import { error, log } from "src/utils/log";

import { getAPI as getDataViewApi } from "obsidian-dataview";
import { normalizeQuery } from "src/utils/normalize-query";
import { createPathMap } from "src/utils/create-path-map";
import BulkExporterPlugin from "src/main";
import { Md5 } from "ts-md5";
import {
	AttachmentStat,
	replaceImageLinks, replaceImageLinksInMetaData,
} from "./get-markdown-attachments";
import { FileListItemWrapper } from "src/ui/file-list-export-indicator";
import {
	ExportGroupMap,
	ExportMap,
	ExportProperties,
} from "src/models/export-properties";
import {  isArray, isString, sortBy } from "underscore";
import { GlobMap, copyGlob } from "./globCopy";
import { replaceLocalLinks } from "./replace-local-links";
import { exportedLogEntry } from "./export-log";
import { join, normalize } from "path";
import { runShellCommand } from "src/utils/runner";

export class Exporter {
	plugin: BulkExporterPlugin;

	display: FileListItemWrapper;

	dataViewApi = getDataViewApi();

	constructor(plugin: BulkExporterPlugin) {
		this.plugin = plugin;
		this.display = new FileListItemWrapper(plugin);
	}

	registerUpdates() {
		this.plugin.registerEvent(
			this.plugin.app.metadataCache.on(
				// @ts-ignore
				"dataview:metadata-change",
				(type: string, file: TAbstractFile) => {
					// If this was already a file, see if it got updated!
					const previouslyExported =
						this.plugin.settings.lastExport[file.path];
					if (previouslyExported) {
						// we are updating this.
						this.display.updateElementStatus(previouslyExported);
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
				}
			)
		);
	}

	/**
	 * 1.- Finds all the files that are matching our filter in settings.
	 * 2.- Updates file-explorer plugin with the proper exported status icons.
	 * @returns
	 */
	async searchFilesToExport(): Promise<ExportMap> {
		if (this.dataViewApi) {
			const initialQuery = normalizeQuery(
				this.plugin.settings.exportQuery
			);
			const data = await this.dataViewApi.query(initialQuery);

			if (data.successful) {
				const exportFileMap = createPathMap(
					data.value.values,
					this.plugin.settings
				);
				log(
					`Found ${data.value.values.length} files for`,
					` filter: '${this.plugin.settings.exportQuery}'`,
					` organized by: '${this.plugin.settings.outputFormat}'`
				);

				if (data.value && data.value.type === "table") {
					this.display.applyStatusIcons(exportFileMap);

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
	async searchAndExport() {
		const results = await this.searchFilesToExport();
		// Uncomment this for the actual object info!
		// console.warn("Found files to export: ", results);
		if (this.plugin.settings.draftField){
			Object.keys(results).map(path=>{
				const fileMetaData = results[path].frontMatter;
				if (fileMetaData[this.plugin.settings.draftField]){
					delete results[path]
				}
			})
		}

		this.plugin.settings.lastExport = await exportSelection(
			results,
			this.plugin
		);
		this.plugin.saveSettings();
		this.display.applyStatusIcons(this.plugin.settings.lastExport);
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
		const dir = fileMap[filePath].toRelativeDir as string;
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
	plugin: BulkExporterPlugin
): Promise<ExportMap> {
	const start = new Date();
	// Check if target directory exists
	const outputFolder = plugin.settings.outputFolder;
	const outputPathMap: {[path: string]: Array<ExportProperties>} = {}
	log("=============================");
	log("Export to " + outputFolder);

	if (!existsSync(outputFolder)) {
		mkdirSync(outputFolder);
		log("Created new target folder: " + outputFolder);
	}

	// If emptying target folder is set, remove all the folders that are to be exporter.
	// Doing it this way, the root of the folder remains intact.
	if (plugin.settings.emptyTargetFolder){
		Object.keys(getGroups(fileList)).forEach((path)=>{
			const targetDir = join(normalize(outputFolder), path);
			if (existsSync(targetDir)) {
				rmSync(targetDir, { recursive: true, force: true });
			}
		})
	}

	for (const fileIndex in fileList) {
		const exportProperties = fileList[fileIndex] as ExportProperties;
		await convertAndCopy(
			outputFolder,
			exportProperties,
			fileList,
			plugin
		);

		// Unofficial or I could not find API of TAbstractFile:
		// it has an mtime attr, which stores the last modified date.
		exportProperties.lastExportDate = new Date(
			// @ts-ignore
			exportProperties.file.mtime
		).getTime();

		// Save the export properties, but do not save the whole content, just the MD5 hash.
		exportProperties.content = "";
		exportProperties.file = null;
		outputPathMap[exportProperties.toRelativeDir] = outputPathMap[exportProperties.toRelativeDir] || []
		outputPathMap[exportProperties.toRelativeDir].push(exportProperties)
	}

	exportedLogEntry(outputPathMap, plugin)

	if (plugin.settings.shell && plugin.settings.shell.trim()){
		log('Starting shell script ', plugin.settings.shell)
		const shellStart = new Date()
		await runShellCommand(plugin.settings.shell)
		log('Finished shell script! ', (new Date().getTime() - shellStart.getTime())/1000, 's')
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
	plugin: BulkExporterPlugin
) {
	const targetDir = join(normalize(rootPath), fileExportProperties.toRelativeDir);
	const fileDescriptor = fileExportProperties.file;

	if (!existsSync(targetDir)) {
		mkdirSync(targetDir, { recursive: true });
	}
	if (!fileDescriptor) { throw new Error('Null Error') }

	const fileContent = await plugin.app.vault.adapter.read(fileDescriptor.path);
	fileExportProperties.content = fileContent;

	fileExportProperties.md5 = Md5.hashStr(fileContent);

	await collectAssets(fileExportProperties, plugin);
	fileExportProperties.linkStats = replaceLocalLinks(fileExportProperties, allFileListMap);

	writeFileSync(
		fileExportProperties.to,
		fileExportProperties.content,
		"utf-8"
	);

	return fileExportProperties;
}


/**
 * This function assumes, that we have the file content loaded into the
 * `content`
 * parameter within fileExportProperties, and overwrites that, removing/
 * moving the references further described in get-markdown-attachments.ts.
 * @param fileExportProperties file being processed
 * @param settings to retrieve assetPath
 * @param plugin
 * @returns
 */
async function collectAssets(
	fileExportProperties: ExportProperties,
	plugin: BulkExporterPlugin
) {
	const imageLinkListInBody: Array<AttachmentStat> = [], imageLinkListInMeta: Array<AttachmentStat> = [];
	// Look for images!
	const imageLinkListInBodyMap = await replaceImageLinks(
		fileExportProperties,
		plugin
	);
	Object.keys(imageLinkListInBodyMap).map((key)=>{
		imageLinkListInBody.push(imageLinkListInBodyMap[key])
	})

	const imageLinkListInMetaMap = await replaceImageLinksInMetaData(
		fileExportProperties,
		plugin
	);
	Object.keys(imageLinkListInMetaMap).map((key)=>{
		imageLinkListInMeta.push(imageLinkListInMetaMap[key])
	})

	const frontMatterData = fileExportProperties.frontMatter;

	let filesCopied: GlobMap = {}
	if (frontMatterData && frontMatterData.copy) {
		// const relativeRoot = parse(fileExportProperties.from).dir
		// log(`[glob] [${fileExportProperties.newFileName}.md] has a copy property.
		// Looking for file matches here: ${relativeRoot}`);
		// Iterate every file that matches the regex.
		if (isArray(frontMatterData.copy)) {
			for(let i = 0; i < frontMatterData.copy.length; i++){
				const globPattern = frontMatterData.copy[i]
				filesCopied[globPattern] = await copyGlob(fileExportProperties, globPattern, plugin)
			}
		} else if (isString(frontMatterData.copy)) {
			filesCopied[frontMatterData.copy] = await copyGlob(fileExportProperties, frontMatterData.copy, plugin)
		}
	}
	fileExportProperties.imageInBody = imageLinkListInBody;
	fileExportProperties.imageInMeta = imageLinkListInMeta;
	fileExportProperties.copyGlob = filesCopied

	return fileExportProperties
}
/**
 * Find files with DataView's API, organize exports.
 */
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { Notice, TAbstractFile } from "obsidian";
import path, { parse } from "path";
import { rmSync } from "fs";

import { error, log } from "src/utils/log";

import { getAPI as getDataViewApi } from "obsidian-dataview";
import { normalizeQuery } from "src/utils/normalize-query";
import { createPathMap } from "src/utils/create-path-map";
import BulkExporterPlugin from "src/main";
import { Md5 } from "ts-md5";
import {
	ImageAttachment,
	replaceImageLinks, replaceImageLinksInMetaData,
} from "./get-markdown-attachments";
import { FileListItemWrapper } from "src/ui/file-list-export-indicator";
import {
	ExportGroupMap,
	ExportMap,
	ExportProperties,
} from "src/models/export-properties";
import { openFileByPath } from "src/obsidian-api-helpers/file-by-path";
import { isArray, isString, sortBy } from "underscore";
import { copyGlob } from "./globCopy";
import { LinkStat, replaceLocalLinks } from "./replace-local-links";
import { getIcon } from "src/obsidian-api-helpers/get-icon";

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
		console.warn("Found files to export: ", results);
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
	log("=============================");
	log("Export to " + outputFolder);

	if (plugin.settings.emptyTargetFolder) {
		log("Cleaning up target folder (per settings): " + outputFolder);
		if (existsSync(outputFolder)) {
			rmSync(outputFolder, { recursive: true, force: true });
		}
	}

	if (!existsSync(outputFolder)) {
		mkdirSync(outputFolder);
		log("Created new target folder: " + outputFolder);
	}

	for (const fileIndex in fileList) {
		const exportProperties = fileList[fileIndex] as ExportProperties;
		const targetFileName = await convertAndCopy(
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
	}

	new Notice("Exported to " + outputFolder);
	log(
		`Exported took ${(new Date().getTime() - start.getTime()) / 1000
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
	const targetDir = path.join(path.normalize(rootPath), fileExportProperties.toRelativeDir);
	const fileDescriptor = fileExportProperties.file;

	if (!existsSync(targetDir)) {
		mkdirSync(targetDir, { recursive: true });
		log(
			"Created new group-by folder for blog: ",
			createEl('strong', { text: targetDir })
		);
	}
	if (!fileDescriptor) { throw new Error('Null Error') }

	const fileContent = await plugin.app.vault.adapter.read(fileDescriptor.path);
	fileExportProperties.content = fileContent;

	fileExportProperties.md5 = Md5.hashStr(fileContent);

	const allAssetsExported = await collectAssets(fileExportProperties, plugin);

	const linkStats = replaceLocalLinks(fileExportProperties, allFileListMap);

	writeFileSync(
		fileExportProperties.to,
		fileExportProperties.content,
		"utf-8"
	);

	exportedLogEntry(fileExportProperties, linkStats, allAssetsExported, plugin)

	return fileExportProperties.to;
}

/**
 * I want great logging per file, with all the info.
 * For easy debugging and preserving sanity.
 * @param fileExportProperties
 * @param linkStats
 * @param allAssetsExported
 * @param plugin
 */
function exportedLogEntry(
	fileExportProperties: ExportProperties,
	linkStats: Array<LinkStat>,
	allAssetsExported: Array<ImageAttachment>,
	plugin: BulkExporterPlugin
) {
	let errorCount = 0;

	// Depending on whether there were errors, let's change the color in the log!
	const linkToFile = createEl("span", { cls: 'clickable', text: fileExportProperties.toRelative });
	const exportStats = createDiv({
		text: `${linkStats.length} Local links, ${allAssetsExported.length} images.`,
		cls: 'export-stats'
	})
	const linkButton = exportStats.createEl('a')
	linkButton.append(getIcon('external-link'))
	linkButton.addEventListener('click', () => openFileByPath(plugin, fileExportProperties.from))

	linkToFile.addEventListener("click", () =>
		exportStats.classList.toggle('export-stats-open')
	);

	// Links
	const linkStatContainer = exportStats.createDiv({ text: `Links found: ${linkStats.length}` })
	linkStats.forEach((linkStat) => {
		const link = linkStatContainer.createDiv({
			cls: 'pull-in clickable',
			text: `${linkStat.type} `
		})
		const linkText = link.createEl('a', {text: linkStat.text || linkStat.original})
		linkText.append(getIcon('external-link'))
		linkText.addEventListener('click', (evt) => {
			evt.stopPropagation();
			if (linkStat.type === 'external'){
				window.open(linkStat.url)
			} else {
				openFileByPath(plugin, linkStat.url)
			}
		})
	})

	// Assets
	const assetStatContainer = exportStats.createDiv({ text: `Image Assets Copied: ${allAssetsExported.length}` })
	allAssetsExported.forEach((imageAsset) => {
		const assetElement = assetStatContainer.createEl('a', {
			cls: 'pull-in clickable',
			title: imageAsset.originalPath,
			text: `${imageAsset.newPath || '-- no title --'} (${imageAsset.count})`
		})
		if (imageAsset.status === 'assetNotFound') {
			errorCount++;
			assetElement.classList.add('error')
		} else {
			assetElement.addEventListener('click', (evt) => { evt.stopPropagation(); openFileByPath(plugin, imageAsset.originalPath)})
		}
	})
	const container = createSpan({'text': 'Exported '})
	container.append(linkToFile, exportStats)
	if (errorCount){
		container.classList.add('error')
		container.append(createSpan({text: ` ${errorCount} errors`}))
	}

	log(container);
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
	// Look for images!
	const imageLinkList = await replaceImageLinks(
		fileExportProperties,
		plugin
	);
	const imageLinkListInMeta = await replaceImageLinksInMetaData(
		fileExportProperties,
		plugin
	);

	const allAssetsExported: Array<ImageAttachment> = []
	Object.keys(imageLinkListInMeta).forEach((originalUrl) => {
		allAssetsExported.push(imageLinkListInMeta[originalUrl])
	})
	Object.keys(imageLinkList).forEach((originalUrl) => {
		allAssetsExported.push(imageLinkList[originalUrl])
	})

	// @ts-ignore
	const frontMatterData = fileExportProperties.file.frontmatter;

	if (frontMatterData && frontMatterData.copy) {
		const relativeRoot = parse(fileExportProperties.from).dir
		log(`[glob] [${fileExportProperties.newFileName}.md] has a copy property. Looking for file matches here: ${relativeRoot}`);
		// Iterate every file that matches the regex.
		if (isArray(frontMatterData.copy)) {
			// TODO: copy files that are next to the index.md!
			frontMatterData.copy.forEach((globPattern: string) =>
				copyGlob(fileExportProperties, globPattern, plugin));
		} else if (isString(frontMatterData.copy)) {
			copyGlob(fileExportProperties, frontMatterData.copy, plugin)
		}
	}

	return allAssetsExported;
}

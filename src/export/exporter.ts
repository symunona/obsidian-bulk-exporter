/**
 * Find files with DataView's API, organize exports.
 */
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { Notice, TAbstractFile } from "obsidian";
import path from "path";
import { rmSync } from "fs";

import { error, log, warn } from "src/utils/log";

import { getAPI as getDataViewApi } from "obsidian-dataview";
import { normalizeQuery } from "src/utils/normalize-query";
import { createPathMap } from "src/utils/create-path-map";
import BulkExporterPlugin from "src/main";
import { BulkExportSettings } from "src/models/bulk-export-settings";
import { Md5 } from "ts-md5";
import {
	replaceImageLinks,
	replaceLocalLinks,
} from "./get-markdown-attachments";
import { FileListItemWrapper } from "src/ui/file-list-export-indicator";
import {
	ExportGroupMap,
	ExportMap,
	ExportProperties,
} from "src/models/export-properties";
import { openFileByPath } from "src/obsidian-api-helpers/file-by-path";

export class Exporter {
	plugin: BulkExporterPlugin;

	display: FileListItemWrapper;

	dataViewApi = getDataViewApi();

	constructor(plugin: BulkExporterPlugin) {
		this.plugin = plugin;
		this.display = new FileListItemWrapper(plugin);
		this.registerUpdates();
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
					` groupped by: '${this.plugin.settings.groupBy}'`
				);

				if (data.value && data.value.type === "table") {
					this.display.applyStatusIcons(exportFileMap);

					return exportFileMap;
				} else {
					throw new Error("[Bulk Exporter]: return type error");
				}
			}
			error("[Bulk Exporter] ", data.error);
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
			this.plugin.settings
		);
		this.plugin.saveSettings();
		this.display.applyStatusIcons(this.plugin.settings.lastExport);
	}
}

export function getGroups(
	fileMap: ExportMap,
	settings: BulkExportSettings
): ExportGroupMap {
	const groupBy = settings.groupBy || false;

	if (groupBy) {
		const groups: { [id: string]: Array<ExportProperties> } = {};
		if (
			Object.keys(fileMap).filter((filePath) => {
				const file = fileMap[filePath];
				groups[file.group] = groups[file.group] || [];
				groups[file.group].push(file);
			}).length
		) {
			warn(
				"!!! Warning. Some files are missing the groupBy property from their front matter! They will be added to the root."
			);
		}
		return groups;
	}
	error("[Bulk Exporter] Flat export is not supported yet.");
	return {};
}

/**
 * Takes the currently viewed elements, and exports them.
 */
export async function exportSelection(
	fileList: ExportMap,
	settings: BulkExportSettings
): Promise<ExportMap> {
	const start = new Date();
	// Check if target directory exists
	const outputFolder = settings.outputFolder;
	log("=============================");
	log("Export to " + outputFolder);
	const groupBy = settings.groupBy || false;

	if (settings.emptyTargetFolder) {
		log("Cleaning up target folder (per settings): " + outputFolder);
		if (existsSync(outputFolder)) {
			rmSync(outputFolder, { recursive: true, force: true });
		}
	}

	if (!existsSync(outputFolder)) {
		mkdirSync(outputFolder);
		log("Created new target folder: " + outputFolder);
	}

	// Preliminary checks
	// Do all the exporting files have the groupBy value?
	if (groupBy) {
		if (
			Object.keys(fileList).filter((fileId: string) => {
				const file = fileList[fileId];

				// I think DataView populates the frontmatter property
				// @ts-ignore
				const frontMatter = file.file.frontmatter as {
					[key: string]: string;
				};

				if (!frontMatter[groupBy]) {
					log(
						`[Warn] Missing front matter property ${groupBy} in file ${file.from}\n`
					);
				}
				return !frontMatter[groupBy];
			}).length
		) {
			new Notice(
				"!!! Warning. Some files are missing the groupBy property from their front matter! They will be added to the root."
			);
		}
	}

	for (const fileIndex in fileList) {
		const exportProperties = fileList[fileIndex] as ExportProperties;
		const targetFileName = await convertAndCopy(
			outputFolder,
			groupBy,
			exportProperties,
			fileList,
			settings
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

		const linkToFile = createEl("a", { text: targetFileName });
		linkToFile.addEventListener("click", () =>
			openFileByPath(exportProperties.from)
		);
		log("Exported ", linkToFile);
	}

	new Notice("Exported to " + outputFolder);
	log(
		`Exported took ${
			(new Date().getTime() - start.getTime()) / 1000
		}s to ` + outputFolder
	);

	return fileList;
}

export async function convertAndCopy(
	rootPath: string,
	groupBy: string | false,
	fileExportProperties: ExportProperties,
	allFileListMap: ExportMap,
	settings: BulkExportSettings
) {
	let targetDir = path.normalize(rootPath);
	const fileDescriptor = fileExportProperties.file;
	if (groupBy) {
		// @ts-ignore - I think DataView populates the frontmatter property
		const frontMatter = fileDescriptor.frontmatter as {
			[key: string]: string;
		};

		const groupByValue = (frontMatter && frontMatter[groupBy]) || "";
		if (groupByValue) {
			targetDir = path.join(targetDir, groupByValue);
		}
		if (!existsSync(targetDir)) {
			mkdirSync(targetDir);
			log(
				"Created new group-by folder for blog: ",
					createEl('strong', {text: groupByValue})
			);
		}
	}
	if (!fileDescriptor){ throw new Error('Null Error')}

	const fileContent = await this.app.vault.adapter.read(fileDescriptor.path);
	fileExportProperties.content = fileContent;

	fileExportProperties.md5 = Md5.hashStr(fileContent);

	await collectAssets(fileExportProperties, settings);

	replaceLocalLinks(fileExportProperties, allFileListMap);

	writeFileSync(
		fileExportProperties.to,
		fileExportProperties.content,
		"utf-8"
	);

	return fileExportProperties.to;
}

async function collectAssets(
	fileExportProperties: ExportProperties,
	settings: BulkExportSettings
) {
	// Look for images!
	const resolve = replaceImageLinks(
		fileExportProperties,
		settings.assetPath,
		settings.autoImportFromWeb
	);

	return resolve;
}

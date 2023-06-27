import { existsSync, mkdirSync, writeFileSync } from "fs";
import { Notice } from "obsidian";
import path from "path";
import { rmSync } from "fs";

import { log } from "src/utils/log";

import { getAPI as getDataViewApi } from "obsidian-dataview";
import { normalizeQuery } from "src/utils/normalize-query";
import { ExportGroupMap, ExportMap, ExportProperties, createPathMap } from "src/utils/create-path-map";
import BulkExporterPlugin from "src/main";
import { BulkExportSettings } from "src/utils/bulk-export-settings";
import { Md5 } from "ts-md5";
import { replaceImageLinks, replaceLocalLinks } from "./get-markdown-attachments";



export class Exporter {
    plugin: BulkExporterPlugin

    dataViewApi = getDataViewApi();


    constructor(plugin: BulkExporterPlugin) {
        this.plugin = plugin
    }

    async searchFilesToExport(): Promise<ExportMap> {
        if (this.dataViewApi) {
            const initialQuery = normalizeQuery(this.plugin.settings.exportQuery)
            // console.warn('[Bulk-Exporter] initial queryresults', initialQuery)
            const data = await this.dataViewApi.query(initialQuery);

            if (data.successful) {
                const exportFileMap = createPathMap(data.value.values, this.plugin.settings)
                console.log(`
[Bulk-Exporter]
found ${data.value.values.length} files for
filter: ${this.plugin.settings.exportQuery}
groupped by: ${this.plugin.settings.groupBy}`, exportFileMap)


                if (data.value && data.value.type === 'table') {
                    return exportFileMap
                }
                else {
                    throw new Error('TypeError: return type error')
                }
            }
            throw new Error('Query Error')
        } else {
            new Notice(
                "Meta-Dataview needs Dataview plugin to be installed."
            );
            throw new Error("Meta-Dataview needs Dataview plugin to be installed.")
        }
    }
    async searchAndExport() {
        const results = await this.searchFilesToExport()
        console.warn('Found files to export: ', results)
        exportSelection(results, this.plugin.settings)
    }
}

export function getGroups(fileMap: ExportMap, settings: BulkExportSettings): ExportGroupMap {
    const groupBy = settings.groupBy || false

    if (groupBy) {
        const groups: { [id: string]: Array<ExportProperties> } = {}
        if (Object.keys(fileMap).filter((filePath) => {
            const file = fileMap[filePath]
            groups[file.group] = groups[file.group] || []
            groups[file.group].push(file)
        }).length) {
            new Notice("!!! Warning. Some files are missing the groupBy property from their front matter! They will be added to the root.")
        }
        return groups
    }
    throw new Error('Flat export is not supported yet.')
}

export const DEFAULT_EXPORT_PATH = "~/obsidian-output"


/**
 * Takes the currently viewed elements, and exports them.
 * TODO:
 * - saves a dump of their MD5 hash, so we can later compare whether they've been modified.
 */
export async function exportSelection(fileList: ExportMap, settings: BulkExportSettings): Promise<void> {
    // Check if target directory exists
    const outputFolder = settings.outputFolder || DEFAULT_EXPORT_PATH
    log("=============================");
    log("Export to " + outputFolder);
    const groupBy = settings.groupBy || false

    if (settings.emptyTargetFolder) {
        log('Cleaning up target folder (per settings): ' + outputFolder)
        if (existsSync(outputFolder)) {
            rmSync(outputFolder, { recursive: true, force: true });
        }
    }

    if (!existsSync(outputFolder)) {
        mkdirSync(outputFolder)
        log('Created new target folder: ' + outputFolder)
    }


    // Preliminary checks
    // Do all the exporting files have the groupBy value?
    if (groupBy) {
        if (Object.keys(fileList).filter((fileId: string) => {
            const file = fileList[fileId]
            if (!file.file.frontmatter[groupBy]) {
                log(`[Warn] Missing front matter property ${groupBy} in file ${file.from}\n`)
            }
            return !file.file.frontmatter[groupBy]
        }).length) {
            new Notice("!!! Warning. Some files are missing the groupBy property from their front matter! They will be added to the root.")
        }
    }

    // DEBUG: JUST THE FIRST FILE!
    // const file = fileList[Object.keys(fileList)[0]];
    // await convertAndCopy(outputFolder, groupBy, file, fileList, settings)
    // return;

    for (const fileIndex in fileList) {
        const file = fileList[fileIndex] as ExportProperties
        const targetFileName = await convertAndCopy(outputFolder, groupBy, file, fileList, settings)
        log('Exported ' + targetFileName)
    }

    new Notice("Exported to " + outputFolder);
    log("Exported to " + outputFolder);
}

export async function convertAndCopy(
    rootPath: string,
    groupBy: string | false,
    fileExportProperties: ExportProperties,
    allFileListMap: ExportMap,
    settings: BulkExportSettings) {

    let targetDir = path.normalize(rootPath);
    const fileDescriptor = fileExportProperties.file;
    if (groupBy) {
        const groupByValue = fileDescriptor.frontmatter && fileDescriptor.frontmatter[groupBy] || '';
        if (groupByValue) {
            targetDir = path.join(targetDir, groupByValue)
        }
        if (!existsSync(targetDir)) {
            mkdirSync(targetDir)
            log('Created new group-by folder for blog: ' + groupByValue)
        }

    }

    const fileContent = await this.app.vault.adapter.read(fileDescriptor.path)
    fileExportProperties.content = fileContent;

    fileExportProperties.md5 = Md5.hashStr(fileContent)

    // console.warn('file', fileExportProperties.md5)

    await collectAssets(fileExportProperties, settings)

    replaceLocalLinks(fileExportProperties, allFileListMap)

    // console.warn('assets', assets)

    writeFileSync(fileExportProperties.to, fileExportProperties.content, 'utf-8')

    // TODO: save MD5 hash of the file into a last exported json e.g. in the target dir
    // AND persist it into LS, or plugin data
}


async function collectAssets(fileExportProperties: ExportProperties, settings: BulkExportSettings) {
    // Look for images!
    const resolve = replaceImageLinks(fileExportProperties, settings.assetPath, settings.autoImportFromWeb);

    return resolve
}


import { existsSync, mkdirSync } from "fs";
import { Notice, TAbstractFile } from "obsidian";
import path from "path";
import { tryCopyMarkdownByRead } from "node_modules/obsidian-markdown-export/src/utils"
// import { unlinkSync } from "fs";
import { rmSync } from "fs";

import { log } from "src/utils/log";

import {  getAPI as getDataViewApi } from "obsidian-dataview";
import { FileListItemWrapper } from "src/utils/file-list-export-indicator";
import { normalizeQuery } from "src/utils/normalize-query";
import { ExportGroupMap, ExportMap, ExportProperties, createPathMap } from "src/utils/create-path-map";
import BulkExporterPlugin from "src/main";

// import {TableResult}  from "node_modules/obsidian-dataview/lib/api/plugin-api"

// TODO: Create a PR when this is exposed
type CopyMarkdownOptions = {
    file: TAbstractFile;
    outputSubPath: string;
};

let exporter: Exporter

export function getSingletonExporter(plugin?: BulkExporterPlugin) {
    if (exporter) return exporter
    if (!plugin) {
        throw new Error('Exporter can only init with the plugin first')
    }
    return exporter = new Exporter(plugin)
}

export class Exporter {
    plugin: BulkExporterPlugin

    dataViewApi = getDataViewApi();


    constructor(plugin: BulkExporterPlugin) {
        this.plugin = plugin
    }

    async searchFilesToExport(): Promise<ExportMap> {
        if (this.dataViewApi) {
            const initialQuery = normalizeQuery(this.plugin.settings.exportQuery)
            // console.warn('[Bulk-Exporter] initial query results', initialQuery)
            const data = await this.dataViewApi.query(initialQuery);

            if (data.successful) {
                // new HeaderTabs
                console.log(`
[Bulk-Exporter]
found ${data.value.values.length} files for
filter: ${this.plugin.settings.exportQuery}
groupped by: ${this.plugin.settings.groupBy}`)

                const exportFileMap = createPathMap(data.value.values, this.plugin.settings)
                console.log(exportFileMap)

                // new FileListItemWrapper(this.plugin, exportFileMap)
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
    async searchAndExport(){
        const results = await this.searchFilesToExport()
        exportSelection(results)
    }
}

export const DEFAULT_EXPORT_PATH = "~/obsidian-output"

export function getGroups(fileList: ExportMap): ExportGroupMap{
    const settings = exporter.plugin.settings
    const groupBy = settings.groupBy || false

    if (groupBy){
        const groups: {[id: string]: Array<ExportProperties>} = {}
        if (Object.keys(fileList).filter((filePath) => {
            const file = fileList[filePath]
            groups[file.group] = groups[file.group] || []
            groups[file.group].push(file)
        }).length) {
            new Notice("!!! Warning. Some files are missing the groupBy property from their front matter! They will be added to the root.")
        }
        return groups
    }
    throw new Error('Flat export is not supported yet.')
}


/**
 * Takes the currently viewed elements, and exports them.
 * TODO:
 * - saves a dump of their MD5 hash, so we can later compare whether they've been modified.
 */
export async function exportSelection(fileList: ExportMap): Promise<void> {
    const settings = exporter.plugin.settings
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
        if (fileList.filter((file) => {
            if (!file.frontmatter[groupBy]) {
                log(`[Warn] Missing front matter property ${groupBy} in file ${file.path}\n`)
            }
            return !file.frontmatter[groupBy]
        }).length) {
            new Notice("!!! Warning. Some files are missing the groupBy property from their front matter! They will be added to the root.")
        }
    }

    for (const fileIndex in fileList) {
        const file = fileList[fileIndex]
        const targetFileName = await convertAndCopy(outputFolder, groupBy, file)
        log('Exported ' + targetFileName)
    }

    new Notice("Exported to " + outputFolder);
    log("Exported to " + outputFolder);
}

export async function convertAndCopy(rootPath: string, groupBy: string, fileDescriptor: TAbstractFile) {
    let targetDir = path.normalize(rootPath);
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
    const targetFileName = path.join(targetDir, fileDescriptor.name + '.' + fileDescriptor.ext)

    // const fileContent = await this.app.vault.adapter.read(fileDescriptor.path)

    // TODO: Get the linked images out
    // TODO: copy the images to the target assets folder
    /**
     * TODO
     * - check the links
     * - if they are pointing to another post within: replace them
     * - if they are not, erase link.
     */

    // TODO: save MD5 hash of the file into a last exported json e.g. in the target dir
    // AND persist it into LS, or plugin data
    console.log('--------')
    console.log('group by', groupBy)
    console.log('from', fileDescriptor.path)
    console.log('to', targetFileName)

    const outputOptions: CopyMarkdownOptions = {
        file: fileDescriptor,
        outputSubPath: targetFileName
    }

    tryCopyMarkdownByRead(settings, outputOptions)

    return targetFileName


    // tryCopyMarkdownByRead()
}


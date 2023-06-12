import { existsSync, mkdirSync } from "fs";
import { Notice, TAbstractFile } from "obsidian";
import path from "path";
import { tryCopyMarkdownByRead } from "node_modules/obsidian-markdown-export/src/utils"
// import { unlinkSync } from "fs";
import { rmSync } from "fs";

import { log } from "src/utils/log";

// TODO: Create a PR when this is exposed
type CopyMarkdownOptions = {
	file: TAbstractFile;
	outputSubPath: string;
};


export const DEFAULT_EXPORT_PATH = "~/obsidian-output"

/**
 * Takes the currently viewed elements, and exports them.
 * TODO:
 * - saves a dump of their MD5 hash, so we can later compare whether they've been modified.
 */
export async function exportSelection(fileList: Array<TAbstractFile>): Promise<void> {
    // Check if target directory exists
    const outputFolder = this.app.plugins.plugins['meta-dataview'].settings.outputFolder || DEFAULT_EXPORT_PATH
    log("=============================");
    log("Export to " + outputFolder);
    const groupBy = this.app.plugins.plugins['meta-dataview'].settings.groupBy || false

    if (this.app.plugins.plugins['meta-dataview'].settings.emptyTargetFolder) {
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

    for (const fileIndex in fileList){
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

    const outputOptions : CopyMarkdownOptions = {
        file: fileDescriptor,
        outputSubPath: targetFileName
    }

    tryCopyMarkdownByRead(this.app.plugins.plugins['meta-dataview'], outputOptions)

    return targetFileName


    // tryCopyMarkdownByRead()
}
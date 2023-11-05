/**
 * Copy files from the vault into the file system.
 *
 * NOTE: I assume this does NOT support obsidian sync yet!
 * As I do not know where files are stored when sync
 * is used, I assume glob will not work!
 */

import { ExportProperties } from "src/models/export-properties"

import { globSync } from 'glob'
import { join, parse } from "path"
import { cpSync, existsSync, mkdirSync, statSync } from "fs"
import { Plugin } from "obsidian"
import { AttachmentLink, LinkType } from "./get-links-and-attachments"

export interface GlobMap { [glob: string]: Array<AttachmentLink> }

export async function copyGlob(fileExportProperties: ExportProperties, globString: string, plugin: Plugin){
    const relativeRoot = parse(fileExportProperties.from).dir

    // @ts-ignore : simple way to figure out if we are on the cloud I guess.
    const basePath =  plugin.app.vault.adapter.basePath;
    const fromAbsoluteRoot = join(basePath, relativeRoot)
    const toRootDir = parse(fileExportProperties.toAbsoluteFs).dir
	const files = globSync(globString, {cwd: fromAbsoluteRoot})

    const fileListExported : Array<AttachmentLink> = []

	files.forEach((relativeFileName: string)=>{
        const toAbsolutePath = join(toRootDir, relativeFileName)
        const fromAbsolutePath = join(fromAbsoluteRoot, relativeFileName)
        const exportTargetDir = parse(toAbsolutePath).dir
        const fileStats = statSync(fromAbsolutePath)

        if (fileStats.isFile()){
            // Create folder if does not exist!
            if (!existsSync(exportTargetDir)){
                mkdirSync(exportTargetDir, {recursive: true})
                fileListExported.push({
                    count: 0,
                    newPath: toAbsolutePath,
                    originalPath: relativeFileName,
                    normalizedOriginalPath: relativeFileName,
                    status: 'success',
                    text: relativeFileName,
                    source: "globCopy",
                    linkType: LinkType.internal
                })
            }

            // NOTE: this DOES NOT work for sync for now!
            try{
                cpSync(fromAbsolutePath, toAbsolutePath)
                fileListExported.push({
                    count: 1,
                    newPath: exportTargetDir,
                    originalPath: relativeFileName,
                    status: 'success',
                    normalizedOriginalPath: relativeFileName,
                    text: relativeFileName,
                    source: "globCopy",
                    linkType: LinkType.internal
                })
            } catch(e){
                console.error(e)
                fileListExported.push({
                    count: 1,
                    newPath: toAbsolutePath,
                    originalPath: relativeFileName,
                    normalizedOriginalPath: relativeFileName,
                    status: 'error',
                    error: e.message,
                    text: relativeFileName,
                    source: "globCopy",
                    linkType: LinkType.internal
                })
            }
        } else if (fileStats.isDirectory()){
            // Noop.
        }
    })
    return fileListExported
}

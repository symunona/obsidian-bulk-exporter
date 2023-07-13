/**
 * Copy files from the vault into the file system.
 *
 * NOTE: I assume this does NOT support obsidian sync yet!
 * As I do not know where files are stored when sync
 * is used, I assume glob will not work!
 */

import { ExportProperties } from "src/models/export-properties"
import { error, log } from "src/utils/log"

import { globSync } from 'glob'
import { join, parse } from "path"
import { cpSync, existsSync, mkdirSync, stat, statSync } from "fs"
import { Plugin } from "obsidian"

export async function copyGlob(fileExportProperties: ExportProperties, globString: string, plugin: Plugin){
    const relativeRoot = parse(fileExportProperties.from).dir

    // @ts-ignore : simple way to figure out if we are on the cloud I guess.
    const basePath =  plugin.app.vault.adapter.basePath;
    const fromAbsoluteRoot = join(basePath, relativeRoot)
    const toRootDir = parse(fileExportProperties.to).dir
	const files = globSync(globString, {cwd: fromAbsoluteRoot})
	log(`Pattern: ${globString}:  ${files.length}`)

	files.forEach((relativeFileName: string)=>{
        const toAbsolutePath = join(toRootDir, relativeFileName)
        const fromAbsolutePath = join(fromAbsoluteRoot, relativeFileName)
        const exportTargetDir = parse(toAbsolutePath).dir

        if (statSync(fromAbsolutePath).isFile()){
            // Create folder if does not exist!
            if (!existsSync(exportTargetDir)){
                mkdirSync(exportTargetDir, {recursive: true})
                log(`[glob]   Creating dir ${exportTargetDir}`)
            }
            log(`[glob]     copy ${relativeFileName} -> ${toAbsolutePath}`)
            // NOTE: this DOES NOT work for sync for now!
            try{
                cpSync(fromAbsolutePath, toAbsolutePath)
            } catch(e){
                error(e)
                console.error(e)
            }
        }
    })
}

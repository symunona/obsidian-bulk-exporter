import { TAbstractFile } from "obsidian";
import { BulkExportSettings } from "../models/bulk-export-settings";
import { join } from "path";
import normalizeFileName from "./normalize-file-name";
import { ExportMap, ExportProperties } from "src/models/export-properties";


export function createPathMap(queryResults: Array<any>, settings: BulkExportSettings): ExportMap {
    const foundFileMap: { [key: string]: ExportProperties } = {}
    const targetRoot = settings.outputFolder;

    queryResults.map((item) => {
        let groupByValue = ''
        let newFileName = item[1].name
        const fileDescriptor = item[1]
        if (settings.groupBy) {
            groupByValue = fileDescriptor.frontmatter && fileDescriptor.frontmatter[settings.groupBy] || '';
        }

        if (fileDescriptor instanceof TAbstractFile){
            throw new Error('fileDescriptor returned from dataview api is not a TAbstractFile')
        }

        // Convert the file name to a web-friendly slug.
        // If there is a slug property or a title property, use these, otherwise
        // fall back to the file name.
        if (settings.smartSlug){
            if (fileDescriptor.frontmatter &&
                fileDescriptor.frontmatter.slug ||
                fileDescriptor.frontmatter.title
                ) {
                newFileName = fileDescriptor.frontmatter.slug || fileDescriptor.frontmatter.title
            }
            newFileName = normalizeFileName(newFileName)
        }

        const newExportPropertyItem: ExportProperties = {
            file: fileDescriptor,
            from: fileDescriptor.path,
            newFileName: newFileName,
            to: join(targetRoot, groupByValue, newFileName + '.' + fileDescriptor.ext),
            toRelative: join(groupByValue, newFileName + '.' + fileDescriptor.ext),
            group: groupByValue,
            md5: '',
            content: ''
        }
        foundFileMap[item[1].path] = newExportPropertyItem
    });
    return foundFileMap

}
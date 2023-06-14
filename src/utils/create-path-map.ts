import { TAbstractFile } from "obsidian";
import { BulkExportSettings } from "./bulk-export-settings";
import { join } from "path";

export type ExportProperties = {
    file: TAbstractFile,
    fileName: string,
    from: string,
    to: string,
    toRelaitve: string,
    group: string
}
export type ExportMap = { [key: string]: ExportProperties }
export type ExportGroupMap = {[group: string]: Array<ExportProperties>}

export function createPathMap(queryResults: Array<any>, settings: BulkExportSettings): ExportMap {
    const foundFileMap: { [key: string]: ExportProperties } = {}
    const targetRoot = settings.outputFolder;

    queryResults.map((item) => {
        let groupByValue = ''
        let fileName = item[1].name
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
                fileName = fileDescriptor.frontmatter.slug || fileDescriptor.frontmatter.title
            }
            fileName = fileName.toLowerCase().replace(/_|\s|\.|,|\(|\)|\[|\]/g, '-')
        }

        const newExportPropertyItem: ExportProperties = {
            file: fileDescriptor,
            from: fileDescriptor.path,
            fileName: fileName,
            to: join(targetRoot, groupByValue, fileName + '.' + fileDescriptor.ext),
            toRelaitve: join(groupByValue, fileName + '.' + fileDescriptor.ext),
            group: groupByValue
        }
        foundFileMap[item[1].path] = newExportPropertyItem
    });
    return foundFileMap

}
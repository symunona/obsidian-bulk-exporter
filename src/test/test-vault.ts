import { ExportMap, ExportProperties } from "src/models/export-properties";

import jsonRaw from "./test-vault.json"
// import { PageMetadata } from "obsidian-dataview";

/**
 * The dataview page as `test-vault.json` holds it: a JSON dump of a real export
 * run, so the links are plain objects, the dates are strings, and the page
 * metadata got flattened into a single object.
 */
type SerializedPage = {
    path: string,
    tags: Array<string>,
    aliases: Array<string>,
    outlinks: Array<Record<string, unknown>>,
    fields?: Record<string, unknown>,
    fronmatter?: Record<string, unknown>
}

/**
 * One note of the dump: an `ExportProperties` where everything that is a class
 * instance at runtime (the dataview page, the markdown-it tokens) is plain JSON.
 */
type SerializedExportProperties =
    Omit<ExportProperties, "file" | "linksAndAttachments" | "copyGlob"> & {
        file: SerializedPage,
        linksAndAttachments?: Record<string, unknown>,
        copyGlob?: Record<string, unknown>
    }

const jsonVault: Record<string, SerializedExportProperties> = jsonRaw;

export default function getTestData() : ExportMap{
    const ret: ExportMap = {}
    Object.keys(jsonVault).forEach((path: string)=>{
        if(!(typeof path === 'string')){ throw new Error('test data error')}

        const exportProperties = jsonVault[path]
        const file = exportProperties.file;

        // The exporter gets a full `SMarkdownPage` from dataview, the dump only
        // kept the page metadata, so this is as close as the fixture can get.
        ret[path] = Object.assign({}, exportProperties, {
            file: {
                path: file.path,
                fields: file.fields,
                frontmatter: file.fronmatter,
                tags: file.tags,
                aliases: file.aliases,
                links: file.outlinks
            }
        }) as ExportProperties;
    })
    return ret
}

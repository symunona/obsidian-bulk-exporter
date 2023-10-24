import { ExportMap } from "src/models/export-properties";

import jsonRaw from "./test-vault.json"
// import { PageMetadata } from "obsidian-dataview";

export default function getTestData() : ExportMap{
    const ret: ExportMap = {}
    Object.keys(jsonRaw).forEach((path: any)=>{
        if(!(typeof path === 'string')){ throw new Error('test data error')}

        // @ts-ignore
        const exportProperties: any = jsonRaw[path]
        const file = exportProperties.file;

        exportProperties.file = {
            path: file.path,
            fields: file.fields,
            frontmatter: file.fronmatter,
            tags: file.tags,
            aliases: file.aliases,
            links: file.outlinks
        }

        ret[path] = exportProperties;
    })
    return ret
}

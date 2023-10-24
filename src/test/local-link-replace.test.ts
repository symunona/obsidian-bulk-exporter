
import { getLinksAndAttachments } from "../export/get-links";
import {replaceLocalLinks} from "../export/replace-local-links"
// import { ExportMap, ExportProperties } from "../models/export-properties";

import { ExportMap } from "../models/export-properties"
import getTestData from "./test-vault"

const testVaultExportMap: ExportMap = getTestData();
const indexMd = testVaultExportMap['index.md'];

test('JEST test', ()=>{
    expect(1+2).toBe(3)
})

describe('getLinks', ()=>{
    test('gets  all the links from index file', ()=>{
        const {links} = getLinksAndAttachments(indexMd.content)
        expect(links.length).toBe(parseInt(indexMd.frontMatter['internalLinks']))

    })
    /** Test if the script finds all the links in a markdown file. */
    Object.keys(testVaultExportMap).forEach((path)=>{
        const exportProperties = testVaultExportMap[path]
        test('Link collection: ' + path, ()=>{

            if (!exportProperties.frontMatter['links']){
                throw new Error(path + ' - please fill in the links metadata key for testing!')
            }
            const metadataLinkCount = parseInt(exportProperties.frontMatter['links'])

            const {links} = getLinksAndAttachments(exportProperties.content)

            // if (links.length !== metadataLinkCount){
            //     console.error(links)
            // }

            expect(links.length).toBe(metadataLinkCount);
        })
    })

    /** Test if the script finds all the embedded attachments. */
    Object.keys(testVaultExportMap).forEach((path)=>{

        const exportProperties = testVaultExportMap[path]

        test('Embedded Attachments: ' + path, ()=>{
            if (!exportProperties.frontMatter['embedLinks']){
                throw new Error(path + ' - please fill in the embedLinks metadata key for testing!')
            }

            const {attachments} = getLinksAndAttachments(exportProperties.content)

            const metadataLinkCount = parseInt(exportProperties.frontMatter['embedLinks'])

            expect(attachments.length).toBe(metadataLinkCount);

        })
    })
})

test('get subpage links', ()=>{
    const results = replaceLocalLinks(indexMd, testVaultExportMap)
})
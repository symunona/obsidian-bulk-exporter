import { getLinksAndAttachments } from "../export/get-links-and-attachments";

import { ExportMap } from "../models/export-properties"
import getTestData from "./test-vault"

const testVaultExportMap: ExportMap = getTestData();
const indexMd = testVaultExportMap['index.md'];

const OUTPUT_FIELDS_TO_TEST = [
    'links',
    'internalLinks',
    'externalLinks',
    'attachments',
    'internalAttachments',
    'externalAttachments',
    'headerAttachments'
]

test('JEST test', () => {
    expect(1 + 2).toBe(3)
})

describe('getLinksAndAttachments', () => {
    test('gets  all the links from index file', () => {
        const { links } = getLinksAndAttachments(indexMd.content)
        expect(links.length).toBe(parseInt(indexMd.frontMatter['internalLinks']))

    })

    Object.keys(testVaultExportMap).forEach((path) => {
        const exportProperties = testVaultExportMap[path]
        const result = getLinksAndAttachments(exportProperties.content)

        describe(path, () => {
            Object.keys(result).forEach((el)=>{
                const shouldBe = exportProperties.frontMatter[el] || 0
                test(el + ' ' + shouldBe, ()=>{
                    if (OUTPUT_FIELDS_TO_TEST.indexOf(el) > -1){
                        // @ts-ignore
                        const list: Array<MarkdownLink> = result[el]
                        const count = parseInt(shouldBe)
                        expect(list.length).toBe(count)
                    }
                })
            })
        })
    })

})

describe('getAssetFolder', () => {

})

//

describe('getLinkRoot', ()=>{

})
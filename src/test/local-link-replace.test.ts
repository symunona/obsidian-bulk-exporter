
// import { collectAndReplaceHeaderAttachments } from "src/export/get-markdown-attachments";
import { getLinksAndAttachments } from "../export/get-links-and-attachments";

import { ExportMap } from "../models/export-properties"
import getTestData from "./test-vault"
// import { DEFAULT_SETTINGS } from "src/main";

const testVaultExportMap: ExportMap = getTestData();
const indexMd = testVaultExportMap['index.md'];

// const OUTPUT_FIELDS_TO_TEST = [
//     'links',
//     'internalLinks',
//     'externalLinks',
//     'attachments',
//     'internalAttachments',
//     'externalAttachments',
//     'headerAttachments'
// ]

test('JEST test', () => {
    expect(1 + 2).toBe(3)
})

describe('getLinksAndAttachments', () => {
    test('gets  all the links from index file', () => {
        const { links } = getLinksAndAttachments(indexMd.content)
        expect(links.length).toBe(parseInt(indexMd.frontMatter['internalLinks']))

    })

    // Object.keys(testVaultExportMap).forEach((path) => {
    //     const exportProperties = testVaultExportMap[path]
    //     const result = getLinksAndAttachments(exportProperties.content)

    //     describe(path, () => {
    //         Object.keys(result).forEach((el)=>{
    //             const shouldBe = exportProperties.frontMatter[el] || 0
    //             test(el + ' ' + shouldBe, ()=>{
    //                 if (OUTPUT_FIELDS_TO_TEST.indexOf(el) > -1){
    //                     // @ts-ignore
    //                     const list: Array<MarkdownLink> = result[el]
    //                     const count = parseInt(shouldBe)
    //                     expect(list.length).toBe(count)
    //                 }
    //             })
    //         })
    //     })
    // })

    // const exportProperties = testVaultExportMap['posts1/subfolder/embedded asset tests.md']
    // const result = getLinksAndAttachments(exportProperties.content)
    // describe(exportProperties.file.path, ()=>{
    //     Object.keys(result).forEach((el)=>{
    //         if (OUTPUT_FIELDS_TO_TEST.indexOf(el) > -1){
    //             test(el, ()=>{
    //                     // @ts-ignore
    //                     const list: Array<MarkdownLink> = result[el]
    //                     const count = parseInt(exportProperties.frontMatter[el] || 0)
    //                     expect(list.length).toBe(count)
    //             })
    //         }
    //     })
    // })

    const exportProperties = testVaultExportMap['posts1/header-image-test.md']
    // const result = getLinksAndAttachments(exportProperties.content)
    // const settings = Object.assign({}, DEFAULT_SETTINGS)
    describe('export: ' + exportProperties.file.path, ()=>{
        // collectAndReplaceHeaderAttachments(result.internalHeaderAttachments, settings)
    })

})

// Asset folder depends on:
// - file's target path
// - absoluteAssets:
//   - true: relativeFileRoot + assetPath + assetGeneratedName
//   - false: file's path + assetPath + assetGeneratedName
describe('getAssetFolder', () => {

})

//

describe('getLinkRoot', ()=>{

})
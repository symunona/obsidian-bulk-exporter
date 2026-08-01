import { getLinksAndAttachments, AttachmentLink, LinkParseResults } from "../export/get-links-and-attachments";

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
        const { internalLinks } = getLinksAndAttachments(indexMd.content)
        // The fixture is a JSON dump: frontMatter values that came from
        // Dataview counts are serialized as strings.
        const expectedInternalLinks = indexMd.frontMatter['internalLinks'] as string
        expect(internalLinks.length).toBe(parseInt(expectedInternalLinks))

    })

    Object.keys(testVaultExportMap).forEach((path) => {
        const exportProperties = testVaultExportMap[path]
        const result = getLinksAndAttachments(exportProperties.content)

        describe(path, () => {
            Object.keys(result).forEach((el)=>{
                const key = el as keyof LinkParseResults
                const shouldBe = (exportProperties.frontMatter[el] as string | number | undefined) || 0
                test(el + ' ' + shouldBe, ()=>{
                    if (OUTPUT_FIELDS_TO_TEST.indexOf(el) > -1){
                        const list = result[key] as Array<AttachmentLink>
                        const count = parseInt(String(shouldBe))
                        expect(list.length).toBe(count)
                    }
                })
            })
        })
    })

})

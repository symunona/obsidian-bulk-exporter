import { FullIndex, PageMetadata } from "obsidian-dataview";
import { dirname } from "path";
import { ExportMap } from "src/models/export-properties";


const MAX_ENUM_LENGTH = 50;

/**
 * `obsidian-dataview`'s shipped `.d.ts` files re-export their public types
 * (`FullIndex`, `PageMetadata`, ...) from bare specifiers like
 * `"data-index/index"` instead of relative paths. Those only resolve inside
 * the package's own build, so from this project every type that flows
 * through them - including `FullIndex.pages` and `PageMetadata.frontmatter`
 * - is an unchecked/error type. These interfaces document, honestly, the
 * subset of the real Dataview shapes this module reads (see
 * `obsidian-dataview`'s `data-model/markdown.d.ts` and
 * `data-index/index.d.ts`), so the rest of the file can be typed normally.
 */
type FrontMatterRecord = Record<string, unknown>;

interface DataviewPageMeta {
    path: string;
    frontmatter: FrontMatterRecord;
}

interface DataviewIndex {
    pages: Map<string, DataviewPageMeta>;
}

/**
 * Casts Dataview values down to the fields this module actually reads.
 * `FullIndex`/`PageMetadata` themselves can't be checked here (see above),
 * so these are plain assertions rather than runtime-validated narrowing -
 * the shape is guaranteed by the Dataview API, not user-controlled.
 */
function asIndex(index: FullIndex): DataviewIndex {
    return index as DataviewIndex;
}

function asPageMeta(file: PageMetadata): DataviewPageMeta {
    return file as DataviewPageMeta;
}

export class FolderMeta {
    resultsMap: { [path: string]: { [attributeKey: string]: Array<string> } };

    constructor(index: FullIndex) {
        this.createFolderMetaIndex(index);
    }
    createFolderMetaIndex(index: FullIndex) {
        // const startTime = new Date();
        this.resultsMap = {};
        // console.log('index pages', index.pages)
        asIndex(index).pages.forEach((file) => {
            const folderName = dirname(file.path)
            this.resultsMap[folderName] = this.resultsMap[folderName] || {};
            const pathEntry = this.resultsMap[folderName];
            Object.keys(file.frontmatter).map(attributeKey => {
                const value = file.frontmatter[attributeKey];
                const existingValues = pathEntry[attributeKey] || [];

                appendIfQualify(existingValues, value);

                if (Array.isArray(value)) {
                    value.forEach((subValue: unknown) => {
                        appendIfQualify(existingValues, subValue);
                    });
                }
                pathEntry[attributeKey] = [...new Set(existingValues)];
            });
        });
    }
}

/**
 * @param listOfFiles
 * @param index
 * @returns
 */
export function getMetaFieldsAndValues(listOfFiles: Array<PageMetadata>, index: FullIndex) {
    // const startTime = new Date();
    const resultsMap: { [key: string]: Array<string>} = {};
    listOfFiles.forEach(file => {
        const frontmatter = asPageMeta(file).frontmatter;
        Object.keys(frontmatter).map(attributeKey => {
            const value = frontmatter[attributeKey];
            const existingValues = resultsMap[attributeKey] || [];

            appendIfQualify(existingValues, value);

            if (Array.isArray(value)) {
                value.forEach((subValue: unknown) => {
                    appendIfQualify(existingValues, subValue);
                });
            }
            resultsMap[attributeKey] = [...new Set(existingValues)];
        });
    });
    return resultsMap
}

export type PropertyMap = { [key: string]: Array<string>}

/**
 * @param mapOfFiles
 * @param index
 * @returns
 */
export function getMetaFields(mapOfFiles: ExportMap) {
    const resultsMap: PropertyMap = {};
    Object.keys(mapOfFiles).forEach((filePath: string)  => {
        // `ExportProperties.frontMatter` is `Record<string, Literal>`, and
        // `Literal` comes from the same unresolvable `obsidian-dataview`
        // type chain described above, so it's cast to the same honest shape.
        const frontMatter = mapOfFiles[filePath].frontMatter as FrontMatterRecord;

        Object.keys(frontMatter).map(attributeKey => {
            const value = frontMatter[attributeKey];
            const existingValues = resultsMap[attributeKey] || [];

            appendIfQualify(existingValues, value);

            if (Array.isArray(value)) {
                value.forEach((subValue: unknown) => {
                    appendIfQualify(existingValues, subValue);
                });
            }
            resultsMap[attributeKey] = [...new Set(existingValues)];
        });
    });
    return resultsMap
}

function appendIfQualify(array: Array<string>, value: unknown) {
    if (typeof value === "number") {
        array.push(value.toString());
    }
    if (typeof value === "string" && value.length < MAX_ENUM_LENGTH) {
        array.push(value);
    }
}
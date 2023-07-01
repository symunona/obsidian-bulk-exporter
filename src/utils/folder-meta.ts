import { FullIndex } from "obsidian-dataview";
import { dirname } from "path";
import { ExportMap } from "src/models/export-properties";
import _ from "underscore";


const MAX_ENUM_LENGTH = 50;

export class FolderMeta {
    resultsMap: { [path: string]: { [attributeKey: string]: Array<string> } };

    constructor(index: FullIndex) {
        this.createFolderMetaIndex(index);
    }
    createFolderMetaIndex(index: FullIndex) {
        // const startTime = new Date();
        this.resultsMap = {};
        // console.log('index pages', index.pages)
        index.pages.forEach(file => {
            const folderName = dirname(file.path)
            this.resultsMap[folderName] = this.resultsMap[folderName] || {};
            const pathEntry = this.resultsMap[folderName];
            Object.keys(file.frontmatter).map(attributeKey => {
                const value = file.frontmatter[attributeKey];
                const existingValues = pathEntry[attributeKey] || [];

                appendIfQualify(existingValues, value);

                if (_.isArray(value)) {
                    value.forEach((subValue: any) => {
                        appendIfQualify(existingValues, subValue);
                    });
                }
                pathEntry[attributeKey] = _.uniq(existingValues);
            });
        });
    }
}

/**
 * @param listOfFiles
 * @param index
 * @returns
 */
export function getMetaFieldsAndValues(listOfFiles: Array<any>, index: FullIndex) {
    // const startTime = new Date();
    const resultsMap: { [key: string]: Array<string>} = {};
    listOfFiles.forEach(file => {
        Object.keys(file.frontmatter).map(attributeKey => {
            const value = file.frontmatter[attributeKey];
            const existingValues = resultsMap[attributeKey] || [];

            appendIfQualify(existingValues, value);

            if (_.isArray(value)) {
                value.forEach((subValue: any) => {
                    appendIfQualify(existingValues, subValue);
                });
            }
            resultsMap[attributeKey] = _.uniq(existingValues);
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
        const file = mapOfFiles[filePath].file

        // @ts-ignore
        const frontMatter = file.frontmatter as {
            [key: string]: string;
        };

        Object.keys(frontMatter).map(attributeKey => {
            const value = frontMatter[attributeKey];
            const existingValues = resultsMap[attributeKey] || [];

            appendIfQualify(existingValues, value);

            if (_.isArray(value)) {
                value.forEach((subValue: any) => {
                    appendIfQualify(existingValues, subValue);
                });
            }
            resultsMap[attributeKey] = _.uniq(existingValues);
        });
    });
    return resultsMap
}

function appendIfQualify(array: Array<any>, value: any) {
    if (_.isNumber(value)) {
        array.push(value.toString());
    }
    if (_.isString(value) && value.length < MAX_ENUM_LENGTH) {
        array.push(value);
    }
}
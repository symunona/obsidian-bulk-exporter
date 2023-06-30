import { TAbstractFile } from "obsidian";

export type ExportProperties = {
    content: string;
    md5: string;
    file: TAbstractFile,
    newFileName: string,
    from: string,
    to: string,
    toRelative: string,
    group: string
}

export type ExportMap = { [key: string]: ExportProperties }
export type ExportGroupMap = {[group: string]: Array<ExportProperties>}

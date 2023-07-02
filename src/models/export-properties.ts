import { TAbstractFile } from "obsidian";

export type ExportProperties = {
	toRelativeDir: string;
    content: string;
    md5: string;
    file: TAbstractFile | null,
    newFileName: string,
    from: string,
    to: string,
    toRelative: string,
    lastExportDate: number
}

export type ExportMap = { [key: string]: ExportProperties }
export type ExportGroupMap = {[group: string]: Array<ExportProperties>}

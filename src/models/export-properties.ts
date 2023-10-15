import { TAbstractFile } from "obsidian";
import { AttachmentStat } from "src/export/get-markdown-attachments";
import { GlobMap } from "src/export/globCopy";
import { LinkStat } from "src/export/replace-local-links";

export type ExportProperties = {
	toRelativeDir: string;
    content: string;
    md5: string;
    frontMatter: {[key: string]: any};
    file: TAbstractFile | null,
    newFileName: string,
    from: string,
    to: string,
    toRelative: string,
    lastExportDate: number,
    copyGlob?: GlobMap,
    imageInBody?: Array<AttachmentStat>,
    imageInMeta?: Array<AttachmentStat>,
    linkStats?: Array<LinkStat>
}

export type ExportMap = { [key: string]: ExportProperties }
export type ExportGroupMap = {[group: string]: Array<ExportProperties>}

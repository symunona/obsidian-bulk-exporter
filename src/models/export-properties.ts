import { Literal, SMarkdownPage } from "obsidian-dataview";
import { AttachmentStat } from "../export/get-markdown-attachments";
import { GlobMap } from "../export/globCopy";
import { LinkStat } from "../export/replace-local-links";

export type ExportProperties = {
	toRelativeDir: string;
    content: string;
    md5: string;
    frontMatter: Record<string, Literal>;
    file: SMarkdownPage,
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

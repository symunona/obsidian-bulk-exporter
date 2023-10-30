import { Literal, SMarkdownPage } from "obsidian-dataview";
import { GlobMap } from "../export/globCopy";
import { AttachmentLink, LinkParseResults } from "src/export/get-links-and-attachments";

export type ExportProperties = {
	toRelativeToExportDirRoot: string;
    content: string;
    md5: string;
    frontMatter: Record<string, Literal>;
    file?: SMarkdownPage,
    newFileName: string,
    from: string,
    toAbsoluteFs: string,
    toRelative: string,
    lastExportDate: number,
    copyGlob?: GlobMap,
    imageInBody?: Array<AttachmentLink>,
    imageInMeta?: Array<AttachmentLink>,
    linkStats?: Array<AttachmentLink>
    linksAndAttachments?: LinkParseResults
}

export type ExportMap = { [key: string]: ExportProperties }
export type ExportGroupMap = {[group: string]: Array<ExportProperties>}

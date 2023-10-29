import BulkExporterPlugin from "src/main";
import { ExportProperties } from "src/models/export-properties";
// import { collectAndReplaceHeaderAttachments } from "./get-markdown-attachments";
import { isArray, isString } from "underscore";
import { GlobMap, copyGlob } from "./globCopy";
import { getLinksAndAttachments } from "./get-links-and-attachments";
import {  } from "./replace-local-links";

/**
 * This function assumes, that we have the file content loaded into the
 * `content`
 * parameter within fileExportProperties, and overwrites that, removing/
 * moving the references further described in get-markdown-attachments.ts.
 *
 * @param fileExportProperties file being processed
 * @param settings to retrieve assetPath
 * @param plugin
 * @returns
 */
export async function collectAssets(
	fileExportProperties: ExportProperties,
	plugin: BulkExporterPlugin
) {
    // const linksAndAttachments = getLinksAndAttachments(fileExportProperties.content)

    // collectAndReplaceHeaderAttachments(plugin, plugin.settings, fileExportProperties, linksAndAttachments.internalAttachments)

	// Look for images!
	// const imageLinkListInBodyMap = await replaceImageLinks(
	// 	fileExportProperties,

	// 	plugin
	// );
	// Object.keys(imageLinkListInBodyMap).map((key)=>{
	// 	imageLinkListInBody.push(imageLinkListInBodyMap[key])
	// })

	// const imageLinkListInMetaMap = await replaceImageLinksInMetaData(
	// 	fileExportProperties,
	// 	plugin
	// );
	// Object.keys(imageLinkListInMetaMap).map((key)=>{
	// 	imageLinkListInMeta.push(imageLinkListInMetaMap[key])
	// })

	const frontMatterData = fileExportProperties.frontMatter;

	const filesCopied: GlobMap = {}
	if (frontMatterData && frontMatterData.copy) {
		// const relativeRoot = parse(fileExportProperties.from).dir
		// log(`[glob] [${fileExportProperties.newFileName}.md] has a copy property.
		// Looking for file matches here: ${relativeRoot}`);
		// Iterate every file that matches the regex.
		if (isArray(frontMatterData.copy)) {
			for(let i = 0; i < frontMatterData.copy.length; i++){
				const globPattern = frontMatterData.copy[i]
				filesCopied[globPattern] = await copyGlob(fileExportProperties, globPattern, plugin)
			}
		} else if (isString(frontMatterData.copy)) {
			filesCopied[frontMatterData.copy] = await copyGlob(fileExportProperties, frontMatterData.copy, plugin)
		}
	}
	// fileExportProperties.imageInBody = imageLinkListInBody;
	// fileExportProperties.imageInMeta = imageLinkListInMeta;
	fileExportProperties.copyGlob = filesCopied

	return fileExportProperties
}
import BulkExporterPlugin from "src/main";
import { ExportMap, ExportProperties } from "src/models/export-properties";
import { collectAndReplaceHeaderAttachments, collectAndReplaceInlineAttachments } from "./get-markdown-attachments";
import { isArray, isString } from "underscore";
import { GlobMap, copyGlob } from "./globCopy";
import { getLinksAndAttachments } from "./get-links-and-attachments";
import { replaceLocalLinks } from "./replace-local-links";
import { BulkExportSettings } from "src/models/bulk-export-settings";

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
export async function collectAssetsReplaceLinks(
	fileExportProperties: ExportProperties,
	allFileListMap: ExportMap,
	settings: BulkExportSettings,
	plugin: BulkExporterPlugin
) {
	const linksAndAttachments = getLinksAndAttachments(fileExportProperties.content)
	fileExportProperties.linksAndAttachments = linksAndAttachments
	fileExportProperties.outputContent = linksAndAttachments.markdownReplacedWikiStyleLinks

	// console.warn(fileExportProperties.newFileName, linksAndAttachments)

	collectAndReplaceHeaderAttachments(plugin, settings, fileExportProperties, linksAndAttachments.internalHeaderAttachments)
	collectAndReplaceInlineAttachments(plugin, settings, fileExportProperties, linksAndAttachments.internalAttachments)

	replaceLocalLinks(
		fileExportProperties,
		linksAndAttachments.internalLinks,
		allFileListMap,
		plugin
	);

	const frontMatterData = fileExportProperties.frontMatter;

	const filesCopied: GlobMap = {}
	if (frontMatterData && frontMatterData.copy) {
		// const relativeRoot = parse(fileExportProperties.from).dir
		// log(`[glob] [${fileExportProperties.newFileName}.md] has a copy property.
		// Looking for file matches here: ${relativeRoot}`);
		// Iterate every file that matches the regex.
		if (isArray(frontMatterData.copy)) {
			for (let i = 0; i < frontMatterData.copy.length; i++) {
				const globPattern = frontMatterData.copy[i]
				filesCopied[globPattern] = await copyGlob(fileExportProperties, globPattern, plugin)
			}
		} else if (isString(frontMatterData.copy)) {
			filesCopied[frontMatterData.copy] = await copyGlob(fileExportProperties, frontMatterData.copy, plugin)
		}
	}

	fileExportProperties.copyGlob = filesCopied

	return fileExportProperties
}
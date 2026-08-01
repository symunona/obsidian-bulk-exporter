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
	// The export log and the stats modal read `linkStats` to list the local links of
	// a file, and to show the per-link `error` set by `replaceLocalLinks` below.
	// Assign it up front, so it is populated even if something throws further down.
	fileExportProperties.linkStats = linksAndAttachments.internalLinks
	fileExportProperties.outputContent = linksAndAttachments.markdownReplacedWikiStyleLinks

	// console.warn(fileExportProperties.newFileName, linksAndAttachments)

	collectAndReplaceHeaderAttachments(plugin, settings, fileExportProperties, linksAndAttachments.internalHeaderAttachments)
	collectAndReplaceInlineAttachments(plugin, settings, fileExportProperties, linksAndAttachments.internalAttachments)

	replaceLocalLinks(
		fileExportProperties,
		linksAndAttachments.internalLinks,
		allFileListMap,
		settings,
		plugin
	);

	const frontMatterData = fileExportProperties.frontMatter;

	const filesCopied: GlobMap = {}
	if (frontMatterData && frontMatterData.copy) {
		// const relativeRoot = parse(fileExportProperties.from).dir
		// log(`[glob] [${fileExportProperties.newFileName}.md] has a copy property.
		// Looking for file matches here: ${relativeRoot}`);
		// Iterate every file that matches the regex.
		// `frontMatter` is typed as `Record<string, Literal>`, and dataview's `Literal`
		// resolves to an unresolved type (see the note in exporter.ts on dataview's broken
		// package-root re-exports), so `copy` needs an honest cast here: per the plugin's
		// own docs/usage, a `copy` front-matter key is always a glob string or an array of
		// them.
		if (isArray(frontMatterData.copy)) {
			const globPatterns = frontMatterData.copy as string[];
			for (let i = 0; i < globPatterns.length; i++) {
				const globPattern = globPatterns[i]
				filesCopied[globPattern] = await copyGlob(fileExportProperties, globPattern, plugin)
			}
		} else if (isString(frontMatterData.copy)) {
			const globPattern = frontMatterData.copy;
			filesCopied[globPattern] = await copyGlob(fileExportProperties, globPattern, plugin)
		}
	}

	fileExportProperties.copyGlob = filesCopied

	return fileExportProperties
}
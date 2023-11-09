import { ExportMap, ExportProperties } from "../models/export-properties";
import { warn } from "console";
import replaceAll from "../utils/replace-all";
import { AttachmentLink } from "./get-links-and-attachments";
import BulkExporterPlugin from "src/main";

/**
 * Supports obsidian: formatted links, replaces exportProperties' content.
 * @param exportProperties
 * @param allFileListMap
 */
export function replaceLocalLinks(
	exportProperties: ExportProperties,
	links: Array<AttachmentLink>,
	allFileListMap: ExportMap,
	plugin: BulkExporterPlugin
) {
	for (const index in links) {
		const link = links[index]
		const original = link.originalPath;
		const title = link.text;

		// See if this link exists in the vault!
		const linkedDocument = plugin.app.metadataCache.getFirstLinkpathDest(
			decodeURIComponent(link.normalizedOriginalPath),
			exportProperties.from
		);

		if (!linkedDocument) {
			link.error = "Internal Link Not Found at all!"
			exportProperties.outputContent = replaceAll(
				`[${title}](${original})`,
				exportProperties.outputContent,
				`${title}`
			);
			warn('Internal link not found! Removing. ', title, original)
			continue

		}
		const path = linkedDocument.path

		// Replace all links that point to other markdown files.
		// If not found, send a warning.
		if (allFileListMap[path]) {
			const newFilePath = allFileListMap[path].toRelative;

			// Remove the extension!
			const newLink = newFilePath.substring(
				0,
				newFilePath.lastIndexOf(".")
			);
			// There are spaces in the URL, normalize it!
			if (newLink.indexOf(' ') > -1) {
				newLink.split('/').map((urlPart) => encodeURIComponent(urlPart))
			}
			link.newPath = newLink
			const newLinkWithTitle = `[${title}](${newLink})`;
			exportProperties.outputContent = replaceAll(
				`[${title}](${original})`,
				exportProperties.outputContent,
				newLinkWithTitle);
		} else {
			// Removed as it's pointing to a file that's not being exported.
			warn("Internal link not found in output, removing!", original, title, path);
			link.error = "Internal Link FOUND but not public, removed!"

			exportProperties.outputContent = replaceAll(
				`[${title}](${original})`,
				exportProperties.outputContent,
				`${title}`
			);
		}
	}
}

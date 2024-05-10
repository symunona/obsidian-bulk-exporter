import { ExportMap, ExportProperties } from "../models/export-properties";
import { warn } from "console";
import replaceAll from "../utils/replace-all";
import { AttachmentLink } from "./get-links-and-attachments";
import BulkExporterPlugin from "src/main";
import { BulkExportSettings } from "src/models/bulk-export-settings";

/**
 * Supports obsidian: formatted links, replaces exportProperties' content.
 * @param exportProperties
 * @param allFileListMap
 */
export function replaceLocalLinks(
	exportProperties: ExportProperties,
	links: Array<AttachmentLink>,
	allFileListMap: ExportMap,
	settings: BulkExportSettings,
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
			if (!settings.keepLinksNotFound){
				exportProperties.outputContent = replaceAll(
					`[${title}](${original})`,
					exportProperties.outputContent,
					`${title}`
				);

				warn('Internal link not found! Removed.', title, original)
				link.error = "Internal Link Not Found at all! Removed."
			} else {
				// Still need to replace the link with the original normalized link, because
				// it might be a wiki link.
				let newLink = link.normalizedOriginalPath
				if (newLink.indexOf(' ') > -1 && settings.normalizeSpacesInLinks) {
					newLink = newLink.split('/').map((urlPart) => encodeURIComponent(urlPart)).join('/')
				}

				replaceAll(
					`[${title}](${original})`,
					exportProperties.outputContent,
					`[${title}](${newLink})`)

				warn('Internal link not found! Keeping due to settings keep not found. ', title, original)
				link.error = "Internal Link Not Found, NOT replacing due to Keep Links Not Found setting keep not found!"
			}
			continue

		}
		const path = linkedDocument.path

		// Replace all links that point to other markdown files.
		// If not found, send a warning.
		if (allFileListMap[path]) {
			const newFilePath = allFileListMap[path].toRelative;

			// Remove the extension!
			let newLink = newFilePath.substring(
				0,
				newFilePath.lastIndexOf(".")
			);

			// There are spaces in the URL, normalize it!
			if (newLink.indexOf(' ') > -1 && settings.normalizeSpacesInLinks) {
				newLink = newLink.split('/').map((urlPart) => encodeURIComponent(urlPart)).join('/')
			}
			link.newPath = newLink
			let newLinkWithTitle = `[${title}](${newLink})`;

			// If a user wants spaces in their filenames in their output, normal [link](url)
			// styled links do not cut it, as the matcher will have problems in other MD parsers
			// than Obsidian. To eliminate this, we do two things:
			// 1.- remember if it was a wiki link, and if it was, just render it as a wiki link.
			// 2.- if it's not, but has a space, encode it with HTML encoding.
			// only if it was not a wiki-link and it did not have a space preserve the original.
			// @see discussion: https://forum.obsidian.md/t/how-to-link-a-file-with-filename-with-spaces/22592
			// @see issue: https://github.com/symunona/obsidian-bulk-exporter/issues/3
			if (link?.isWikiLink && settings.preserveWikiLinks) {
				if (title === newLink) {
					newLinkWithTitle = `[[${title}]]`
				} else {
					newLinkWithTitle = `[[${newLink}|${title}]]`
				}
			}

			exportProperties.outputContent = replaceAll(
				`[${title}](${original})`,
				exportProperties.outputContent,
				newLinkWithTitle);
		} else {
			// Removed as it's pointing to a file that's not being exported.
			if (!settings.keepLinksPrivate){
				warn("Internal link not found in output, removing!", original, title, path);
				link.error = "Internal Link FOUND but not public, removed!"

				exportProperties.outputContent = replaceAll(
					`[${title}](${original})`,
					exportProperties.outputContent,
					`${title}`
				);
			} else {
				let newLink = link.normalizedOriginalPath
				if (newLink.indexOf(' ') > -1 && settings.normalizeSpacesInLinks) {
					newLink = newLink.split('/').map((urlPart) => encodeURIComponent(urlPart)).join('/')
				}
				exportProperties.outputContent = replaceAll(
					`[${title}](${original})`,
					exportProperties.outputContent,
					`[${title}](${newLink})`)
				warn("Internal link not found in output, kept due to settings keep private!", original, title, path);
				link.error = "Internal Link FOUND but not public, kept due to settings keep private!"
			}
		}
	}
}

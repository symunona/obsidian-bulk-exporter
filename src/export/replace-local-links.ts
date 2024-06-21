import { ExportMap, ExportProperties } from "../models/export-properties";
import replaceAll from "../utils/replace-all";
import { AttachmentLink, normalizeUrl } from "./get-links-and-attachments";
import BulkExporterPlugin from "src/main";
import { BulkExportSettings } from "src/models/bulk-export-settings";

const warn = console.warn.bind(console);

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

		// See if this link exists in the vault!
		const linkedDocument = plugin.app.metadataCache.getFirstLinkpathDest(
			decodeURIComponent(link.normalizedOriginalPath),
			exportProperties.from
		);

		if (!linkedDocument) {
			if (!settings.keepLinksNotFound){
				removeLinks(link, exportProperties)

				warn('Internal link not found! Removed.', link.text, link.originalPath)
				link.error = "Internal Link Not Found at all! Removed."
			} else {
				replaceLinks(link.normalizedOriginalPath, link, settings, exportProperties)

				warn('Internal link not found! Keeping due to settings keep not found. ', link.text, link.originalPath)
				link.error = "Internal Link Not Found, NOT replacing due to Keep Links Not Found setting keep not found!"
			}
			continue

		}
		const path = linkedDocument.path

		// Replace all links that point to other markdown files.
		// If not found, send a warning.
		if (allFileListMap[path]) {
			const newFilePath = allFileListMap[path].toRelative;

			// Remove the extension from actual links.
			const newLink = newFilePath.substring(
				0,
				newFilePath.lastIndexOf(".")
			);
			replaceLinks(newLink, link, settings, exportProperties)

		} else {
			// Removed as it's pointing to a file that's not being exported.
			if (!settings.keepLinksPrivate){
				warn("Internal link not found in output, removing!", link.originalPath, link.text, path);
				link.error = "Internal Link FOUND but not public, removed!"

				removeLinks(link, exportProperties)
			} else {
				replaceLinks(link.normalizedOriginalPath, link, settings, exportProperties)

				warn("Internal link not found in output, kept due to settings keep private!", link.originalPath, link.text, path);
				link.error = "Internal Link FOUND but not public, kept due to settings keep private!"
			}
		}
	}
}

/**
 * Remove the links and leave the title of the link.
 * @param link
 * @param exportProperties
 */
function removeLinks(link:AttachmentLink, exportProperties: ExportProperties){
	exportProperties.outputContent = replaceAll(
		`[${link.text}](${link.originalPath})`,
		exportProperties.outputContent,
		`${link.text}`
	);
}

/**
 * It handles wiki links, and spaces depending on settings
 * @param newLink
 * @param link
 * @param settings
 * @param exportProperties
 */
export function replaceLinks(newLink: string, link: AttachmentLink, settings:BulkExportSettings, exportProperties: ExportProperties){
	const title = link.text
	const original = link.originalPath
	// There are spaces in the URL, normalize it!
	if (newLink.indexOf(' ') > -1 && settings.normalizeSpacesInLinks) {
		newLink = newLink.split('/').map((urlPart) => encodeURIComponent(urlPart)).join('/')
	}

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
			// An edge case: if:
			// - this is a WIKI link
			// - preserve wiki links
			// - keepWikiLinksAsIs
			// we can just leave the original, as e.g. quartz can link it up.
			if (settings.keepWikiLinksAsIs){

				newLinkWithTitle = `[[${normalizeUrl(link.originalPath)}]]`
			} else {
				// Do update to the new relative path.
				newLinkWithTitle = `[[${newLink}|${title}]]`
			}
		}
	}

	exportProperties.outputContent = replaceAll(
		`[${title}](${original})`,
		exportProperties.outputContent,
		newLinkWithTitle);
}
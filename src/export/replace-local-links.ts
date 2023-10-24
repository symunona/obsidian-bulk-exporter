import { ExportMap, ExportProperties } from "../models/export-properties";
import { getLinks } from "./get-markdown-attachments";
import { log, warn } from "console";
import { dirname, join } from "path";
import replaceAll from "../utils/replace-all";

export type LinkType = 'external' | 'internalFound' | 'internalNotFound';

export interface LinkStat {
	text: string
	url: string
	type: LinkType,
	original?: string,
	newUrl?: string
}
/**
 * Supports obsidian: formatted links, replaces exportProperties' content.
 * @param exportProperties
 * @param allFileListMap
 */
export function replaceLocalLinks(
	exportProperties: ExportProperties,
	allFileListMap: ExportMap
) {
	const links = getLinks(exportProperties.content);
	const linkStats: Array<LinkStat> = []

	for (const index in links) {
		const original = links[index][0].trim();
		const linkUrlEncrypted = links[index][links[index].length - 2];
		let link = decodeURI(linkUrlEncrypted);

		const title = links[index][1];

		// EXTERNAL link
		if (link.startsWith("http")) {
			log("Skipping URL", title, link);
			linkStats.push({text: title, url: link, type: "external"})
			continue;
		}

		// Internal link, starting with obsidian://
		if (link.startsWith("obsidian://")) {
			// Just grab the file value from the link.
			const fileLink = decodeURIComponent(
				link.substring(link.indexOf("&file=") + 6)
			);
			link = fileLink;
		}

		// Get the dir of the file being exported
		const fromDir = dirname(exportProperties.from);
		// Guess where the file may be, the file's relative position.
		const linkWithMd = link + ".md";
		const guessRelative = join(fromDir, linkWithMd);

		// Replace all links that point to other markdown files.
		// If not found, send a warning.
		if (allFileListMap[linkWithMd]) {
			const newFilePath = allFileListMap[linkWithMd].toRelative;
			// Remove the extension!
			const newLink = newFilePath.substring(
				0,
				newFilePath.lastIndexOf(".")
			);
			linkStats.push({text: title, url: link, type: "internalFound", original, newUrl: newLink})
			const newLinkWithTitle = `[${title}](${newLink})`;
			exportProperties.content = replaceAll(
				original,
				exportProperties.content,
				newLinkWithTitle
			);
		} else if (allFileListMap[guessRelative]) {
			const newFilePath = allFileListMap[guessRelative].toRelative;
			// Remove the extension!
			const newLink = newFilePath.substring(
				0,
				newFilePath.lastIndexOf(".")
			);
			const newLinkWithTitle = `[${title}](${newLink})`;
			linkStats.push({text: title, url: link, type: "internalFound", original, newUrl: newLink})
			exportProperties.content = replaceAll(
				original,
				exportProperties.content,
				newLinkWithTitle
			);
		} else {
			warn("Local link not found, removing!", link, title);
			linkStats.push({text: title, url: link, type: "internalNotFound"})
			exportProperties.content = replaceAll(
				original,
				exportProperties.content,
				`${title}`
			);
		}
	}
	return linkStats;
}

import { ExportMap, ExportProperties } from "src/models/export-properties";
import { getLinks } from "./get-markdown-attachments";
import { log, warn } from "console";
import { dirname, join } from "path";
import replaceAll from "src/utils/replace-all";

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

	for (const index in links) {
		const original = links[index][0].trim();
		const linkUrlEncrypted = links[index][links[index].length - 2];
		let link = decodeURI(linkUrlEncrypted);

		const title = links[index][1];

		if (link.startsWith("http")) {
			log("Skipping URL", title, link);
			continue;
		}

		if (link.startsWith("obsidian")) {
			const fileLink = decodeURIComponent(
				link.substring(link.indexOf("&file=") + 6)
			);
			link = fileLink;
		}

		const fromDir = dirname(exportProperties.from);
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
			exportProperties.content = replaceAll(
				original,
				exportProperties.content,
				newLinkWithTitle
			);
		} else {
			warn("Local link not found, removing!", link, title);
			exportProperties.content = replaceAll(
				original,
				exportProperties.content,
				`[${title}]?`
			);
		}
	}
}

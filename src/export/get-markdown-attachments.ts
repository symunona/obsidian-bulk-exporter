/**
 * Inspiration: obsidian-markdown-export plugin.
 *
 * In the source, markdown files can point to any place within the vault.
 * This is not optimal for exporting as we usually want to collect it to
 * one assets folder.
 *
 * Also, there are relative/local links from one note to another
 * they need to be remapped too.
 *
 * Steps:
 *  Links:
 * - collect all links,
 * - check if they are among the exported
 * - if yes, replace the link with their new address
 * - if no, make them plain text.
 *
 *  Images:
 * - find all the embedded images
 * - if they are linked from the web, just ignore
 * - if they are from local refs
 *    - copy them to the asset folder
 *    - replace the image references in content!
 */

import { log } from "console";
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import path, { dirname } from "path";
import BulkExporterPlugin from "src/main";
import { ExportMap, ExportProperties } from "src/models/export-properties";
import { error, warn } from "src/utils/log";
import replaceAll from "src/utils/replace-all";
import { Md5 } from "ts-md5";

export const ATTACHMENT_URL_REGEXP = /!\[\[((.*?)\.(\w+))\]\]/g;
export const MARKDOWN_ATTACHMENT_URL_REGEXP = /!\[(.*?)\]\(((.*?)\.(\w+))\)/g;

// Finds all [title](url) formatted expressions, ignores the ones that are embedded with !
export const LINK_URL_REGEXP = /[^!]\[(.*?)\]\(((.*?))\)/g;
export const EMBED_URL_REGEXP = /!\[\[(.*?)\]\]/g;

export function getImageLinks(markdown: string) {
	const imageLinks = markdown.matchAll(ATTACHMENT_URL_REGEXP);
	const markdownImageLinks = markdown.matchAll(
		MARKDOWN_ATTACHMENT_URL_REGEXP
	);

	return Array.from(imageLinks).concat(Array.from(markdownImageLinks));
}

export function getLinks(markdown: string) {
	return Array.from(markdown.matchAll(LINK_URL_REGEXP));
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
		const guessRelative = path.join(fromDir, linkWithMd);

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

/**
 * Does not yet support pulling external images in, it just leaves them in place.
 * @param exportProperties
 * @param assetPath
 */
export async function replaceImageLinks(
	exportProperties: ExportProperties,
	assetPath: string,
	plugin: BulkExporterPlugin
) {
	const imageLinks = getImageLinks(exportProperties.content);

	for (const index in imageLinks) {
		const urlEncodedImageLink =
			imageLinks[index][imageLinks[index].length - 3];
		const imageLink = decodeURI(urlEncodedImageLink);

		const imageLinkMd5 = Md5.hashStr(imageLink);
		const imageName = path.basename(imageLink);
		const imageNameWithoutExtension = imageName.substring(
			0,
			imageName.lastIndexOf(".")
		);
		const imageExtension = imageName.substring(imageName.lastIndexOf("."));

		const asset = plugin.app.metadataCache.getFirstLinkpathDest(
			imageLink,
			exportProperties.from
		);

		const filePath =
			asset !== null
				? asset.path
				: path.join(path.dirname(exportProperties.from), imageLink);

		// filter markdown link eg: http://xxx.png
		// If this is an external url and we have the importFromWeb true, download the resource.
		if (urlEncodedImageLink.startsWith("http")) {
			log("Skipping Web Resource: ", urlEncodedImageLink);
			continue;
		}

		// Create asset dir if not exists
		const toDir = path.dirname(exportProperties.to);
		const imageTargetFileName =
			imageNameWithoutExtension + "-" + imageLinkMd5 + imageExtension;
		const documentLink = path.join(assetPath, imageTargetFileName);
		const assetAbsoluteTarget = path.join(
			toDir,
			assetPath,
			imageTargetFileName
		);
		const absoluteTargetDir = path.dirname(assetAbsoluteTarget);

		// Update the content with the new asset URL.
		exportProperties.content = replaceAll(
			urlEncodedImageLink,
			exportProperties.content,
			documentLink
		);

		if (!existsSync(absoluteTargetDir)) {
			mkdirSync(absoluteTargetDir, { recursive: true });
			log("Created new group-by asset folder");
		}

		if (!asset) {
			error("Could not find asset ", filePath);
			continue;
		}

		// If we have a local system, use a simple copy, if we
		// have a cloud store, export the binary.
		if (existsSync(assetAbsoluteTarget)) {
			warn("asset already exists", documentLink);
			continue;
		}
		// @ts-ignore : simple way to figure out if we are on the cloud I guess.
		const basePath =  plugin.app.vault.adapter.basePath;

		if (basePath) {
			const fullAssetPath = path.join(
				basePath,
				filePath
			);
			copyFileSync(fullAssetPath, assetAbsoluteTarget);
		} else {
			const assetContent = await plugin.app.vault.readBinary(asset);
			writeFileSync(assetAbsoluteTarget, Buffer.from(assetContent));
		}
	}
}

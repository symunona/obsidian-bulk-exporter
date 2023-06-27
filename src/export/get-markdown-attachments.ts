/**
 * Inspiration: obsidian-markdown-export plugin.
 */

import { log } from "console";
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import path, { dirname } from "path";
import { ExportMap, ExportProperties } from "src/utils/create-path-map";
import { error, warn } from "src/utils/log";
import replaceAll from "src/utils/replace-all";
import { Md5 } from "ts-md5";
// import { Md5 } from "ts-md5";

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
	return Array.from(markdown.matchAll(LINK_URL_REGEXP))
}


export function replaceLocalLinks(exportProperties: ExportProperties, allFileListMap: ExportMap) {
	const links = getLinks(exportProperties.content)

	for (const index in links) {
		const original = links[index][0].trim()
		const linkUrlEncrypted = links[index][links[index].length - 2];
		let link = decodeURI(linkUrlEncrypted);

		const title = links[index][1]

		if (link.startsWith('http')) {
			console.log('Skipping URL', title, link)
			continue
		}

		if (link.startsWith('obsidian')) {
			const fileLink = decodeURIComponent(link.substring(link.indexOf('&file=') + 6))
			link = fileLink
		}

		const fromDir = dirname(exportProperties.from)
		const linkWithMd = link + '.md'
		const guessRelative = path.join(fromDir, linkWithMd)

		// Replace all links that point to other markdown files.
		// If not found, send a warning.
		if (allFileListMap[linkWithMd]) {
			const newFilePath = allFileListMap[linkWithMd].toRelative
			// Remove the extension!
			const newLink = newFilePath.substring(0, newFilePath.lastIndexOf('.'))
			const newLinkWithTitle = `[${title}](${newLink})`
			exportProperties.content = replaceAll(original, exportProperties.content, newLinkWithTitle)
		} else if (allFileListMap[guessRelative]) {
			const newFilePath = allFileListMap[guessRelative].toRelative
			// Remove the extension!
			const newLink = newFilePath.substring(0, newFilePath.lastIndexOf('.'))
			const newLinkWithTitle = `[${title}](${newLink})`
			exportProperties.content = replaceAll(original, exportProperties.content, newLinkWithTitle)
		} else {
			warn('Local link not found, removing!', link, title)
			exportProperties.content = replaceAll(original, exportProperties.content, `[${title}]?`)
		}
	}
}


export async function replaceImageLinks(
	exportProperties: ExportProperties,
	assetPath: string,
	autoImportFromWeb?: boolean,
) {
	const imageLinks = getImageLinks(exportProperties.content);

	for (const index in imageLinks) {
		const urlEncodedImageLink = imageLinks[index][imageLinks[index].length - 3];
		const imageLink = decodeURI(urlEncodedImageLink);

		const imageLinkMd5 = Md5.hashStr(imageLink);
		const imageName = path.basename(imageLink)
		const imageNameWithoutExtension = imageName.substring(0, imageName.lastIndexOf('.'))
		const imageExtension = imageName.substring(imageName.lastIndexOf('.'))

		const asset = this.app.metadataCache.getFirstLinkpathDest(
			imageLink,
			exportProperties.from
		);

		let filePath =
			asset !== null
				? asset.path
				: path.join(path.dirname(exportProperties.from), imageLink);

		// filter markdown link eg: http://xxx.png
		// If this is an external url and we have the importFromWeb true, download the resource.
		if (urlEncodedImageLink.startsWith("http")) {
			if (autoImportFromWeb) {
				filePath = await importImageFromWeb(urlEncodedImageLink)
				// TODO: asset is still null!
			} else {
				error('Skipping Web Resource: ', urlEncodedImageLink)
				continue;
			}
		}

		// Create asset dir if not exists
		const toDir = path.dirname(exportProperties.to)
		const imageTargetFileName = imageNameWithoutExtension + '-' + imageLinkMd5 + imageExtension
		const documentLink = path.join(assetPath, imageTargetFileName)
		const assetAbsoluteTarget = path.join(toDir, assetPath, imageTargetFileName)
		const absoluteTargetDir = path.dirname(assetAbsoluteTarget)

		// Update the content with the new asset URL.
		exportProperties.content = replaceAll(urlEncodedImageLink, exportProperties.content, documentLink)

		if (!existsSync(absoluteTargetDir)) {
			mkdirSync(absoluteTargetDir)
			log('Created new group-by asset folder')
		}

		// console.group(filePath)
		// console.warn(vaultRoot)
		// console.warn(documentLink)
		// console.warn(assetAbsoluteTarget)
		// console.groupEnd()

		if (!asset) {
			error('could not find asset', filePath)
			continue
		}

		// If we have a local system, use a simple copy, if we
		// have a cloud store, export the binary.
		if (existsSync(assetAbsoluteTarget)) {
			warn('asset already exists', documentLink)
			continue
		}
		if (this.app.vault.adapter.basePath) {
			const fullAssetPath = path.join(this.app.vault.adapter.basePath, filePath)
			copyFileSync(fullAssetPath, assetAbsoluteTarget)
		} else {
			const assetContent = await this.app.vault.readBinary(asset)
			writeFileSync(assetAbsoluteTarget, Buffer.from(assetContent))
		}
	}
}

async function importImageFromWeb(url: string) {
	console.warn('AUTO_IMPORT_FROM_WEB: not implemented yet!')
	return 'dummy.png'
}


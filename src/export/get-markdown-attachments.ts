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

import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { basename, dirname, join } from "path";
import BulkExporterPlugin from "../main";
import { ExportProperties } from "../models/export-properties";
import replaceAll, { matchAll } from "../utils/replace-all";
import { Md5 } from "ts-md5";
import { AttachmentLink } from "./get-links-and-attachments";
import { BulkExportSettings } from "src/models/bulk-export-settings";

export const ATTACHMENT_URL_REGEXP = /!\[\[((.*?)\.(\w+))\]\]/g;
export const MARKDOWN_ATTACHMENT_URL_REGEXP = /!\[(.*?)\]\(((.*?)\.(\w+))\)/g;

// Finds all [title](url) formatted expressions, ignores the ones that are embedded with !
// export const LINK_URL_REGEXP = /[^!]\[(.*?)\]\(((.*?))\)/g;
export const LINK_URL_REGEXP = /(\[\[[^\]]+\]\]|\[[^\]]+\]\([^)]+\))/g

export const EMBED_URL_REGEXP = /!\[\[(.*?)\]\]/g;

const META_KEY_IGNORE_LIST = ['copy']

export function collectAndReplaceHeaderAttachments(
	plugin: BulkExporterPlugin,
	settings: BulkExportSettings,
	exportProperties: ExportProperties,
	attachments: AttachmentLink[]
) {
	// "text" is the YAML key here.
	attachments.forEach((attachment) => {
		// Is coming from the meta, and is it an ignore key like copy?
		if (attachment.source === 'frontMatter' && META_KEY_IGNORE_LIST.indexOf(attachment.text) > -1) { return; }

		saveAttachmentToLocation(plugin, settings, attachment, exportProperties)

		attachment.token.content = `${attachment.text}: ${attachment.newPath}`
	})
}

function saveAttachmentToLocation(
	plugin: BulkExporterPlugin,
	settings: BulkExportSettings,
	attachment: AttachmentLink,
	exportProperties: ExportProperties
) {
	const assetFolderName = settings.assetPath || 'assets'

	const imageLink = decodeURI(attachment.originalPath);
	const imageLinkMd5 = Md5.hashStr(imageLink);
	const imageName = basename(imageLink);
	const imageNameWithoutExtension = imageName.substring(0, imageName.lastIndexOf("."));
	const imageExtension = imageName.substring(imageName.lastIndexOf("."));

	// Find the file in the vault
	// QUESTION: Is this the best way to do this? Is this the same endpoint that the link resolver uses?
	const asset = plugin.app.metadataCache.getFirstLinkpathDest(imageLink, exportProperties.from);

	if (!asset) {
		// For now, let's settle with "asset not found"
		attachment.error = "Asset not found!"
		attachment.status = "assetNotFound"
	}

	////// --------------------------------------------------------------------------------------------
	////// --------------------------------------------------------------------------------------------
	////// --------------------------------------------------------------------------------------------
	// I need to find a generic way to have separate roots for separate blogs.
	// I am starting to think that the best way is to just have a per/blog settings page.
	// Currently, I have a huge hustle with putting the attachments relative to their page's place, while
	// what I could be doing is just have a root /assets folder in which everything goes and everything references
	// that.

	const {
		targetAbsolute,
		targetRelative
	} = getAssetPaths(exportProperties, settings)

	const filePath = asset !== null
		? asset.path
		: join(dirname(exportProperties.from), imageLink);

	// Create asset dir if not exists
	const toDir = dirname(exportProperties.toAbsoluteFs);
	const imageTargetFileName =
		imageNameWithoutExtension + "-" + imageLinkMd5 + imageExtension;
	const documentLink = join(assetFolderName, imageTargetFileName);
	const assetAbsoluteTarget = join(
		toDir,
		assetFolderName,
		imageTargetFileName
	);
	const absoluteTargetDir = dirname(assetAbsoluteTarget);

	if (!existsSync(absoluteTargetDir)) {
		// Create new group-by asset folder
		mkdirSync(absoluteTargetDir, { recursive: true });
	}

	if (!asset) {
		return { str, count: 0, status: 'assetNotFound' };
	}

	// Update the content with the new asset URL.

	const count: number = matchAll(urlEncodedImageLink, str)?.length || 0

	str = replaceAll(
		urlEncodedImageLink,
		str,
		documentLink
	);

	// If we have a local system, use a simple copy, if we
	// have a cloud store, export the binary.
	if (existsSync(assetAbsoluteTarget)) {
		return { str, count, status: 'alreadyExists' };
	}

	// @ts-ignore : simple way to figure out if we are on the cloud I guess.
	const basePath = plugin.app.vault.adapter.basePath;

	if (basePath) {
		const fullAssetPath = join(
			basePath,
			filePath
		);
		copyFileSync(fullAssetPath, assetAbsoluteTarget);
	} else {
		const assetContent = await plugin.app.vault.readBinary(asset);
		writeFileSync(assetAbsoluteTarget, Buffer.from(assetContent));
	}
	return {
		str, count, status: 'success', imageAttachment: {
			originalPath: filePath,
			newPath: imageTargetFileName,
			count: 0
		}
	}
}


export async function replaceOneImageLink(
	str: string,
	urlEncodedImageLink: string,
	exportProperties: ExportProperties,
	// used for: plugin.settings, reading binary
	plugin: BulkExporterPlugin): Promise<ReplaceOneResult> {

	const assetFolderName = plugin.settings.assetPath || 'assets'

	const imageLink = decodeURI(urlEncodedImageLink);
	const imageLinkMd5 = Md5.hashStr(imageLink);
	const imageName = basename(imageLink);
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
			: join(dirname(exportProperties.from), imageLink);

	// filter markdown link eg: http://xxx.png
	// If this is an external url and we have the importFromWeb true, download the resource.
	if (urlEncodedImageLink.startsWith("http")) {
		return { str, count: 0, status: 'webLink' };
	}

	// Create asset dir if not exists
	const toDir = dirname(exportProperties.toAbsoluteFs);
	const imageTargetFileName =
		imageNameWithoutExtension + "-" + imageLinkMd5 + imageExtension;
	const documentLink = join(assetFolderName, imageTargetFileName);
	const assetAbsoluteTarget = join(
		toDir,
		assetFolderName,
		imageTargetFileName
	);
	const absoluteTargetDir = dirname(assetAbsoluteTarget);

	if (!existsSync(absoluteTargetDir)) {
		// Create new group-by asset folder
		mkdirSync(absoluteTargetDir, { recursive: true });
	}

	if (!asset) {
		return { str, count: 0, status: 'assetNotFound' };
	}

	// Update the content with the new asset URL.

	const count: number = matchAll(urlEncodedImageLink, str)?.length || 0

	str = replaceAll(
		urlEncodedImageLink,
		str,
		documentLink
	);

	// If we have a local system, use a simple copy, if we
	// have a cloud store, export the binary.
	if (existsSync(assetAbsoluteTarget)) {
		return { str, count, status: 'alreadyExists' };
	}

	// @ts-ignore : simple way to figure out if we are on the cloud I guess.
	const basePath = plugin.app.vault.adapter.basePath;

	if (basePath) {
		const fullAssetPath = join(
			basePath,
			filePath
		);
		copyFileSync(fullAssetPath, assetAbsoluteTarget);
	} else {
		const assetContent = await plugin.app.vault.readBinary(asset);
		writeFileSync(assetAbsoluteTarget, Buffer.from(assetContent));
	}
	return {
		str, count, status: 'success', imageAttachment: {
			originalPath: filePath,
			newPath: imageTargetFileName,
			count: 0
		}
	}
}




/**
 * Does not yet support pulling external images in, it just leaves them in place.
 */
export async function replaceImageLinks(
	exportProperties: ExportProperties,
	plugin: BulkExporterPlugin
) {

	let str = exportProperties.content;

	for (const index in imageLinks) {
		const urlEncodedImageLink =
			imageLinks[index][imageLinks[index].length - 3];
		const results = await replaceOneImageLink(str, urlEncodedImageLink, exportProperties, plugin);
		str = results.str

		list[urlEncodedImageLink] = list[urlEncodedImageLink] || {
			originalPath: urlEncodedImageLink,
			newPath: results.imageAttachment?.newPath || list[urlEncodedImageLink]?.newPath,
			type: 'body',
			status: results.status,
			count: 0
		}
		list[urlEncodedImageLink].count += results.count
	}
	exportProperties.content = str
	return list
}






// /**
//  * If a meta property is referencing an image, do copy that over too!
//  * Not having a better way to do this: just regex for a no-space value
//  * ending with .(png|jpe?g|gif|webp)
//  *
//  * @param exportProperties
//  * @param plugin
//  * @returns
//  */


// export async function replaceImageLinksInMetaData(
// 	exportProperties: ExportProperties,
// 	plugin: BulkExporterPlugin
// ) {
// 	const frontMatterData = exportProperties.frontMatter;
// 	const list :{ [originalUrl: string]: AttachmentLink} = {};
// 	let str = exportProperties.content;

// 	for (let key in frontMatterData) {
// 		if (META_KEY_IGNORE_LIST.indexOf(key) > -1){ continue }
// 		const value = frontMatterData[key]
// 		if (isArray(value)) {
// 			value.forEach(async (imageUrl: string) => {
// 				const isImage: boolean = isImageUrl(imageUrl)
// 				if (isImage) {
// 					const results = await replaceOneImageLink(str, imageUrl, exportProperties, plugin);
// 					str = results.str

// 					list[imageUrl] = list[imageUrl] || {
// 						originalPath: imageUrl,
// 						newPath: results.imageAttachment?.newPath || list[imageUrl]?.newPath,
// 						type: 'frontMatter',
// 						status: results.status,
// 						count: 0
// 					}
// 					list[imageUrl].count += results.count
// 				}
// 			})
// 		}
// 		else if (isString(value)) {
// 			const imageUrl = value
// 			const isImage: boolean = isImageUrl(imageUrl)
// 			if (isImage) {
// 				const results = await replaceOneImageLink(str, value, exportProperties, plugin);
// 				str = results.str
// 				list[imageUrl] = list[imageUrl] || {
// 					originalPath: imageUrl,
// 					newPath: results.imageAttachment?.newPath || list[imageUrl]?.newPath,
// 					type: 'frontMatter',
// 					status: results.status,
// 					count: 0
// 				}
// 				list[imageUrl].count += results.count
// 			}
// 		}
// 	}

// 	exportProperties.content = str
// 	return list
// }



export async function replaceOneImageLink(
	str: string,
	urlEncodedImageLink: string,
	exportProperties: ExportProperties,
	// used for: plugin.settings, reading binary
	plugin: BulkExporterPlugin): Promise<ReplaceOneResult> {

	const assetFolderName = plugin.settings.assetPath || 'assets'

	const imageLink = decodeURI(urlEncodedImageLink);
	const imageLinkMd5 = Md5.hashStr(imageLink);
	const imageName = basename(imageLink);
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
			: join(dirname(exportProperties.from), imageLink);

	// filter markdown link eg: http://xxx.png
	// If this is an external url and we have the importFromWeb true, download the resource.
	if (urlEncodedImageLink.startsWith("http")) {
		return { str, count: 0, status: 'webLink' };
	}

	// Create asset dir if not exists
	const toDir = dirname(exportProperties.toAbsoluteFs);
	const imageTargetFileName =
		imageNameWithoutExtension + "-" + imageLinkMd5 + imageExtension;
	const documentLink = join(assetFolderName, imageTargetFileName);
	const assetAbsoluteTarget = join(
		toDir,
		assetFolderName,
		imageTargetFileName
	);
	const absoluteTargetDir = dirname(assetAbsoluteTarget);

	if (!existsSync(absoluteTargetDir)) {
		// Create new group-by asset folder
		mkdirSync(absoluteTargetDir, { recursive: true });
	}

	if (!asset) {
		return { str, count: 0, status: 'assetNotFound' };
	}

	// Update the content with the new asset URL.

	const count: number = matchAll(urlEncodedImageLink, str)?.length || 0

	str = replaceAll(
		urlEncodedImageLink,
		str,
		documentLink
	);

	// If we have a local system, use a simple copy, if we
	// have a cloud store, export the binary.
	if (existsSync(assetAbsoluteTarget)) {
		return { str, count, status: 'alreadyExists' };
	}

	// @ts-ignore : simple way to figure out if we are on the cloud I guess.
	const basePath = plugin.app.vault.adapter.basePath;

	if (basePath) {
		const fullAssetPath = join(
			basePath,
			filePath
		);
		copyFileSync(fullAssetPath, assetAbsoluteTarget);
	} else {
		const assetContent = await plugin.app.vault.readBinary(asset);
		writeFileSync(assetAbsoluteTarget, Buffer.from(assetContent));
	}
	return {
		str, count, status: 'success', imageAttachment: {
			originalPath: filePath,
			newPath: imageTargetFileName,
			count: 0
		}
	}
}

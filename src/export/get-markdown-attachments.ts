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
 *  Images/attachments:
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
import { Md5 } from "ts-md5";
import { AttachmentLink } from "./get-links-and-attachments";
import { BulkExportSettings } from "src/models/bulk-export-settings";
import { getAssetPaths } from "src/utils/indexing/asset-and-link-paths";
import replaceAll from "src/utils/replace-all";

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
	attachments.forEach((attachment) => {
		// Is coming from the meta, and is it an ignore key like copy?
		if (attachment.source === 'frontMatter' && META_KEY_IGNORE_LIST.indexOf(attachment.text) > -1) { return; }

		saveAttachmentToLocation(plugin, settings, attachment, exportProperties)

		// Replace the links in the header.
		if (attachment.newPath) {
			// Poor man's yaml splitter.
			const contentSplitByHrDashes = exportProperties.content.split('\n---\n')

			// This is not pretty, but it works.
			let frontMatterPart = contentSplitByHrDashes.shift() || ''
			frontMatterPart = replaceAll(attachment.originalPath, frontMatterPart, attachment.newPath)
			contentSplitByHrDashes.unshift(frontMatterPart)
			exportProperties.content = contentSplitByHrDashes.join('\n---\n')
		}
	})
}

export function collectAndReplaceInlineAttachments(
	plugin: BulkExporterPlugin,
	settings: BulkExportSettings,
	exportProperties: ExportProperties,
	attachments: AttachmentLink[]
) {
	// "text" is the YAML key here.
	attachments.forEach((attachment) => {
		saveAttachmentToLocation(plugin, settings, attachment, exportProperties)
		// I have experimented with this a lot.
		// @see comments in getLinksAndAttachments.
		// I normalized before exportProperties.content to only have []() style links.
		exportProperties.content = replaceAll(`](${attachment.originalPath})`, exportProperties.content, `](${attachment.newPath})`)
	})
}

async function saveAttachmentToLocation(
	plugin: BulkExporterPlugin,
	settings: BulkExportSettings,
	attachment: AttachmentLink,
	exportProperties: ExportProperties
) {
	const imageLink = decodeURIComponent(attachment.originalPath);

	const imageName = basename(imageLink);

	const imageNameWithoutExtension = imageName.substring(0, imageName.lastIndexOf("."));
	const imageExtension = imageName.substring(imageName.lastIndexOf("."));

	// Find the file in the vault
	// QUESTION: Is this the best way to do this?
	// Is this the same endpoint that the link resolver uses?
	const asset = plugin.app.metadataCache.getFirstLinkpathDest(imageLink, exportProperties.from);

	if (!asset) {
		// For now, let's settle with "asset not found"
		attachment.error = "Asset not found!"
		attachment.status = "assetNotFound"
		return
	}

	const { toDir, toDirRelative } = getAssetPaths(exportProperties, settings)

	const imageLinkMd5 = Md5.hashStr(asset.path);
	const imageTargetFileName = imageNameWithoutExtension + "-" + imageLinkMd5 + imageExtension;

	// Calculate the link within the markdown file, using the target's relative path!
	const documentLink = join(toDirRelative, imageTargetFileName);
	attachment.newPath = documentLink;

	const assetAbsoluteTarget = join(toDir, imageTargetFileName);
	const absoluteTargetDir = dirname(assetAbsoluteTarget);

	if (!existsSync(absoluteTargetDir)) {
		// Create new group-by asset folder
		mkdirSync(absoluteTargetDir, { recursive: true });
	}

	// If we have a local system, use a simple copy, if we
	// have a cloud store, export the binary.
	if (existsSync(assetAbsoluteTarget)) {
		// Target file already exists, no need to copy.
		return
	}

	// @ts-ignore : simple way to figure out if we are on the cloud I guess.
	const basePath = plugin.app.vault.adapter.basePath;

	if (basePath) {
		const fullAssetPath = join(
			basePath,
			asset.path
		);
		copyFileSync(fullAssetPath, assetAbsoluteTarget);
	} else {
		const assetContent = await plugin.app.vault.readBinary(asset);
		writeFileSync(assetAbsoluteTarget, Buffer.from(assetContent));
	}
}

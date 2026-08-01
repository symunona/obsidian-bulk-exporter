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
import { AttachmentLink, normalizeUrl } from "./get-links-and-attachments";
import { BulkExportSettings } from "src/models/bulk-export-settings";
import { getAssetPaths } from "src/utils/indexing/asset-and-link-paths";
import normalizeFileName from "src/utils/normalize-file-name";
import { normalizeLinkToForwardSlash } from "src/utils/forward-slash";
import { replaceLinks } from "./replace-local-links";
import { replaceFrontMatterValue } from "./front-matter";

export const ATTACHMENT_URL_REGEXP = /!\[\[((.*?)\.(\w+))\]\]/g;
export const MARKDOWN_ATTACHMENT_URL_REGEXP = /!\[(.*?)\]\(((.*?)\.(\w+))\)/g;

// Finds all [title](url) formatted expressions, ignores the ones that are embedded with !
// export const LINK_URL_REGEXP = /[^!]\[(.*?)\]\(((.*?))\)/g;
export const LINK_URL_REGEXP = /(\[\[[^\]]+\]\]|\[[^\]]+\]\([^)]+\))/g

export const EMBED_URL_REGEXP = /!\[\[(.*?)\]\]/g;

const META_KEY_IGNORE_LIST = ['copy']

/**
 * Obsidian's real desktop `FileSystemAdapter` exposes `basePath` at runtime, but it isn't
 * part of the public `DataAdapter`/`FileSystemAdapter` type declarations (only the
 * `getBasePath()` method is). This captures just that undocumented-but-real property,
 * without weakening the check with `any`.
 */
interface AdapterWithBasePath {
	basePath?: string;
}

export function collectAndReplaceHeaderAttachments(
	plugin: BulkExporterPlugin,
	settings: BulkExportSettings,
	exportProperties: ExportProperties,
	attachments: AttachmentLink[]
) {
	attachments.forEach((attachment) => {
		// Is coming from the meta, and is it an ignore key like copy?
		if (attachment.source === 'frontMatter' && META_KEY_IGNORE_LIST.indexOf(attachment.text) > -1) { return; }

		// Not awaited: attachments across the file are saved concurrently, fire-and-forget,
		// same as before this rule was enforced. Errors are still not swallowed - a
		// rejection surfaces as an unhandled rejection, same as it always did.
		void saveAttachmentToLocation(plugin, settings, attachment, exportProperties)

		// Replace the links in the header. `attachment.text` is the YAML key the
		// path sits under, so only that one entry is rewritten - see front-matter.ts.
		if (attachment.newPath) {
			exportProperties.outputContent = replaceFrontMatterValue(
				exportProperties.outputContent,
				attachment.text,
				attachment.originalPath,
				// Replace with normalized '/' slashes, always. Windows uses (\) backslashes.
				// However the markdown standard is '/' - works on Mac and Linux.
				// The links should always be / in markdown documents.
				// For copying the assets, the plugin uses the system path's join, hence the replaced
				// urls. If I normalize it back here, the link will be fixed and the copy will still work.
				normalizeLinkToForwardSlash(attachment.newPath))
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
		// Not awaited: same fire-and-forget behavior as before this rule was enforced (see
		// the matching comment in collectAndReplaceHeaderAttachments above).
		void saveAttachmentToLocation(plugin, settings, attachment, exportProperties)
		// I have experimented with this a lot.
		// @see comments in getLinksAndAttachments.
		// I normalized before exportProperties.outputContent to only have []() style links.

		replaceLinks(normalizeLinkToForwardSlash(attachment.newPath || ''), attachment, settings, exportProperties)
	})
}

async function saveAttachmentToLocation(
	plugin: BulkExporterPlugin,
	settings: BulkExportSettings,
	attachment: AttachmentLink,
	exportProperties: ExportProperties
) {
	const imageLink = normalizeUrl(attachment.originalPath);

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

	// The name comes from the file that was actually resolved, not from the text of
	// the link. Obsidian resolves links case insensitively, so `photo.jpg` in the
	// front matter and `Photo.jpg` in the body are one and the same image - deriving
	// the name from the link would copy it out twice, under two names, and the
	// front matter one would 404 on a case sensitive host.
	const imageName = basename(asset.path);

	const imageNameWithoutExtension = imageName.substring(0, imageName.lastIndexOf("."));
	const imageExtension = imageName.substring(imageName.lastIndexOf("."));

	const { toDir, toDirRelative } = getAssetPaths(exportProperties, settings)

	const imageLinkMd5 = Md5.hashStr(asset.path);
	let imageTargetFileName = normalizeFileName(imageNameWithoutExtension) + "-" + imageLinkMd5 + imageExtension;

	// Can opt to keep original file names!
	if (settings.keepOriginalAttachmentFileNames) {
		imageTargetFileName = imageNameWithoutExtension + imageExtension;
	}

	// Calculate the link within the markdown file, using the target's relative path!
	const documentLink = join(toDirRelative, imageTargetFileName).replace(/\\/g, '/');
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

	// Simple way to figure out if we are on the cloud I guess.
	const basePath = (plugin.app.vault.adapter as AdapterWithBasePath).basePath;

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

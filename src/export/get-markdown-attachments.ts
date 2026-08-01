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
import replaceAll from "src/utils/replace-all";
import { warn } from "src/utils/log";

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

/**
 * Why `for ... of` + `await` and not `forEach` + fire-and-forget:
 *
 * The save is what assigns `attachment.newPath`, and the link rewrite right after it
 * reads that. Firing the save without awaiting only ever worked because the save
 * happened to reach the assignment before its first `await` - one `await` added above
 * that line and every rewrite below would silently stop happening. Awaiting makes the
 * dependency real instead of accidental.
 *
 * It also means the save can no longer reject into nowhere as an unhandled rejection
 * nobody ever sees - `saveAttachment` below turns it into a recorded, reported,
 * per-attachment failure instead.
 * @see https://github.com/symunona/obsidian-bulk-exporter/issues/17
 *
 * Sequential, not `Promise.all`: on desktop - the only platform this plugin supports -
 * `saveAttachmentToLocation` copies with `copyFileSync` and never awaits anything, so
 * there is no concurrency to win back, only ordering to lose.
 */
export async function collectAndReplaceHeaderAttachments(
	plugin: BulkExporterPlugin,
	settings: BulkExportSettings,
	exportProperties: ExportProperties,
	attachments: AttachmentLink[]
) {
	for (const attachment of attachments) {
		// Is coming from the meta, and is it an ignore key like copy?
		if (attachment.source === 'frontMatter' && META_KEY_IGNORE_LIST.indexOf(attachment.text) > -1) { continue; }

		await saveAttachment(plugin, settings, attachment, exportProperties)

		// Replace the links in the header. `attachment.text` is the YAML key the
		// path sits under, so only that one entry is rewritten - see front-matter.ts.
		//
		// No newPath - not found, or found and not copyable - leaves the YAML value
		// exactly as the author wrote it. A YAML scalar has no link to strip, the
		// value IS the text, so that is the only answer available here; it is what
		// this path has always done for a missing asset.
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
	}
}

/** @see the note on `collectAndReplaceHeaderAttachments` for why this awaits. */
export async function collectAndReplaceInlineAttachments(
	plugin: BulkExporterPlugin,
	settings: BulkExportSettings,
	exportProperties: ExportProperties,
	attachments: AttachmentLink[]
) {
	for (const attachment of attachments) {
		await saveAttachment(plugin, settings, attachment, exportProperties)

		// I have experimented with this a lot.
		// @see comments in getLinksAndAttachments.
		// I normalized before exportProperties.outputContent to only have []() style links.
		if (attachment.newPath) {
			replaceLinks(
				normalizeLinkToForwardSlash(attachment.newPath),
				attachment, settings, exportProperties)
			continue
		}

		// No newPath means the asset is NOT in the output: `saveAttachmentToLocation`
		// either never resolved it, or resolved it and then failed to copy it out.
		// Those are two different causes with one consequence, and it is the
		// consequence the link has to be written for - so both get the same answer
		// here, and `error` (set by whichever branch produced it) says which it was.
		//
		// This used to fall through to the same `replaceLinks` call with '' for the
		// new path - guarded on the header side (see above), not here - so a broken
		// embed was rewritten into a differently broken one: `![missing.png]()`, or
		// `![[|missing.png]]` with preserveWikiLinks on. An empty link target is not a
		// decision, it is state read out of the branch that was supposed to set it.
		//
		// An attachment that is not in the output is the same situation as a note link
		// that resolves to nothing, so it gets the same answer, from the same setting -
		// see `replaceLocalLink` in replace-local-links.ts:
		//   keepLinksNotFound false -> drop the link, keep its text
		//   keepLinksNotFound true  -> leave it pointing at the name as written
		// Either way `status` stays "assetNotFound" (the export log paints that red).
		if (settings.keepLinksNotFound) {
			replaceLinks(
				attachment.normalizedOriginalPath, attachment, settings, exportProperties)
			attachment.error = `${attachment.error || ''} Kept pointing at the ` +
				"original name, due to the Keep Links Not Found setting."
		} else {
			removeAttachmentLink(attachment, exportProperties)
			attachment.error = `${attachment.error || ''} Removed the link, kept its text.`
		}
		attachment.error = attachment.error.trim()
		console.warn(
			'[Bulk Exporter] Attachment not found!',
			attachment.text, attachment.originalPath, attachment.error)
	}
}

/**
 * Copies one attachment out, and never throws.
 *
 * An attachment that cannot be copied - an unreadable image, a permission error on
 * the asset folder - must not cost the whole note. For a static site export that is
 * plainly the wrong trade: one dead image is a hole in a page, a skipped `.md` is a
 * missing page. So the failure is recorded on the attachment and the note goes out
 * without it, exactly as a missing asset already did.
 *
 * `newPath` is cleared because `saveAttachmentToLocation` assigns it BEFORE the copy
 * it then fails at. Left set, the collectors would happily rewrite the link to point
 * at a file that was never written - the one outcome worse than a broken link, since
 * it looks fine right up until the page is loaded.
 *
 * `status` is "assetNotFound" and not "error" on purpose. From the exported site's
 * side there is no difference - the asset is not there - and `error` already means
 * something else in this codebase: `replaceLocalLinks` sets it on the link it is
 * about to fail the whole file over, and `collectExportFailure` reads it back as
 * exactly that. A degraded attachment did not fail the file, so it must not wear the
 * marker for links that did.
 *
 * NOTE this deliberately catches ONLY the copy. Everything else in the export path -
 * the link rewrite, the `.md` write itself - still throws through to the per-file
 * guard in `exportSelection`, where a genuine bug belongs.
 */
async function saveAttachment(
	plugin: BulkExporterPlugin,
	settings: BulkExportSettings,
	attachment: AttachmentLink,
	exportProperties: ExportProperties
) {
	try {
		await saveAttachmentToLocation(plugin, settings, attachment, exportProperties)
	} catch (e) {
		const message = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
		attachment.newPath = undefined
		attachment.status = "assetNotFound"
		attachment.error = `Could not copy asset: ${message}`
		console.error(
			'[Bulk Exporter] Could not copy attachment',
			attachment.originalPath, 'of', exportProperties.from, e)
		warn(
			`Could not copy attachment "${attachment.originalPath}" of ` +
			`${exportProperties.from}: ${message}`)
	}
}

/**
 * Drops a link that points at nothing and leaves its text behind - what
 * `removeLinks` does to an unresolvable note link.
 *
 * The one difference is the '!': an embed is `![alt](src)`, and removing only the
 * `[alt](src)` part of it would leave a stray bang in front of the text. The token
 * says which one this is - `image` for an embed, `link_open` for a plain link to
 * an attachment such as `[the plan](files/plan.docx)`.
 */
function removeAttachmentLink(
	attachment: AttachmentLink,
	exportProperties: ExportProperties
) {
	const isEmbed = attachment.token?.type === 'image'
	exportProperties.outputContent = replaceAll(
		`${isEmbed ? '!' : ''}[${attachment.text}](${attachment.originalPath})`,
		exportProperties.outputContent,
		attachment.text
	)
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

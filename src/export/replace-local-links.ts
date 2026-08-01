import { ExportMap, ExportProperties } from "../models/export-properties";
import replaceAll from "../utils/replace-all";
import { AttachmentLink, normalizeUrl } from "./get-links-and-attachments";
import BulkExporterPlugin from "src/main";
import { BulkExportSettings } from "src/models/bulk-export-settings";

// `console.warn.bind(console)` types as `any` (a known TS quirk for `.bind()` on
// rest-arg functions like `console.warn`); wrap it instead so the call stays typed.
function warn(...args: unknown[]): void {
	console.warn(...args);
}

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
	for (const link of links) {
		try {
			replaceLocalLink(link, exportProperties, allFileListMap, settings, plugin)
		} catch (e) {
			// Pin the failure on the link that actually caused it, so the export
			// log can name it, then let it bubble: `exportSelection` records it
			// against this one file and carries on with the rest of the batch.
			// @see https://github.com/symunona/obsidian-bulk-exporter/issues/17
			link.status = "error"
			link.error = `Could not process link: ${e instanceof Error ? e.message : String(e)}`
			throw e
		}
	}
}

function replaceLocalLink(
	link: AttachmentLink,
	exportProperties: ExportProperties,
	allFileListMap: ExportMap,
	settings: BulkExportSettings,
	plugin: BulkExporterPlugin
) {
	// `[[note#header]]` names a file AND a place inside it. Only the part in
	// front of the '#' is a file name, so the anchor comes off before the lookup
	// and goes back on afterwards.
	const { path: linkPath, anchor } = splitAnchor(link.normalizedOriginalPath)

	// `[[#Some heading]]` points inside THIS note: there is no file to resolve,
	// and asking the vault for one called "#Some heading" only ever answered
	// "not found" - which stripped the link.
	// @see https://github.com/symunona/obsidian-bulk-exporter/issues/14
	if (!linkPath) {
		replaceLinks(link.normalizedOriginalPath, link, settings, exportProperties)
		return
	}

	// See if this link exists in the vault!
	// `normalizedOriginalPath` has ALREADY been decoded by `normalizeUrl`, so
	// decoding it a second time here was wrong twice over: it threw
	// `URIError: URI malformed` on any title holding a literal '%'
	// (`[[100% sure]]`), taking the whole export down with it, and it silently
	// mangled titles that happened to look encoded (`[[a %20 b]]` -> `a   b`).
	// @see https://github.com/symunona/obsidian-bulk-exporter/issues/17
	const linkedDocument = plugin.app.metadataCache.getFirstLinkpathDest(
		linkPath,
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
		return

	}
	const path = linkedDocument.path

	// Replace all links that point to other markdown files.
	// If not found, send a warning.
	if (allFileListMap[path]) {
		const newFilePath = allFileListMap[path].toRelative;

		// Remove the extension from actual links. The anchor the lookup was not
		// allowed to see goes back on: the heading it names lives in the
		// exported file just as it did in the vault one.
		const newLink = newFilePath.substring(
			0,
			newFilePath.lastIndexOf(".")
		);
		replaceLinks(newLink + anchor, link, settings, exportProperties)

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
 * Splits a link target into the file it names and the place inside that file.
 *
 * Obsidian does not allow '#' in a file name, so the first one always starts an
 * anchor: a heading (`note#Intro`, `note#Intro#Detail`) or a block reference
 * (`note#^abc123`). Handing the whole string to `getFirstLinkpathDest` looked
 * for a file literally called "note#Intro", never found one, and removed the
 * link with a warning.
 *
 * A target that STARTS with '#' has an empty path: it is a heading in the note
 * being exported and names no file at all.
 *
 * @see https://github.com/symunona/obsidian-bulk-exporter/issues/14
 */
export function splitAnchor(target: string): { path: string, anchor: string } {
	const hash = target.indexOf('#')
	if (hash === -1) { return { path: target, anchor: '' } }
	return { path: target.substring(0, hash), anchor: target.substring(hash) }
}

/**
 * Percent-encodes a link so a non-Obsidian markdown parser can read a path with
 * a space in it. Per path segment, and never over the anchor - encoding the '#'
 * would fold a heading reference back into the file name.
 */
function encodeSpaces(newLink: string, settings: BulkExportSettings): string {
	if (newLink.indexOf(' ') === -1 || !settings.normalizeSpacesInLinks) { return newLink }
	const { path, anchor } = splitAnchor(newLink)
	return path.split('/').map((urlPart) => encodeURIComponent(urlPart)).join('/') + anchor
}

/**
 * It handles wiki links, and spaces depending on settings
 *
 * The output syntax is chosen FIRST, and only the `[](...)` form is encoded.
 * Encoding up front - before the branch - meant `normalizeSpacesInLinks` also
 * reached the two places it has no business in: the `title === newLink` test
 * below, which then compared a title against an encoded copy of itself, and the
 * inside of `[[...]]`, where percent escapes are not resolved by anyone.
 * `[[My Note]]` came out as `[[out/My%20Note|My Note]]`, which neither Obsidian
 * nor Quartz can resolve. Percent-encoding is a property of a url, and only the
 * `[](...)` form holds one.
 *
 * @param newLink
 * @param link
 * @param settings
 * @param exportProperties
 */
export function replaceLinks(newLink: string, link: AttachmentLink, settings:BulkExportSettings, exportProperties: ExportProperties){
	const title = link.text
	const original = link.originalPath

	let newLinkWithTitle: string

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
		} else if (settings.keepWikiLinksAsIs) {
			// An edge case: if:
			// - this is a WIKI link
			// - preserve wiki links
			// - keepWikiLinksAsIs
			// we can just leave the original, as e.g. quartz can link it up.
			const url = normalizeUrl(link.originalPath)
			newLinkWithTitle = url === title ? `[[${url}]]` : `[[${url}|${title}]]`
		} else {
			// Do update to the new relative path.
			newLinkWithTitle = `[[${newLink}|${title}]]`
		}
	} else {
		newLinkWithTitle = `[${title}](${encodeSpaces(newLink, settings)})`
	}

	exportProperties.outputContent = replaceAll(
		`[${title}](${original})`,
		exportProperties.outputContent,
		newLinkWithTitle);
}
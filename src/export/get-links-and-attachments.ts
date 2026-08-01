import MarkdownIt, { Token } from "markdown-it";
import replaceAll from "../utils/replace-all";
import { findFrontMatterBlock, getFrontMatterKeyBlocks } from "./front-matter";

// This also replaces the ![[]] attachments!
const DOUBLE_BRACKET_LINK_MATCHER = /\[\[([^\]]+)\]\]/g;

const ATTACHMENT_EXTENSIONS = 'png|jpe?g|gif|webp|svg|pdf|doc|docx|xls|xlsx|txt'

/**
 * Tells an attachment link from an ordinary one, anywhere in the body.
 *
 * The dot is escaped: unescaped it matched ANY character, so `[[Some Document]]`
 * ("... Document" - space, then "doc") counted as an attachment and never got
 * link-resolved. Case insensitive, so `A.JPG` is an image too.
 */
export const IMAGE_MATCHER = new RegExp(`(([^\\s]*)\\.(${ATTACHMENT_EXTENSIONS}))`, 'i')

/**
 * Tells whether a front matter value IS an attachment path. Anchored, unlike
 * IMAGE_MATCHER: a front matter value is the whole path, not a sentence to go
 * fishing in, so `thumb: notanimagexxxjpg` is not an image.
 */
const FRONT_MATTER_ATTACHMENT_MATCHER = new RegExp(`\\.(${ATTACHMENT_EXTENSIONS})$`, 'i')

const WIKI_LINK_PREFIX = 'wikilink://'

const md = new MarkdownIt();

export enum LinkType {
    internal,
    external
}

export type Sources = 'body' | 'frontMatter' | 'globCopy' | 'folder'
export type AttachmentLinkStatus = 'success' | 'webLink' | 'assetNotFound' | 'alreadyExists' | 'error'


export interface AttachmentLink {
    text: string,
    originalPath: string
    normalizedOriginalPath: string
    newPath?: string
    source: Sources
    status?: AttachmentLinkStatus
    error?: string,
    count?: number,
    linkType: LinkType,
    token?: Token,
    isWikiLink?: boolean
}


export type LinkParseResults = {
    markdownReplacedWikiStyleLinks: string,
    parsedMarkdown: Array<Token>,
    links: Array<AttachmentLink>,
    attachments: Array<AttachmentLink>,
    externalLinks: Array<AttachmentLink>,
    internalLinks: Array<AttachmentLink>,
    externalAttachments: Array<AttachmentLink>,
    internalAttachments: Array<AttachmentLink>,
    internalHeaderAttachments: Array<AttachmentLink>
    externalHeaderAttachments: Array<AttachmentLink>
}

/**
 * Using a markdown-it parser to find links and attachments, as it's much more reliable
 * than anything I could achieve with regex.
 *
 * First, it normalizes all the links from [[]] to [](), then runs the parser, and finally
 * extracts all the links and attachments.
 * @param markdown
 * @returns
 */
export function getLinksAndAttachments(markdown: string): LinkParseResults {
    markdown = replaceDoubleBracketLinks(markdown)
    const parsedMarkdown = md.parse(markdown, {})
    const links = extractLinks(parsedMarkdown)
    const attachments = extractAttachments(parsedMarkdown)
    const headerAttachments = extractHeaderAttachments(markdown)
    return {
        markdownReplacedWikiStyleLinks: markdown,
        parsedMarkdown,
        links,
        attachments,
        externalLinks: links.filter((l) => l.linkType === LinkType.external),
        internalLinks: links.filter((l) => l.linkType === LinkType.internal),
        externalAttachments: attachments.filter((l) => l.linkType === LinkType.external),
        internalAttachments: attachments.filter((l) => l.linkType === LinkType.internal),
        internalHeaderAttachments: headerAttachments.filter((l) => l.linkType === LinkType.internal),
        externalHeaderAttachments: headerAttachments.filter((l) => l.linkType === LinkType.external),
    }
}

/**
 * Instead of trying to hack double bracket into markdown.it parser library, I juost pre-process
 * all the links to standard []() notation.
 * @param markdown
 * @returns
 */
export function replaceDoubleBracketLinks(markdown: string): string {
    const results = markdown.match(DOUBLE_BRACKET_LINK_MATCHER)
    if (results) {
        results.forEach((link) => {
            let linkTarget = link.substring(2, link.length - 2)
            let text = linkTarget
            // Support for [[link|text]] styled wiki links.
            const linkParts = linkTarget.split('|')
            if (linkParts.length > 1 && linkParts[0].trim()){
                linkTarget = linkParts.shift() || ''
                text = linkParts.join('|')
            }
            const standardLinkStyle = `[${text}](${WIKI_LINK_PREFIX}${encodeURIComponent(linkTarget)})`
            markdown = replaceAll(link, markdown, standardLinkStyle)
        })
    }
    return markdown
}

/**
 * Digs out the front matter, then reports every value that is an attachment path.
 *
 * The path is taken from the document EXACTLY as written - the previous version
 * matched a `toLocaleLowerCase()` copy of the value and then kept a slice of that
 * copy as the "original path". Nothing in the real document ever matched that
 * lowercased text again, so an image whose name had a capital letter in it was
 * copied but never re-linked. `js-yaml` also hands over the value without its
 * quotes, whole across spaces, and can see list values.
 *
 * @see https://github.com/symunona/obsidian-bulk-exporter/issues/19
 * @param content
 * @returns
 */
function extractHeaderAttachments(content: string): Array<AttachmentLink> {
    const frontMatter = findFrontMatterBlock(content)
    if (!frontMatter) { return [] }

    const ret: Array<AttachmentLink> = []
    getFrontMatterKeyBlocks(frontMatter.yaml).forEach((block) => {
        block.values.forEach((value) => {
            if (!FRONT_MATTER_ATTACHMENT_MATCHER.test(value)) { return }
            ret.push({
                originalPath: value,
                normalizedOriginalPath: normalizeUrl(value),
                linkType: getTypeofUrl(normalizeUrl(value)),
                source: "frontMatter",
                // The exporter identifies a header attachment by the key it sits
                // under: that is what the write-back targets.
                text: block.key
            })
        })
    })
    return ret;
}


export function extractAttachments(tokens: Token[], attachments: AttachmentLink[] = []) {
    for (const token of tokens) {
        if (token.children && token.children.length > 0) {
            // If the token has children, recursively extract links from children.
            extractAttachments(token.children, attachments);
        }

        // PDFs are also images if they are embedded here...
        if (token.type === 'image') {
            const url = token.attrGet('src') || ''
            attachments.push({
                text: token.attrGet('alt') || token.content,
                originalPath: url,
                normalizedOriginalPath: normalizeUrl(url),
                linkType: getTypeofUrl(normalizeUrl(url)),
                source: "body",
                token: token,
                isWikiLink: isWikiLink(url)
            });
        }
        // This is like "[url](title)" or [[url|title]] - where title ends with
        // an attachment extension e.g. (pdf, jpg, etc.) (see IMAGE_MATCHER)
        if (token.type === 'link_open') {
            // When a link_open token is found, extract link text and URL.
            const linkTextToken = tokens[tokens.indexOf(token) + 1];
            if (linkTextToken?.type === 'text' && linkTextToken?.content) {
                const url = token.attrGet('href') || ''
                const isAttachment = url.toLocaleLowerCase().match(IMAGE_MATCHER)
                if (isAttachment) {
                    attachments.push({
                        text: linkTextToken.content,
                        originalPath: url,
                        normalizedOriginalPath: normalizeUrl(url),
                        linkType: getTypeofUrl(normalizeUrl(url)),
                        source: 'body',
                        token: token,
                        isWikiLink: isWikiLink(url)
                    });
                }
            }
        }
    }

    return attachments
}


export function extractLinks(tokens: Token[], links: AttachmentLink[] = []) {
    for (const token of tokens) {
        if (token.children && token.children.length > 0) {
            // If the token has children, recursively extract links from children.
            extractLinks(token.children, links);
        }

        if (token.type === 'link_open') {
            // When a link_open token is found, extract link text and URL.
            const linkTextToken = tokens[tokens.indexOf(token) + 1];
            if (linkTextToken?.type === 'text' && linkTextToken?.content) {
                const url = token.attrGet('href') || ''
                const isAttachment = url.toLocaleLowerCase().match(IMAGE_MATCHER)
                if (!isAttachment) {
                    links.push({
                        text: linkTextToken.content,
                        originalPath: url,
                        normalizedOriginalPath: normalizeUrl(url),
                        linkType: getTypeofUrl(normalizeUrl(url)),
                        source: 'body',
                        token: token,
                        isWikiLink: isWikiLink(url)
                    });
                }
            }
        }
    }

    return links
}

function isWikiLink(url: string){
    return url.startsWith(WIKI_LINK_PREFIX)
}

const OBSIDIAN_LINK_PREFIX = 'obsidian://'
const OBSIDIAN_FILE_PARAM = 'file='

/**
 * `decodeURIComponent` throws `URIError: URI malformed` on any `%` that does not
 * start a valid escape sequence. A literal `%` in a note title (`[[100% sure]]`)
 * is far more likely than a genuinely mis-encoded escape, so treat the value as
 * already-plain text and hand it back untouched instead of throwing.
 *
 * Before this existed, that one `URIError` aborted the whole export.
 * @see https://github.com/symunona/obsidian-bulk-exporter/issues/17
 */
export function safeDecodeURIComponent(value: string): string {
    try {
        return decodeURIComponent(value)
    } catch (e) {
        if (e instanceof URIError) {
            console.warn(
                `[Bulk Exporter] "${value}" is not a valid URI encoded string, ` +
                `using it as-is. (A literal '%' in a file name does this.)`
            )
            return value
        }
        throw e
    }
}

export function normalizeUrl(url: string) {
    if (url.startsWith(OBSIDIAN_LINK_PREFIX)) {
        // Just grab the file value from the link - if there is one at all.
        // Without this guard `indexOf` returns -1 and the substring silently
        // chops the first four characters off the url instead.
        const fileParamIndex = url.indexOf(OBSIDIAN_FILE_PARAM)
        if (fileParamIndex > -1) {
            url = safeDecodeURIComponent(
                url.substring(fileParamIndex + OBSIDIAN_FILE_PARAM.length))
        }
    }
    if (isWikiLink(url)) {
        url = safeDecodeURIComponent(url.substring(WIKI_LINK_PREFIX.length))
    }
    return url
}

function getTypeofUrl(url: string) {
    if (url.startsWith('http')) {
        return LinkType.external
    } else {
        return LinkType.internal
    }
}

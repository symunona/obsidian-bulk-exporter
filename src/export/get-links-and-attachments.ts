import MarkdownIt, { Token } from "markdown-it";
import replaceAll from "../utils/replace-all";

// This also replaces the ![[]] attachments!
const DOUBLE_BRACKET_LINK_MATCHER = /\[\[([^\]]+)\]\]/g;

export const IMAGE_MATCHER = /(([^\s]*).(png|jpe?g|gif|webp|svg|pdf|doc|docx|xls|xlsx|txt))/

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
 * Given the parsed markdown files, it digs out FrontMatter, then looks
 * for links ending with asset extensions.
 * @param markdown
 * @returns
 */
function extractHeaderAttachments(content: string): Array<AttachmentLink> {
    const contentSplitByHrDashes = content.split('\n---\n')
    // This is not pretty, but it works.
    const frontMatterPart = contentSplitByHrDashes.shift() || ''

    const keyValuePairs: { [key: string]: { value: string, key: string } } = {}

    frontMatterPart.split('\n').forEach((line)=>{
        if (line.indexOf(':') > 0){
            if (!line) { throw new Error('Empty line?') }
            const keyValueSplitArray = line.split(':')
            const key = keyValueSplitArray.shift()
            if (!key) { throw new Error('Invalid YAML: no key value in line') }
            const value = keyValueSplitArray.join(':')
            keyValuePairs[key] = {
                key, value
            }
        }
    })

    const ret: Array<AttachmentLink> = []
    Object.keys(keyValuePairs).forEach((key) => {
        const valueAndToken = keyValuePairs[key]

        const imageValue = valueAndToken.value.trim()
            .toLocaleLowerCase().match(IMAGE_MATCHER)

        if (imageValue) {
            ret.push({
                originalPath: imageValue[0],
                normalizedOriginalPath: normalizeUrl(imageValue[0]),
                linkType: getTypeofUrl(normalizeUrl(imageValue[0])),
                source: "frontMatter",
                text: key
            })
        }
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

    return links
}

function isWikiLink(url: string){
    return url.startsWith(WIKI_LINK_PREFIX)
}

export function normalizeUrl(url: string) {
    if (url.startsWith("obsidian://")) {
        // Just grab the file value from the link.
        const fileLink = decodeURIComponent(
            url.substring(url.indexOf("&file=") + 6)
        );
        url = fileLink;
    }
    if (isWikiLink(url)) {
        url = decodeURIComponent(url.substring(WIKI_LINK_PREFIX.length))
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

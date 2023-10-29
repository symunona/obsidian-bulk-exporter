import MarkdownIt, { Token } from "markdown-it";
import replaceAll from "../utils/replace-all";

// This also replaces the ![[]] attachments!
const DOUBLE_BRACKET_LINK_MATCHER = /\[\[([^\]]+)\]\]/g;

export const IMAGE_MATCHER = /(([^\s]*).(png|jpe?g|gif|webp|svg|pdf|doc|docx|xls|xlsx|txt))/

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
    newPath?: string
    source: Sources
    status?: AttachmentLinkStatus
    error?: string,
    count?: number,
    linkType: LinkType,
    token: Token
}


export type LinkParseResults = {
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

export function getLinksAndAttachments(markdown: string): LinkParseResults {
    markdown = replaceDoubleBracketLinks(markdown)
    const parsedMarkdown = md.parse(markdown, {})
    // const flat = flattenTokenReferences(parsedMarkdown);

    const links = extractLinks(parsedMarkdown)
    const attachments = extractAttachments(parsedMarkdown)
    const headerAttachments = extractHeaderAttachments(parsedMarkdown)
    return {
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
 * Instead of trying to hack double bracket into markdown.it parser library, I just pre-process
 * all the links to standard []() notation.
 * @param markdown
 * @returns
 */
export function replaceDoubleBracketLinks(markdown: string): string {
    const results = markdown.match(DOUBLE_BRACKET_LINK_MATCHER)
    if (results) {
        results.forEach((link) => {
            const linkTarget = link.substring(2, link.length - 2)
            const standardLinkStyle = `[${linkTarget}](${encodeURIComponent(linkTarget)})`
            // console.warn(link, '->', standardLinkStyle)
            markdown = replaceAll(link, markdown, standardLinkStyle)
        })
    }
    return markdown
}


function extractHeaderAttachments(flatMarkdown: Token[]): Array<AttachmentLink> {
    const headerOpen = flatMarkdown.find((t)=>t.type === 'heading_open');
    if (!headerOpen) {throw new Error('Invalid YAML: No header content? This should never happen...')}
    const headerContentToken = flatMarkdown[flatMarkdown.indexOf(headerOpen) + 1]
    if (!headerContentToken.children) {throw new Error('Invalid YAML: YAML header should have lines...')}
    const lineTokens = headerContentToken.children.filter((l) => l.type === 'text')

    const keyValuePairs : {[key: string]: {value: string, token: Token}} = {}
    lineTokens.forEach((lineToken) => {
        if (!lineToken.content) { throw new Error('Empty line?') }
        const keyValueSplitArray = lineToken.content.split(':')
        const key = keyValueSplitArray.shift()
        if (!key) {throw new Error('Invalid YAML: no key value in line')}
        const value = keyValueSplitArray.join(':')
        keyValuePairs[key] = {
            value,
            token: lineToken
        }
    })

    const ret: Array<AttachmentLink> = []
    Object.keys(keyValuePairs).forEach((key)=> {
        const valueAndToken = keyValuePairs[key]

        const imageValue = valueAndToken.value.trim()
            .toLocaleLowerCase().match(IMAGE_MATCHER)

        if (imageValue){
            ret.push({
                originalPath: imageValue[0],
                linkType: getTypeofUrl(imageValue[0]),
                source: "frontMatter",
                text: key,
                token: valueAndToken.token
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

        if (token.type === 'image') {
            const url = token.attrGet('src') || ''
            attachments.push({
                text: token.attrGet('alt') || '',
                originalPath: url,
                linkType: getTypeofUrl(url),
                source: "body",
                token: token
            });
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
                    linkType: getTypeofUrl(url),
                    source: 'body',
                    token: token
                });
            }
        }
    }

    return links
}

function getTypeofUrl(url: string) {
    if (url.startsWith('http')) {
        return LinkType.external
    } else {
        return LinkType.internal
    }
}
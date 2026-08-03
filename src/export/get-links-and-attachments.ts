import MarkdownIt, { Token } from "markdown-it";
import { findFrontMatterBlock, getFrontMatterKeyBlocks } from "./front-matter";

// This also replaces the ![[]] attachments!
const DOUBLE_BRACKET_LINK_MATCHER = /\[\[([^\]]+)\]\]/g

/**
 * A whole value that is nothing but one wiki link: `[[x.png]]`, `![[x.png]]`,
 * `[[x.png|alias]]`. Anchored, because this is used on front matter values,
 * which are a whole path and not a sentence to go fishing in.
 */
const WHOLE_WIKI_LINK_MATCHER = /^!?\[\[([^\]|]+)(?:\|[^\]]*)?\]\]$/

/** A run of backticks and everything up to the next run of the same length. */
const INLINE_CODE_MATCHER = /(`+)[\s\S]*?\1/g

/**
 * An external link is one with an http(s) SCHEME. `startsWith('http')` matched a
 * prefix instead, so a note actually called `http-server-setup` (or `httpd
 * config`) was classed external, dropped from `internalLinks`, never resolved,
 * and left in the output as a raw `wikilink://` url.
 */
const EXTERNAL_URL_MATCHER = /^https?:\/\//i

/**
 * The inline tokens a link label can be rebuilt from, byte for byte. Everything
 * else - a nested image, raw html - is left to the old behaviour of skipping the
 * link, because a label we cannot reproduce is a write-back needle that will not
 * match. @see getLinkLabel
 */
const LABEL_TOKEN_TYPES = [
    'text', 'code_inline', 'softbreak',
    'em_open', 'em_close', 'strong_open', 'strong_close', 's_open', 's_close',
];

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
 *
 * Only the PROSE is rewritten. Two regions are left exactly as the author wrote
 * them:
 *
 * - **code.** A note that documents `[[...]]` syntax shows it inside a fence or
 *   inline backticks. Rewriting that produced `[Some Note](wikilink://Some%20Note)`
 *   in the middle of a code sample - and markdown-it then correctly refused to
 *   linkify code, so no later pass ever visited it and the raw `wikilink://`
 *   reached the exported file.
 * - **front matter.** It is YAML, not markdown. `banner: "[[my-banner.png]]"`
 *   (the Banners plugin convention) became `banner: "[my-banner.png](wikilink://...)"`
 *   before `extractHeaderAttachments` ever saw it, so the anchored front matter
 *   matcher missed it and it fell through to the *inline* attachment path
 *   instead - markdown-it reads front matter as an ordinary paragraph. The asset
 *   was copied, and the YAML value was turned into a markdown link.
 *
 * @param markdown
 * @returns
 */
export function replaceDoubleBracketLinks(markdown: string): string {
    const frontMatter = findFrontMatterBlock(markdown)
    const bodyStart = frontMatter ? frontMatter.end : 0
    const head = markdown.substring(0, bodyStart)
    const body = markdown.substring(bodyStart)

    let converted = ''
    let cursor = 0
    findCodeRanges(body).forEach((range) => {
        converted += replaceWikiLinksInProse(body.substring(cursor, range.start))
        converted += body.substring(range.start, range.end)
        cursor = range.end
    })
    return head + converted + replaceWikiLinksInProse(body.substring(cursor))
}

interface Range { start: number, end: number }

/**
 * Where the code blocks of a document are, as offsets.
 *
 * markdown-it is asked rather than pattern matched, because "is this line inside
 * a code block" is a block level question - a fence, a four space indent, a lazy
 * continuation line that only LOOKS indented - and the parser already answers it
 * correctly. Inline code spans carry no source position in the token stream, so
 * those are found separately, by `replaceWikiLinksInProse`.
 */
function findCodeRanges(markdown: string): Array<Range> {
    // Offset of the start of every line, so a token's line map becomes a slice.
    const lineStarts = [0]
    for (let i = 0; i < markdown.length; i++) {
        if (markdown[i] === '\n') { lineStarts.push(i + 1) }
    }

    const ranges: Array<Range> = []
    md.parse(markdown, {}).forEach((token) => {
        if (token.type !== 'fence' && token.type !== 'code_block') { return }
        if (!token.map) { return }
        const [firstLine, lastLine] = token.map
        ranges.push({
            start: lineStarts[firstLine],
            end: lastLine < lineStarts.length ? lineStarts[lastLine] : markdown.length
        })
    })

    // The parser walks the document in order, but a nested block could still
    // report a range inside one already collected; overlapping slices would
    // duplicate text.
    return ranges
        .sort((a, b) => a.start - b.start)
        .filter((range, i, all) => i === 0 || range.start >= all[i - 1].end)
}

/** Rewrites every wiki link of one run of prose, inline code spans excepted. */
function replaceWikiLinksInProse(prose: string): string {
    let out = ''
    let cursor = 0
    let codeSpan
    INLINE_CODE_MATCHER.lastIndex = 0
    while ((codeSpan = INLINE_CODE_MATCHER.exec(prose)) !== null) {
        out += toStandardLinks(prose.substring(cursor, codeSpan.index)) + codeSpan[0]
        cursor = codeSpan.index + codeSpan[0].length
    }
    return out + toStandardLinks(prose.substring(cursor))
}

function toStandardLinks(prose: string): string {
    return prose.replace(DOUBLE_BRACKET_LINK_MATCHER, (wikiLink) => {
        let linkTarget = wikiLink.substring(2, wikiLink.length - 2)
        let text = linkTarget
        // Support for [[link|text]] styled wiki links.
        const linkParts = linkTarget.split('|')
        if (linkParts.length > 1 && linkParts[0].trim()) {
            linkTarget = linkParts.shift() || ''
            text = linkParts.join('|')
        }
        return `[${text}](${WIKI_LINK_PREFIX}${encodeLinkTarget(linkTarget)})`
    })
}

/**
 * `encodeURIComponent` leaves '(' and ')' alone, but they are exactly what
 * delimits a markdown link destination, and markdown-it reads them
 * structurally. Unescaped, `[[foo (bar]]` produced no link token at all and the
 * raw `wikilink://foo%20(bar` reached the file, while `[[foo)bar]]` had its href
 * cut short at the ')' - and the write-back needle then matched a PREFIX of the
 * real text, corrupting the output into "see foo)barbar) here".
 *
 * `decodeURIComponent`, in `normalizeUrl`, turns both back. The one-decode
 * invariant is untouched: this is still the single encode.
 */
function encodeLinkTarget(target: string): string {
    return encodeURIComponent(target).replace(/\(/g, '%28').replace(/\)/g, '%29')
}

/**
 * Digs out the front matter, then reports every value that is an attachment path.
 *
 * The path is taken from the document EXACTLY as written - the previous version
 * matched a `toLocaleLowerCase()` copy of the value and then kept a slice of that
 * copy as the "original path". Nothing in the real document ever matched that
 * lowercased text again, so an image whose name had a capital letter in it was
 * copied but never re-linked. A real YAML parse also hands over the value without
 * its quotes, whole across spaces, and can see list values.
 *
 * The value is classified by what it POINTS AT (`normalizeUrl`), so a value
 * written as a wiki link - `banner: "[[my-banner.png]]"`, the Banners plugin
 * convention - is recognised too. `originalPath` still holds the value exactly
 * as the document spells it, brackets and all, because that is the needle the
 * front matter write-back searches for.
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
            const normalized = normalizeUrl(value)
            if (!FRONT_MATTER_ATTACHMENT_MATCHER.test(normalized)) { return }
            ret.push({
                originalPath: value,
                normalizedOriginalPath: normalized,
                linkType: getTypeofUrl(normalized),
                source: "frontMatter",
                // The exporter identifies a header attachment by the key it sits
                // under: that is what the write-back targets.
                text: block.key
            })
        })
    })
    return ret;
}


/**
 * The text of a link, exactly as it stands between its '[' and ']'.
 *
 * markdown-it hands a label back as a token stream, not as a string, and only a
 * label that is one unbroken run of plain text has a single `text` token right
 * after `link_open`. Reading `tokens[i + 1]` alone therefore lost every link
 * whose label carries formatting: `[[note|*fancy*]]` puts `em_open` there, so the
 * link landed in NO bucket and the raw `wikilink://note` was written to disk,
 * and `[my *cool* post](other.md)` kept only "my " - a needle that does not
 * occur in the document, so the write-back silently did nothing.
 *
 * So the label is put back together from every token up to the matching
 * `link_close`. A token type that cannot be written back out verbatim gives
 * `null`, and the caller skips the link exactly as it used to: a label we cannot
 * reproduce is a needle that cannot match, and a needle that cannot match must
 * not be guessed at.
 */
function getLinkLabel(tokens: Token[], linkOpenIndex: number): string | null {
    let label = ''
    for (let i = linkOpenIndex + 1; i < tokens.length; i++) {
        const token = tokens[i]
        if (token.type === 'link_close') { return label || null }
        if (LABEL_TOKEN_TYPES.indexOf(token.type) === -1) { return null }
        if (token.type === 'text') {
            label += token.content
        } else if (token.type === 'code_inline') {
            label += token.markup + token.content + token.markup
        } else if (token.type === 'softbreak') {
            label += '\n'
        } else {
            // An emphasis delimiter is written both before and after its
            // content, and `markup` is the delimiter the author actually used.
            label += token.markup
        }
    }
    return null
}

/** One body link or attachment, with the encode/decode pair applied once. */
function toBodyLink(token: Token, text: string, url: string): AttachmentLink {
    const normalized = normalizeUrl(url)
    return {
        text,
        originalPath: url,
        normalizedOriginalPath: normalized,
        linkType: getTypeofUrl(normalized),
        source: 'body',
        token: token,
        isWikiLink: isWikiLink(url)
    }
}

export function extractAttachments(tokens: Token[], attachments: AttachmentLink[] = []) {
    tokens.forEach((token, index) => {
        if (token.children && token.children.length > 0) {
            // If the token has children, recursively extract links from children.
            extractAttachments(token.children, attachments);
        }

        // PDFs are also images if they are embedded here...
        if (token.type === 'image') {
            const url = token.attrGet('src') || ''
            attachments.push(
                toBodyLink(token, token.attrGet('alt') || token.content, url));
        }
        // This is like "[url](title)" or [[url|title]] - where title ends with
        // an attachment extension e.g. (pdf, jpg, etc.) (see IMAGE_MATCHER)
        if (token.type === 'link_open') {
            const label = getLinkLabel(tokens, index)
            const url = token.attrGet('href') || ''
            if (label !== null && url.toLocaleLowerCase().match(IMAGE_MATCHER)) {
                attachments.push(toBodyLink(token, label, url));
            }
        }
    })

    return attachments
}


export function extractLinks(tokens: Token[], links: AttachmentLink[] = []) {
    tokens.forEach((token, index) => {
        if (token.children && token.children.length > 0) {
            // If the token has children, recursively extract links from children.
            extractLinks(token.children, links);
        }

        if (token.type === 'link_open') {
            const label = getLinkLabel(tokens, index)
            const url = token.attrGet('href') || ''
            if (label !== null && !url.toLocaleLowerCase().match(IMAGE_MATCHER)) {
                links.push(toBodyLink(token, label, url));
            }
        }
    })

    return links
}

function isWikiLink(url: string){
    return url.startsWith(WIKI_LINK_PREFIX)
}

const OBSIDIAN_LINK_PREFIX = 'obsidian://'
const OBSIDIAN_FILE_PARAM = 'file'

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

/**
 * Reads the `file` query parameter out of an `obsidian://open?...` uri, or
 * null if the uri carries none - or is not parseable at all.
 *
 * An Obsidian uri is a real url with real query parameters, so it gets read as
 * one. Hunting for the literal text "file=" used to end the file name at the
 * end of the string (`...&file=Some%20Note&heading=Intro` gave back
 * "Some Note&heading=Intro"), and used to match the "file=" sitting inside
 * *another* parameter's name (`?notfile=x&file=y` gave back "x&file=y").
 *
 * `new URL()` throws a TypeError on input it cannot parse, so it is guarded:
 * a link nobody can read is handed back untouched rather than taking the
 * export down with it, same as `safeDecodeURIComponent` does.
 */
function getObsidianFileParam(url: string): string | null {
    let search: string
    try {
        search = new URL(url).search
    } catch (e) {
        console.warn(
            `[Bulk Exporter] "${url}" is not a valid obsidian:// url, using it ` +
            `as-is. (${e})`
        )
        return null
    }
    // URLSearchParams reads a query as form data, where '+' means a space.
    // An Obsidian uri is not form data: it is built with encodeURIComponent,
    // which writes a space as %20 and a literal plus as %2B, so a bare '+' in
    // here can only be part of a file name ("C++ notes"). Escaping it before
    // the parse keeps it a plus - the same reading the previous
    // `safeDecodeURIComponent` call gave it.
    //
    // No decode guard is needed beyond that: unlike `decodeURIComponent`,
    // URLSearchParams never throws on a stray '%', it leaves the escape as
    // written. The issue #17 promise holds.
    return new URLSearchParams(search.replace(/\+/g, '%2B')).get(OBSIDIAN_FILE_PARAM)
}

/**
 * What a link TARGETS, whatever notation it is written in: an `obsidian://` uri,
 * the internal `wikilink://` form, a bare `[[wiki link]]` (front matter values
 * are read straight out of the YAML, so they still carry their brackets), or a
 * plain relative path, which is already what it points at.
 *
 * Decodes exactly once - see the one-decode invariant in docs/link-pipeline.md.
 */
export function normalizeUrl(url: string) {
    if (url.startsWith(OBSIDIAN_LINK_PREFIX)) {
        // Just grab the file value from the link - if there is one at all.
        const file = getObsidianFileParam(url)
        if (file !== null) {
            url = file
        }
    }
    if (isWikiLink(url)) {
        url = safeDecodeURIComponent(url.substring(WIKI_LINK_PREFIX.length))
    }
    const wholeWikiLink = url.match(WHOLE_WIKI_LINK_MATCHER)
    if (wholeWikiLink) {
        url = wholeWikiLink[1].trim()
    }
    return url
}

/**
 * External means "has an http(s) scheme", not "starts with the letters http" -
 * that used to send a note named `http-server-setup` down the external branch,
 * where nothing ever resolves it.
 */
function getTypeofUrl(url: string) {
    return EXTERNAL_URL_MATCHER.test(url) ? LinkType.external : LinkType.internal
}

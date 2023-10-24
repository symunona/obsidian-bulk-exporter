import MarkdownIt, { Token } from "markdown-it";
import replaceAll from "../utils/replace-all";

const DOUBLE_BRACKET_LINK_MATCHER = /\[\[([^\]]+)\]\]/g;

// const DOUBLE_BRACKET_ATTACHMENT_MATCHER = /!\[\[([^\]]+)\]\]/g;


const md = new MarkdownIt();


export function getLinksAndAttachments(markdown: string) {
    markdown = replaceDoubleBracketLinks(markdown)
	const parsedMarkdown = md.parse(markdown, {})
    const links = extractLinks(parsedMarkdown)
    const attachments = extractAttachments(parsedMarkdown)
    return {
        parsedMarkdown,
        links,
        attachments
    }
}

/**
 * Instead of trying to hack double bracket into markdown.it parser library, I just pre-process
 * all the links to standard []() notation.
 * @param markdown
 * @returns
 */
export function replaceDoubleBracketLinks(markdown: string): string{
    const results = markdown.match(DOUBLE_BRACKET_LINK_MATCHER)
    if (results){
        results.forEach((link)=>{
            const linkTarget = link.substring(2, link.length - 2)
            const standardLinkStyle = `[${linkTarget}](${encodeURIComponent(linkTarget)})`
            console.warn(link, '->', standardLinkStyle)
            markdown = replaceAll(link, markdown, standardLinkStyle)
        })
    }
    return markdown
}


export function extractAttachments(tokens: Token[], attachments: { text: string; url: string }[] = []) {
    for (const token of tokens) {
        if (token.children && token.children.length > 0) {
            // If the token has children, recursively extract links from children.
            extractAttachments(token.children, attachments);
        }

        if (token.type === 'image') {
            attachments.push({
                text: token.attrGet('alt') || '',
                url: token.attrGet('src') || '',
            });
        }
    }

    return attachments
}


export function extractLinks(tokens: Token[], links: { text: string; url: string }[] = []) {
    for (const token of tokens) {
        if (token.children && token.children.length > 0) {
            // If the token has children, recursively extract links from children.
            extractLinks(token.children, links);
        }

        if (token.type === 'link_open') {
            // When a link_open token is found, extract link text and URL.
            const linkTextToken = tokens[tokens.indexOf(token) + 1];
            if (linkTextToken?.type === 'text' && linkTextToken?.content) {
                links.push({
                    text: linkTextToken.content,
                    url: token.attrGet('href') || '',
                });
            }
        }
    }

    return links
}

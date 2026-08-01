import MarkdownIt from "markdown-it";

/**
 * Parse FrontMatter templates.
 * @param md
 */


export function frontMatterPlugin(md:MarkdownIt) {
    md.core.ruler.push('front-matter', (state) => {
        const content = state.src;

        // Detect front-matter using triple dashes or triple plus signs
        if (content.startsWith('---') || content.startsWith('+++')) {
            const endMarker = content.startsWith('---') ? '---' : '+++';
            const frontMatterEnd = content.indexOf(endMarker, 3);
            if (frontMatterEnd !== -1) {
                // Update the content to exclude the front-matter
                state.src = content.slice(frontMatterEnd + endMarker.length);
            }
        }
    });
}
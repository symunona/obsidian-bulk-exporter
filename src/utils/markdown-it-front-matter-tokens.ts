import MarkdownIt from "markdown-it";
// const jsYAML = require('js-yaml');
import * as jsYAML from 'js-yaml'

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
                const frontMatterContent = content.slice(3, frontMatterEnd);
                const metadata = jsYAML.load(frontMatterContent);

                // Store the front-matter tokens for later use
                const frontMatterToken = {
                    type: 'frontMatter',
                    content: JSON.stringify(metadata),
                    level: 0,
                    data: {
                        frontMatter: metadata,
                    },
                };

                console.log(frontMatterToken)

                // Update the content to exclude the front-matter
                state.src = content.slice(frontMatterEnd + endMarker.length);
            }
        }
    });
}
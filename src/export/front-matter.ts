/**
 * Reading and rewriting the YAML front matter of a note.
 *
 * The exporter used to hand-roll this: split the file on '\n---\n', split every
 * line on ':', and match the value against a lowercased copy of itself. That
 * mangled anything with an uppercase letter, a quote, or a space in it, and it
 * could not see list values at all.
 *
 * `js-yaml` does the parsing here instead, but the note is NOT re-serialized:
 * an export must not reformat a user's front matter. Instead every top level key
 * keeps the exact slice of text it came from, so a value can be swapped in place
 * inside that one key and nothing else in the document moves.
 *
 * @see https://github.com/symunona/obsidian-bulk-exporter/issues/19
 */
import { load } from "js-yaml";
import replaceAll from "../utils/replace-all";

/**
 * The document has front matter only if it *opens* with a '---' line and has a
 * closing one. Anything else - including a note whose body happens to contain a
 * horizontal rule - has none.
 */
const FRONT_MATTER_MATCHER = /^(---[^\S\n]*\r?\n)([\s\S]*?)(\r?\n---[^\S\n]*(?:\r?\n|$))/

/**
 * A line that starts a new top level entry: no indent, no list dash, and a key
 * followed by a colon. Everything after it belongs to that key until the next
 * one - that is what makes list and multi line values work.
 */
const TOP_LEVEL_KEY_MATCHER = /^[^\s#-][^:]*:(\s|$)/

export interface FrontMatterBlock {
    /** The YAML between the '---' markers, markers not included. */
    yaml: string
    /** Where `yaml` starts within the whole document. */
    start: number
    /** Where `yaml` ends within the whole document, exclusive. */
    end: number
}

export interface FrontMatterKeyBlock {
    /** The key, as YAML understands it (unquoted). */
    key: string
    /** The raw text of the key line and every line belonging to it. */
    text: string
    /** Where `text` starts within the front matter YAML. */
    start: number
    /** Where `text` ends within the front matter YAML, exclusive. */
    end: number
    /** Every string under this key: the value itself, or the strings inside it. */
    values: Array<string>
}

export function findFrontMatterBlock(content: string): FrontMatterBlock | null {
    const match = content.match(FRONT_MATTER_MATCHER)
    if (!match) { return null }
    // The regex is anchored at the beginning, so these are absolute offsets.
    const start = match[1].length
    return { yaml: match[2], start, end: start + match[2].length }
}

/**
 * Cuts the front matter into one block per top level key, and parses each block
 * on its own. Per block, so that one entry YAML cannot read - `title: Bad: line`
 * for instance - only costs that entry, not every image in the file.
 */
export function getFrontMatterKeyBlocks(yaml: string): Array<FrontMatterKeyBlock> {
    const rawBlocks: Array<RawBlock> = []
    let offset = 0

    yaml.split('\n').forEach((line) => {
        const openBlock = rawBlocks[rawBlocks.length - 1]
        if (TOP_LEVEL_KEY_MATCHER.test(line)) {
            rawBlocks.push({ text: line, start: offset, end: offset + line.length })
        } else if (openBlock) {
            // Not a new key: this line still belongs to the previous one. That is
            // what makes list values and multi line strings work.
            openBlock.text += '\n' + line
            openBlock.end = offset + line.length
        }
        // +1 for the '\n' that split() removed.
        offset += line.length + 1
    })

    return rawBlocks.map(toKeyBlock).filter((block) => block.key !== '')
}

interface RawBlock { text: string, start: number, end: number }

function toKeyBlock(raw: RawBlock): FrontMatterKeyBlock {
    let parsed: unknown
    try {
        parsed = load(raw.text)
    } catch (e) {
        console.warn(
            `[Bulk Exporter] Skipping a front matter entry that is not valid YAML: ` +
            `"${raw.text.split('\n')[0]}" (${e instanceof Error ? e.message.split('\n')[0] : e})`
        )
        return Object.assign({ key: '', values: [] }, raw)
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return Object.assign({ key: '', values: [] }, raw)
    }
    const entries = Object.entries(parsed as Record<string, unknown>)
    if (entries.length !== 1) {
        return Object.assign({ key: '', values: [] }, raw)
    }
    return Object.assign({ key: entries[0][0], values: collectStrings(entries[0][1]) }, raw)
}

/** Every string leaf of a value: a scalar, a list of them, or a nested map. */
function collectStrings(value: unknown, found: Array<string> = []): Array<string> {
    if (typeof value === 'string') {
        found.push(value)
    } else if (Array.isArray(value)) {
        value.forEach((item) => collectStrings(item, found))
    } else if (value && typeof value === 'object') {
        Object.values(value as Record<string, unknown>).forEach(
            (item) => collectStrings(item, found))
    }
    return found
}

/**
 * Swaps one value of one front matter key, leaving the rest of the document -
 * quoting, indentation, comments, key order, body - byte for byte as it was.
 *
 * Scoped to the key on purpose: a blind replace over the whole front matter
 * would also hit an unrelated key that happens to contain the same text.
 */
export function replaceFrontMatterValue(
    content: string,
    key: string,
    oldValue: string,
    newValue: string
): string {
    const frontMatter = findFrontMatterBlock(content)
    if (!frontMatter) { return content }

    const block = getFrontMatterKeyBlocks(frontMatter.yaml).find(
        (candidate) => candidate.key === key && candidate.values.indexOf(oldValue) > -1)
    if (!block) { return content }

    const yaml = frontMatter.yaml.substring(0, block.start) +
        replaceAll(oldValue, block.text, newValue) +
        frontMatter.yaml.substring(block.end)

    return content.substring(0, frontMatter.start) + yaml + content.substring(frontMatter.end)
}

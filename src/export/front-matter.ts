/**
 * Reading and rewriting the YAML front matter of a note.
 *
 * The exporter used to hand-roll this: split the file on '\n---\n', split every
 * line on ':', and match the value against a lowercased copy of itself. That
 * mangled anything with an uppercase letter, a quote, or a space in it, and it
 * could not see list values at all.
 *
 * Obsidian's own `parseYaml` does the parsing here instead, but the note is NOT re-serialized:
 * an export must not reformat a user's front matter. Instead every top level key
 * keeps the exact slice of text it came from, so a value can be swapped in place
 * inside that one key and nothing else in the document moves.
 *
 * @see https://github.com/symunona/obsidian-bulk-exporter/issues/19
 */
import { parseYaml } from "obsidian";
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
    /**
     * Where those strings physically are. A value only appears here if its source
     * span could be pinned down; `values` is the complete list either way.
     */
    valueSpans: Array<FrontMatterValueSpan>
}

/** The quote a scalar is written with. Empty for a plain, unquoted one. */
export type YamlQuote = '' | '"' | "'"

/**
 * One value's exact source span inside a key block's raw `text`.
 *
 * This is what stops the write-back from matching one representation against
 * another. `value` is what YAML makes of the slice; `start`/`end` bound the slice
 * ITSELF, quotes included. Two bugs came out of not having it:
 *
 * - a literal replace of `hero.png` inside
 *   `images:\n  - hero.png\n  - thumbs/hero.png` also rewrote the substring in the
 *   second entry, and the second attachment then found nothing left to change;
 * - `thumb: 'it''s.png'` parses to `it's.png`, which does not occur anywhere in
 *   the raw text, so the asset was copied and the link never updated - silently.
 *
 * Recording the span at parse time answers both: the write-back splices at a known
 * offset instead of searching. The document is still never re-serialised - only
 * the one scalar is rewritten, and in the quoting style it already had.
 */
export interface FrontMatterValueSpan {
    /** The value as YAML understands it - decoded, unquoted. */
    value: string
    /** Where the raw scalar starts within the key block's `text`. */
    start: number
    /** Where the raw scalar ends within the key block's `text`, exclusive. */
    end: number
    /** How it is written, so a replacement can be written the same way. */
    quote: YamlQuote
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
    const empty = Object.assign({ key: '', values: [], valueSpans: [] }, raw)
    let parsed: unknown
    try {
        parsed = parseYaml(raw.text)
    } catch (e) {
        console.warn(
            `[Bulk Exporter] Skipping a front matter entry that is not valid YAML: ` +
            `"${raw.text.split('\n')[0]}" (${e instanceof Error ? e.message.split('\n')[0] : e})`
        )
        return empty
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return empty
    }
    const entries = Object.entries(parsed)
    if (entries.length !== 1) {
        return empty
    }
    return Object.assign({
        key: entries[0][0],
        values: collectStrings(entries[0][1]),
        valueSpans: scanValueSpans(raw.text)
    }, raw)
}

/**
 * Walks a key block line by line and reports the source span of every scalar
 * value it can place with certainty.
 *
 * Deliberately conservative: it only claims a span when the whole scalar sits on
 * one line and YAML reads that slice back as a string. A flow sequence
 * (`images: [a.png, b.png]`), a block scalar (`thumb: >-`) or a quoted value that
 * runs over a line break is left unclaimed, and the write-back falls back to what
 * it has always done. Nothing here can be wrong about a value it does not report.
 *
 * Keys are never reported - the scan starts AFTER the `key:` - so a key that
 * happens to read like a value can never be mistaken for one.
 */
function scanValueSpans(text: string): Array<FrontMatterValueSpan> {
    const spans: Array<FrontMatterValueSpan> = []
    let lineStart = 0
    text.split('\n').forEach((line) => {
        const span = scanLineValue(line)
        if (span) {
            spans.push(Object.assign({}, span, {
                start: lineStart + span.start,
                end: lineStart + span.end
            }))
        }
        // +1 for the '\n' that split() removed.
        lineStart += line.length + 1
    })
    return spans
}

/** The scalar on one line, as an offset pair within that line. */
function scanLineValue(line: string): FrontMatterValueSpan | null {
    let at = skipSpaces(line, 0)

    // A list item, possibly nested: "- - a.png" is a list inside a list.
    while (line[at] === '-' && (line[at + 1] === ' ' || at + 1 === line.length)) {
        at = skipSpaces(line, at + 2)
    }

    // The very same shape a top level key has, only matched against what is left
    // of the line - which is how the `src:` of a nested map is found too.
    const key = line.substring(at).match(TOP_LEVEL_KEY_MATCHER)
    if (key) {
        at = skipSpaces(line, at + key[0].length)
    }
    if (at >= line.length || line[at] === '#') { return null }

    const quote: YamlQuote = line[at] === '"' ? '"' : line[at] === "'" ? "'" : ''
    const end = quote ? closingQuote(line, at, quote) : plainScalarEnd(line, at)
    if (end <= at) { return null }

    let value: unknown
    try {
        value = parseYaml(line.substring(at, end))
    } catch {
        // Not a scalar this line can explain on its own - a block scalar header,
        // an anchor, half of a multi line string. Leave it unclaimed.
        return null
    }
    if (typeof value !== 'string') { return null }

    return { value, start: at, end, quote }
}

function skipSpaces(line: string, from: number): number {
    let at = from
    while (line[at] === ' ') { at++ }
    return at
}

/**
 * The index just past the closing quote, or -1 if the scalar does not end on this
 * line. YAML escapes differ per quote style: '' inside single quotes, backslash
 * inside double ones.
 */
function closingQuote(line: string, from: number, quote: YamlQuote): number {
    for (let at = from + 1; at < line.length; at++) {
        if (quote === '"' && line[at] === '\\') { at++; continue }
        if (line[at] !== quote) { continue }
        if (quote === "'" && line[at + 1] === "'") { at++; continue }
        return at + 1
    }
    return -1
}

/**
 * A plain scalar runs to the end of the line, minus a trailing comment and any
 * trailing whitespace - the '\r' of a CRLF file included. Both are outside the
 * value and must survive the rewrite untouched.
 */
function plainScalarEnd(line: string, from: number): number {
    const comment = line.indexOf(' #', from)
    let end = comment > -1 ? comment : line.length
    while (end > from && /\s/.test(line[end - 1])) { end-- }
    return end
}

/** Writes a value back in the quoting style the scalar it replaces was using. */
function writeScalar(value: string, quote: YamlQuote): string {
    if (quote === '"') {
        return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
    }
    if (quote === "'") {
        return `'${value.replace(/'/g, "''")}'`
    }
    return value
}

/** Every string leaf of a value: a scalar, a list of them, or a nested map. */
function collectStrings(value: unknown, found: Array<string> = []): Array<string> {
    if (typeof value === 'string') {
        found.push(value)
    } else if (Array.isArray(value)) {
        value.forEach((item) => collectStrings(item, found))
    } else if (value && typeof value === 'object') {
        Object.values(value).forEach(
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
 *
 * Scoped to the one VALUE too, by its recorded source span. Scoping to the key
 * alone was not enough: `oldValue` is what YAML parsed, `block.text` is what the
 * user wrote, and a literal replace between the two got both directions wrong -
 * it matched too much (`hero.png` inside `thumbs/hero.png`) and it matched too
 * little (`it's.png` never occurs in `'it''s.png'`). @see FrontMatterValueSpan.
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

    const span = block.valueSpans.find((candidate) => candidate.value === oldValue)
    const text = span
        ? block.text.substring(0, span.start) +
          writeScalar(newValue, span.quote) +
          block.text.substring(span.end)
        // The scan could not place this value - a flow sequence, a block scalar,
        // a string spanning lines. Fall back to the literal replace, which is what
        // this function did for every value before spans existed.
        : replaceAll(oldValue, block.text, newValue)

    const yaml = frontMatter.yaml.substring(0, block.start) +
        text +
        frontMatter.yaml.substring(block.end)

    return content.substring(0, frontMatter.start) + yaml + content.substring(frontMatter.end)
}

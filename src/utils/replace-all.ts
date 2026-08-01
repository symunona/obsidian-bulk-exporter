/**
 * A LITERAL global replace: every occurrence of `hay` in `stack` becomes exactly
 * `replaceTo`, character for character.
 *
 * The needle is escaped so it cannot act as a pattern. The replacement is handed
 * over as a FUNCTION for the mirror reason: a replacement string given to
 * `String.replace` is not literal either - `$&`, '$`', "$'" and `$$` are
 * substitution patterns and get expanded. A note titled `a$&b` or an asset named
 * `a$&b.png` therefore used to come out as the matched text spliced into itself.
 * A replacer function is never scanned for those, so what is passed in is what
 * lands.
 *
 * (`$1` only ever survived by luck: the escaped needle has no capture groups, so
 * there was nothing for it to expand to. Nothing should depend on that.)
 */
export default function replaceAll(hay: string, stack: string, replaceTo: string) {
    return stack.replace(new RegExp(escapeRegExp(hay), 'g'), () => replaceTo)
}

export function matchAll(hay: string, stack: string) {
    return stack.match(new RegExp(escapeRegExp(hay), 'g'))
}

export function escapeRegExp(str: string) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

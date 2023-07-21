export default function replaceAll(hay: string, stack: string, replaceTo: string) {
    return stack.replace(new RegExp(escapeRegExp(hay), 'g'), replaceTo)
}

export function matchAll(hay: string, stack: string) {
    return stack.match(new RegExp(escapeRegExp(hay), 'g'))
}

export function escapeRegExp(str: string) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

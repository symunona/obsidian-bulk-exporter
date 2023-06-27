export default function replaceAll(hay: string, stack: string, replaceTo: string) {
    return stack.replace(new RegExp(escapeRegExp(hay), 'g'), replaceTo)
}

function escapeRegExp(str: string) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

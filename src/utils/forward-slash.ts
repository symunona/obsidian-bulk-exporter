/**
 * Replaces all the \ slashes with / in a string.
 * @param path 
 * @returns 
 */
export function normalizeLinkToForwardSlash(path: string): string{
    return path.replace(/\\/g, '/')
}
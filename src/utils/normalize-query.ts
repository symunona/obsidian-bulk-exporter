/**
 * DataView works with queries, we just use table file query
 * that returns the TAbstractFile list.
 * We also simplify that.
 * @param userQuery 
 * @returns 
 */

export function	normalizeQuery(userQuery: string): string {
    let query = ''
    if (userQuery.startsWith('from') ||
        userQuery.startsWith('where') ||
        userQuery.startsWith('group by') ||
        userQuery.startsWith('limit') ||
        userQuery.startsWith('flatten')) {
        query = "table file " + userQuery
    } else {
        // Assume the where
        query = "table file where " + userQuery
    }
    return query
}

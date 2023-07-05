/**
 * DataView works with queries, we just use table file query
 * that returns the TAbstractFile list.
 * We also simplify that.
 * @param userQuery
 * @returns
 */

export function normalizeQuery(userQuery: string): string {
	let query = "";
	const lowerCaseQuery = userQuery.toLocaleLowerCase().trim()
	if (
		lowerCaseQuery.startsWith("from") ||
		lowerCaseQuery.startsWith("where") ||
		lowerCaseQuery.startsWith("group by") ||
		lowerCaseQuery.startsWith("limit") ||
		lowerCaseQuery.startsWith("flatten")
	) {
		query = "table file " + userQuery;
	} else {
		// Assume the where
		query = "table file where " + userQuery;
	}
	return query;
}

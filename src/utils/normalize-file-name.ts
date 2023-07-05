/**
 * Removes spaces and slashes from the name, replacing them with dash.
 * @param fileName
 * @returns
 */
export default function normalizeFileName(fileName: string): string {
	return String(fileName || "")
		.toLowerCase()
		.replace(/_|\s|\.|,|\(|\)|\[|\]/g, "-")
		.replace(/[^A-Za-z0-9\-_]/g, "");
}

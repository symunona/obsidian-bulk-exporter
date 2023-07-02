import { ExportMap } from "./export-properties";

export interface BulkExportSettings {
	slug: string;
	outputFormat: string;
	smartSlug: boolean;
	groupBy: string;
	outputFolder: string;
	exportQuery: string;
	emptyTargetFolder: boolean,
	assetPath: string,
	autoImportFromWeb: boolean,
	lastExport: ExportMap
}

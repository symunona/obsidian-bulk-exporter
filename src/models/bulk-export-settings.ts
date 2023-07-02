import { ExportMap } from "./export-properties";

export interface BulkExportSettings {
	slug: string;
	outputFormat: string;
	outputFolder: string;
	exportQuery: string;
	emptyTargetFolder: boolean,
	assetPath: string,
	lastExport: ExportMap
}

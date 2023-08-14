import { ExportMap } from "./export-properties";

export interface BulkExportSettings {
	outputFormat: string;
	outputFolder: string;
	exportQuery: string;
	draftField: string;
	emptyTargetFolder: boolean;
	assetPath: string;
	lastExport: ExportMap;
	shell: string;
}

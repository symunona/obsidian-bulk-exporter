import { ExportMap } from "./export-properties";

export interface BulkExportSettings {
	name: string,
	outputFormat: string;
	outputFolder: string;
	exportQuery: string;
	draftField: string;
	emptyTargetFolder: boolean;

	assetPath: string;
	absoluteAssets: boolean;

	lastExport: ExportMap;
	shell: string;
	headerFieldsToShow: Array<string>;

	groupOpenMap: {[id: string]: boolean}
}

export interface BulkExportSettingsList {
	items: Array<BulkExportSettings>,
	selected: number
}

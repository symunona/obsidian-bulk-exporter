import { ExportMap } from "./export-properties";


export const DEFAULT_SETTINGS: BulkExportSettings = {
	name: "export set",
	outputFolder: "output",
	exportQuery: "blog",
	emptyTargetFolder: false,
	isPublishedField: '',
	assetPath: "assets",
	outputFormat: '${blog}/${slug}',
	lastExport: {},
	shell: '',
	headerFieldsToShow: [],
	groupOpenMap: {},
	absoluteAssets: false
};

export interface BulkExportSettings {
	name: string,
	outputFormat: string;
	outputFolder: string;
	exportQuery: string;
	isPublishedField: string;
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
	selected: number,
	preview: string
}

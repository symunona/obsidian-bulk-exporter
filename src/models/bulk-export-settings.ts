import { ExportMap } from "./export-properties";


export const DEFAULT_SETTINGS: BulkExportSettings = {
	name: "export set",
	outputFolder: "output",
	exportQuery: "blog",
	emptyTargetFolder: false,
	emptyTargetFolderIgnore: '',

	isPublishedField: '',
	assetPath: "assets",
	outputFormat: '${blog}/${slug}',
	lastExport: {},
	shell: '',
	headerFieldsToShow: [],
	groupOpenMap: {},
	absoluteAssets: false,
	preserveWikiLinks: true,
	normalizeSpacesInLinks: false,
	keepLinksNotFound: false,
	keepLinksPrivate: false
};

export interface BulkExportSettings {
	name: string,
	outputFormat: string;
	outputFolder: string;
	exportQuery: string;
	isPublishedField: string;
	emptyTargetFolder: boolean;
	emptyTargetFolderIgnore: string,

	preserveWikiLinks: boolean;
	normalizeSpacesInLinks: boolean;

	assetPath: string;
	absoluteAssets: boolean;

	lastExport: ExportMap;
	shell: string;
	headerFieldsToShow: Array<string>;

	keepLinksNotFound: boolean;
	keepLinksPrivate: boolean;

	groupOpenMap: {[id: string]: boolean}
}

export interface BulkExportSettingsList {
	items: Array<BulkExportSettings>,
	selected: number,
	preview: string
}

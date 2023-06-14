import { ItemView, Notice, WorkspaceLeaf } from "obsidian";


import { getAPI as getDataViewApi } from "obsidian-dataview";
import { SearchInputWithHistory } from "./ui/search-history";
import { setLogOutput } from "./utils/log";
import { Exporter, exportSelection, getGroups, getSingletonExporter } from "./export/exporter";
import { MetaDataViewTableRender } from "./ui/render-table";
import { getMetaFieldsAndValues } from "./utils/folder-meta";
import { createTreeFromFileMap } from "utils";
import { ExportMap } from "./utils/create-path-map";
import { ExportTableRender } from "./ui/render-export";
import { getIcon } from "./obsidian-api-helpers/get-icon";

export const META_DATA_VIEW_TYPE = "bulk-exporter-preview";

export const MAX_META_VALUE_LENGTH_TO_DISPLAY = 20;

// const MAX_LIST = 10;

export class BulkExporterView extends ItemView {
	dataViewApi = getDataViewApi();
	header: HTMLElement;
	error: HTMLElement;
	results: HTMLElement;
	searchInput: SearchInputWithHistory
	exportButton: HTMLButtonElement;
	topRightMenuContainer: HTMLDivElement;
	log: HTMLDivElement;
	lastFoundFileList: ExportMap;
	exporter: Exporter
	settingsButton: HTMLButtonElement;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
		// Exporter already initialized
		this.exporter = getSingletonExporter()
	}

	getIcon() {
		return "folder-input";
	}

	getViewType() {
		return META_DATA_VIEW_TYPE;
	}

	getDisplayText() {
		return "Bulk Export Preview";
	}

	async onOpen() {
		const container = this.containerEl.children[1];
		container.empty();
		container.classList.add('meta-data-view')
		this.header = container.createDiv();
		this.error = container.createDiv();
		this.results = container.createDiv();

		// Logging
		this.log = container.createDiv();
		this.log.style.whiteSpace = "pre-wrap"
		setLogOutput(this.log)

		this.topRightMenuContainer = this.header.createDiv({ cls: 'top-right-button-container' })
		this.settingsButton = this.topRightMenuContainer.createEl('button')
		this.exportButton = this.topRightMenuContainer.createEl('button', { text: "Export ..." })
		this.settingsButton.append(getIcon('settings'))
		this.exportButton.append(getIcon('folder-input'))
		this.header.createEl("h4", { text: "Bulk Exporter Preview" });

		this.exportButton.addEventListener('click', async() => {
			if (this.lastFoundFileList && this.lastFoundFileList.length) {
				await exportSelection(this.lastFoundFileList)
				this.log.scrollIntoView();
			} else {
				new Notice('Hmmm... Nothing to export.')
			}
		})

		this.settingsButton.addEventListener('click', ()=>{
			console.warn('this.app', this.exporter.plugin)
			// this.plugin
			// this.app.internalPlugins.plugins['your-plugin-id'].openSettings();
		})

		// @ts-ignore
		console.warn('onOpen, exporter view', this.plugin)

		const results = await this.exporter.searchFilesToExport()

		this.renderPreviewTable(results)

	}

	/**
	 * Group by the exported folder and order by one of the fields
	 * @param results
	 */
	renderPreviewTable(results: ExportMap){
		const resultListEl = this.results.createEl("div", { cls: 'nav-files-container meta-data-view-table-container' });

		new ExportTableRender(
				resultListEl,
				results,
				this.exporter.plugin.settings
				)
	}

	async onClose() {
		// Nothing to clean up.
	}
}


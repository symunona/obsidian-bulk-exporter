import { ItemView, Notice, WorkspaceLeaf } from "obsidian";

import { error, log, setLogOutput } from "./utils/log";
import { Exporter } from "./export/exporter";
import { ExportTableRender } from "./ui/render-export";
import { getIcon } from "./obsidian-api-helpers/get-icon";
import openSettingsPage from "./obsidian-api-helpers/open-settings-page";
import BulkExporterPlugin from "./main";
import { ExportMap } from "./models/export-properties";
import { BulkExportSettings } from "./models/bulk-export-settings";
import { ButtonWithLoader } from "./utils/button-with-loader";
import { Select } from "./utils/select";

export const META_DATA_VIEW_TYPE = "bulk-exporter-preview";

export const MAX_META_VALUE_LENGTH_TO_DISPLAY = 20;

// const MAX_LIST = 10;

export class BulkExporterView extends ItemView {
	header: HTMLElement;
	error: HTMLElement;
	results: HTMLElement;
	exportButton: HTMLButtonElement;
	topRightMenuContainer: HTMLDivElement;
	log: HTMLDivElement;
	lastFoundFileList: ExportMap;
	exporter: Exporter;
	settingsButton: HTMLButtonElement;
	settingsHeader: HTMLDivElement;
	plugin: BulkExporterPlugin;
	refreshButton: HTMLButtonElement;
	logButton: HTMLButtonElement;
	clearLogButton: HTMLButtonElement;
	exportTable: ExportTableRender;

	constructor(leaf: WorkspaceLeaf, plugin: BulkExporterPlugin) {
		super(leaf);
		this.plugin = plugin;

		// Exporter already initialized
		this.exporter = this.plugin.exporter;
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
		container.classList.add("meta-data-view");

		this.header = container.createDiv();

		this.settingsHeader = container.createDiv();
		this.settingsHeader.style.display = "none";

		this.renderSettings(this.settingsHeader);
		this.error = container.createDiv();
		this.results = container.createDiv();

		// Logging
		this.log = this.settingsHeader.createDiv();
		this.clearLogButton = this.log.createEl('button', {text: 'Clear', cls: 'clear-log-button'})
		this.clearLogButton.addEventListener('click', ()=>{
			this.log.querySelectorAll('.log-entry').forEach(e=>e.remove())
		})

		setLogOutput(this.log);
		log('Hey! Single click on the file name to reveal it in the sidebar, double click to open it!')

		this.topRightMenuContainer = this.header.createDiv({
			cls: "top-right-button-container",
		});


		this.refreshButton = this.topRightMenuContainer.createEl("button", {title: 'Refresh'});
		this.refreshButton.append(getIcon("refresh-cw"));
		this.refreshButton.addEventListener("click", () => {
			this.refresh();
		});

		this.logButton = this.topRightMenuContainer.createEl("button", {title: 'Show Log'});
		this.logButton.append(getIcon("bug"));
		this.logButton.addEventListener("click", () => {
			this.settingsHeader.style.display =
				this.settingsHeader.style.display === "none" ? "block" : "none";
		});

		this.settingsButton = this.topRightMenuContainer.createEl("button", {title: 'Open Plugin Settings'});
		this.settingsButton.append(getIcon("settings"));
		this.settingsButton.addEventListener("click", () => {
			openSettingsPage("bulk-exporter", this.plugin);
		});

		this.exportButton = this.topRightMenuContainer.createEl("button", {
			text: "Export ...",
		});

		new ButtonWithLoader(this.topRightMenuContainer,
			{domElementInfo: {text: 'Export...'}},
			async ()=>{
				if (
					this.lastFoundFileList &&
					Object.keys(this.lastFoundFileList).length
				) {
					await this.exporter.searchAndExport();
					this.log.scrollIntoView();
				} else {
					new Notice("Hmmm... Nothing to export.");
				}
			}, (e)=>{
				error(e?.message || 'Something went wrong with the export, see log!')
				this.settingsHeader.style.display = 'block';
				this.log.style.display = 'block'
			})

		const h = this.header.createEl("h4", { text: "Bulk Exporter Preview" });
		this.renderSelector(h)

		this.refresh();
	}

	exportOne(setting: BulkExportSettings){

	}

	async refresh() {
		if (this.exportTable) this.exportTable.remove()
		try {
			const results = await this.exporter.searchAll();
			// this.lastFoundFileList = results;
			results.forEach((result)=>{
				this.renderPreviewTable(result);
			})
		} catch (e) {
			this.settingsHeader.style.display = "block";
			console.error(e)
		}
	}

	/**
	 * Group by the exported folder and order by one of the fields
	 * @param results
	 */
	renderPreviewTable(results: ExportMap) {
		// if (this.exportTable) this.exportTable.remove()
		this.exportTable = new ExportTableRender(
			this.results,
			results,
			this.plugin
		);
	}

	renderSelector(root: HTMLElement){
		const selectItems = this.plugin.settings.items.map((setting, i)=>{
			return {text: setting.name, value: String(i)}})

		new Select(root, selectItems, (evt, selectedId)=>{
			this.plugin.settings.selected = parseInt(selectedId);
		})
	}

	renderSettings(root: HTMLElement) {
		const settingsRoot = root.createEl("table");
		Object.keys(this.plugin.settings).forEach(
			(settingKey: keyof typeof this.plugin.settings) => {
				// Do not render every property.
				if (
					["lastExport"].indexOf(settingKey) > -1
				) {
					return;
				}
				const tr = settingsRoot.createEl("tr");

				// const value = this.plugin.settings.items[this.plugin.settings.selected][settingKey] as string;
				// // const keyE =
				// tr.createEl("td", { text: settingKey + ": " });
				// // const valueE =
				// tr.createEl("td", { text: value });
			}
		);
	}

	async onClose() {
		// Nothing to clean up.
	}
}

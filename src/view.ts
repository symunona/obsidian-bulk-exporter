import { ItemView, Notice, WorkspaceLeaf } from "obsidian";

import { getAPI as getDataViewApi } from "obsidian-dataview";
import { log, setLogOutput } from "./utils/log";
import { Exporter } from "./export/exporter";
import { ExportTableRender } from "./ui/render-export";
import { getIcon } from "./obsidian-api-helpers/get-icon";
import openSettingsPage from "./obsidian-api-helpers/open-settings-page";
import BulkExporterPlugin from "./main";
import { ExportMap } from "./models/export-properties";

export const META_DATA_VIEW_TYPE = "bulk-exporter-preview";

export const MAX_META_VALUE_LENGTH_TO_DISPLAY = 20;

// const MAX_LIST = 10;

export class BulkExporterView extends ItemView {
	dataViewApi = getDataViewApi();
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
		this.exportButton.append(getIcon("folder-input"));
		this.exportButton.addEventListener("click", async () => {
			if (
				this.lastFoundFileList &&
				Object.keys(this.lastFoundFileList).length
			) {
				await this.exporter.searchAndExport();
				this.log.scrollIntoView();
			} else {
				new Notice("Hmmm... Nothing to export.");
			}
		});

		this.header.createEl("h4", { text: "Bulk Exporter Preview" });

		this.refresh();
	}

	async refresh() {
		try {
			const results = await this.exporter.searchFilesToExport();
			this.lastFoundFileList = results;
			this.renderPreviewTable(results);
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
		this.results.innerHTML = ''
		const resultListEl = this.results.createEl("div", {
			cls: "nav-files-container meta-data-view-table-container",
		});

		new ExportTableRender(
			resultListEl,
			results,
			this.plugin
		);
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
				const value = this.plugin.settings[settingKey] as string;
				// const keyE =
				tr.createEl("td", { text: settingKey + ": " });
				// const valueE =
				tr.createEl("td", { text: value });
			}
		);
	}

	async onClose() {
		// Nothing to clean up.
	}
}

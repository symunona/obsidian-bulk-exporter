import { ItemView, WorkspaceLeaf } from "obsidian";

import { error, log, setLogOutput } from "./utils/log";
import { Exporter } from "./export/exporter";
import { ExportTableRender } from "./ui/render-export";
import { getIcon } from "./obsidian-api-helpers/get-icon";
import openSettingsPage from "./obsidian-api-helpers/open-settings-page";
import BulkExporterPlugin from "./main";
import { ExportMap } from "./models/export-properties";
import { BulkExportSettings } from "./models/bulk-export-settings";
import { ButtonWithLoader } from "./ui/button-with-loader";
import { Select } from "./ui/select";

export const META_DATA_VIEW_TYPE = "bulk-exporter-preview";

export const MAX_META_VALUE_LENGTH_TO_DISPLAY = 20;

// const MAX_LIST = 10;

export class BulkExporterView extends ItemView {
	header: HTMLElement;
	error: HTMLElement;
	resultsContainer: HTMLElement;
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
	lastFoundFileLists: { setting: BulkExportSettings; results: ExportMap; }[];

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

		this.error = container.createDiv();
		this.resultsContainer = container.createDiv();

		// Logging
		this.log = this.settingsHeader.createDiv();
		this.clearLogButton = this.log.createEl('button', { text: 'Clear', cls: 'clear-log-button' })
		this.clearLogButton.addEventListener('click', () => {
			this.log.querySelectorAll('.log-entry').forEach(e => e.remove())
		})

		setLogOutput(this.log);
		log('Hey! Single click on the file name to reveal it in the sidebar, double click to open it!')

		this.topRightMenuContainer = this.header.createDiv({
			cls: "top-right-button-container",
		});


		this.refreshButton = this.topRightMenuContainer.createEl("button", { title: 'Refresh' });
		this.refreshButton.append(getIcon("refresh-cw"));
		this.refreshButton.addEventListener("click", () => {
			this.refresh();
		});

		this.logButton = this.topRightMenuContainer.createEl("button", { title: 'Show Log' });
		this.logButton.append(getIcon("bug"));
		this.logButton.addEventListener("click", () => {
			this.settingsHeader.style.display =
				this.settingsHeader.style.display === "none" ? "block" : "none";
		});

		this.settingsButton = this.topRightMenuContainer.createEl("button", { title: 'Open Plugin Settings' });
		this.settingsButton.append(getIcon("settings"));
		this.settingsButton.addEventListener("click", () => {
			openSettingsPage("bulk-exporter", this.plugin);
		});


		new ButtonWithLoader(this.topRightMenuContainer,
			{
				domElementInfo: { text: 'Export ' }
			},
			async () => {

				if (this.plugin.settings.preview === 'all') {
					try {
						this.resultsContainer.innerText = '';
						const list = await this.exporter.searchAndExportAll();
						list.forEach(({ setting, results }) => {
							this.renderPreviewTable(results, setting);
						})

					} catch (e) {
						this.settingsHeader.style.display = "block";
						console.error(e)
					}
				} else {
					const selectedIndex = parseInt(this.plugin.settings.preview)
					const setting = this.plugin.settings.items[selectedIndex]
					await this.exporter.searchAndExport(setting)
				}
			}, (e) => {
				error(e?.message || 'Something went wrong with the export, see log!')
				this.settingsHeader.style.display = 'block';
				this.log.style.display = 'block'
			})

		const h = this.header.createEl("h4");
		if (this.plugin.settings.items.length > 1) {
			this.renderSelector(h)
		} else {
			h.setText('Bulk Exporter Preview ' + this.plugin.settings.items[0].name)
		}

		this.refresh();
	}

	async refresh() {
		this.resultsContainer.innerText = '';
		if (this.plugin.settings.preview === 'all') {
			try {
				const results = await this.exporter.searchAll();
				// this.lastFoundFileLists = results;
				results.forEach(({ setting, results }) => {
					this.renderPreviewTable(results, setting);
				})
			} catch (e) {
				this.settingsHeader.style.display = "block";
				console.error(e)
			}
		} else {
			const selectedIndex = parseInt(this.plugin.settings.preview)
			const setting = this.plugin.settings.items[selectedIndex]
			const results = await this.exporter.searchFilesToExport(setting)
			this.renderPreviewTable(results, setting);
		}
	}

	/**
	 * Group by the exported folder and order by one of the fields
	 * @param results
	 */
	renderPreviewTable(results: ExportMap, settings: BulkExportSettings) {
		this.exportTable = new ExportTableRender(
			this.resultsContainer,
			results,
			settings,
			this.plugin
		);
	}

	renderSelector(root: HTMLElement) {
		const selectItems = this.plugin.settings.items.map((setting, i) => {
			return { text: setting.name, value: String(i) }
		})

		selectItems.unshift({ text: '-- All --', value: 'all' })

		new Select(root, selectItems, (evt, selectedId) => {
			this.plugin.settings.preview = selectedId === 'all' ? 'all' : selectedId
			if (selectedId === 'all') {
				this.resultsContainer.innerText = '';
			} else {
				this.plugin.settings.selected = parseInt(selectedId);
			}
			this.refresh()
			this.plugin.saveSettings()
		}, { value: this.plugin.settings.preview })
	}


	async onClose() {
		// Nothing to clean up.
	}
}

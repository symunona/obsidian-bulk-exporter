import { Plugin } from "obsidian";
import { BulkExporterView, META_DATA_VIEW_TYPE } from "src/view";

import { Exporter } from "./export/exporter";
import { BulkExportSettings, BulkExportSettingsList } from "./models/bulk-export-settings";
import { OutputSettingTab } from "./settings/export-settings-tab";

export const DEFAULT_SETTINGS: BulkExportSettings = {
	name: "export set",
	outputFolder: "output",
	exportQuery: "blog",
	emptyTargetFolder: false,
	draftField: '',
	assetPath: "assets",
	outputFormat: '${blog}/${slug}',
	lastExport: {},
	shell: '',
	headerFieldsToShow: [],
	groupOpenMap: {},
	absoluteAssets: false
};

export default class BulkExporterPlugin extends Plugin {
	settings: BulkExportSettingsList;

	exporter: Exporter;

	inited = false;

	async onload() {
		await this.loadSettings();
		this.exporter = new Exporter(this);
		this.exporter.registerUpdates();

		this.registerView(
			META_DATA_VIEW_TYPE,
			(leaf) => new BulkExporterView(leaf, this)
		);

		this.addRibbonIcon(
			"folder-input",
			"Bulk Exporter Preview",
			(evt: MouseEvent) => {
				this.activateView();
			}
		);

		this.addCommand({
			id: "bulk-export",
			name: "Bulk Export",
			callback: () => {
				this.exporter.searchAndExportAll();
				this.activateView();
			},
		});

		this.addSettingTab(new OutputSettingTab(this.app, this));

		this.registerEvent(
			this.app.metadataCache.on("resolved", async () => {
				// If the dataview plugin was not loaded when this inited,
				// let's create the initial search!
				if (!this.inited) {
					this.exporter.searchAll();
					this.inited = true;
				} else {
					// Check files
					// This seems to run on index updates.
				}
			})
		);
	}

	onunload() {
		// Do cleanup the sidebar.
		this.exporter.display.clean()
	}

	async loadSettings() {
		const storedData = await this.loadData()
		if (storedData) {
			// Backward Compatibility: if it's not an array, it's the old BulkExportSettings.
			if (!(storedData.items instanceof Array)) {
				this.settings = {
					selected: 0,
					items: Object.assign(
						{},
						DEFAULT_SETTINGS,
						storedData
					)
				}
			}
			else {
				this.settings = Object.assign({items: [], selected: 0}, storedData);
				if (!this.settings.items.length) {
					this.settings.items.push(Object.assign({}, DEFAULT_SETTINGS))
				}
			}
		} else {
			this.settings = {
				items: [
					Object.assign({}, DEFAULT_SETTINGS)], selected: 0
			}
		}
		console.warn(this.settings)
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async activateView() {
		this.app.workspace.detachLeavesOfType(META_DATA_VIEW_TYPE);

		await this.app.workspace.getLeaf(false).setViewState({
			type: META_DATA_VIEW_TYPE,
			active: true,
		});

		this.app.workspace.revealLeaf(
			this.app.workspace.getLeavesOfType(META_DATA_VIEW_TYPE)[0]
		);
	}
}

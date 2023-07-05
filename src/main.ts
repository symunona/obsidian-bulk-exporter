import { Plugin } from "obsidian";
import { BulkExporterView, META_DATA_VIEW_TYPE } from "src/view";

import { getAPI as getDataViewApi } from "obsidian-dataview";
import { Exporter } from "./export/exporter";
import { BulkExportSettings } from "./models/bulk-export-settings";
import { OutputSettingTab } from "./settings/export-settings-tab";

export const DEFAULT_SETTINGS: BulkExportSettings = {
	outputFolder: "output",
	exportQuery: "blog",
	emptyTargetFolder: false,
	assetPath: "assets",
	outputFormat: '${blog}/${slug}',
	lastExport: {},
};

export default class BulkExporterPlugin extends Plugin {
	settings: BulkExportSettings;

	dataViewApi = getDataViewApi();
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
				this.exporter.searchAndExport();
				this.activateView();
			},
		});

		this.addSettingTab(new OutputSettingTab(this.app, this));

		this.registerEvent(
			this.app.metadataCache.on("resolved", async () => {
				// If the dataview plugin was not loaded when this inited,
				// let's create the initial search!
				if (!this.inited) {
					this.exporter.searchFilesToExport();
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
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
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

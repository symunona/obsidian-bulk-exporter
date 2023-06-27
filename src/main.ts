import {Plugin } from "obsidian";
import { BulkExporterView, META_DATA_VIEW_TYPE } from "src/view";

import { getAPI as getDataViewApi } from "obsidian-dataview";
import { FolderMeta } from "./utils/folder-meta";
import { Exporter } from "./export/exporter";
import { BulkExportSettings } from "./utils/bulk-export-settings";
import { OutputSettingTab } from "./settings/export-settings-tab";

const DEFAULT_SETTINGS: BulkExportSettings = {
	outputFolder: "output",
	exportQuery: "blog",
	slug: '',
	smartSlug: true,
	groupBy: '',
	emptyTargetFolder: false,
	assetPath: 'assets',
	autoImportFromWeb: false
};

export default class BulkExporterPlugin extends Plugin {
	settings: BulkExportSettings;

	folderMeta: FolderMeta;

	dataViewApi = getDataViewApi();
	exporter: Exporter;

	async onload() {
		await this.loadSettings();
		this.exporter = new Exporter(this)

		this.registerView(
			META_DATA_VIEW_TYPE,
			(leaf) => new BulkExporterView(leaf, this)
		);

		// This creates an icon in the left ribbon.
		this.addRibbonIcon(
			"folder-input",
			"Bulk Exporter",
			(evt: MouseEvent) => {
				this.exporter.searchAndExport()
			}
		);

		this.addRibbonIcon(
			"view",
			"Bulk Exporter Preview",
			(evt: MouseEvent) => {
				this.activateView()
			}
		);

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: "bulk-export",
			name: "Bulk Export",
			callback: () => {
				this.exporter.searchAndExport()
				this.activateView()
			},
		});

		this.addSettingTab(new OutputSettingTab(this.app, this));

		this.registerEvent(
			this.app.metadataCache.on("resolved", async () => {
				// console.warn("dataview ready!");
				// this.searchThenExportFiles()
				// TODO: if the dataview plugin was not loaded when this inited,
				// let's create the initial search!
			})
		);
	}

	onunload() { }

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


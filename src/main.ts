import {
	App,
	Plugin,
	PluginSettingTab,
	Setting,
} from "obsidian";
import { BulkExporterView, META_DATA_VIEW_TYPE } from "src/view";

import { getAPI as getDataViewApi } from "obsidian-dataview";
import { FolderMeta } from "./utils/folder-meta";
import { DEFAULT_EXPORT_PATH, Exporter, getSingletonExporter } from "./export/exporter";
import { BulkExportSettings } from "./utils/bulk-export-settings";

const DEFAULT_SETTINGS: BulkExportSettings = {
	outputFolder: "output",
	exportQuery: "blog",
	slug: '',
	smartSlug: true,
	groupBy: '',
	emptyTargetFolder: false
};

export default class BulkExporterPlugin extends Plugin {
	settings: BulkExportSettings;

	folderMeta: FolderMeta;

	dataViewApi = getDataViewApi();
	exporter: Exporter;

	async onload() {
		// const { vault } = this.app;

		await this.loadSettings();
		this.exporter = getSingletonExporter(this)

		this.registerView(
			META_DATA_VIEW_TYPE,
			(leaf) => new BulkExporterView(leaf)
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
				console.warn("dataview ready!");
				// this.searchThenExportFiles()
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


class OutputSettingTab extends PluginSettingTab {
	plugin: BulkExporterPlugin;

	constructor(app: App, plugin: BulkExporterPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();
		containerEl.createEl("h2", { text: "Bulk Export Settings" });
		containerEl.createEl("div", { text: "Export a certain subset of your notes, based on whether they match a query filter." });

		new Setting(containerEl)
			.setName("Export Folder")
			.setDesc("Which folder do you want to export converted markdown files with their assets?")
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_EXPORT_PATH)
					.setValue(this.plugin.settings.outputFolder)
					.onChange(async (value) => {
						this.plugin.settings.outputFolder = value;
						await this.plugin.saveSettings();
					})
			);


		new Setting(containerEl)
			.setName("Filter Query")
			.setDesc("DataView style query")
			.addText((text) =>
				text
					.setPlaceholder("default")
					.setValue(this.plugin.settings.exportQuery)
					.onChange(async (value) => {
						this.plugin.settings.exportQuery = value;
						await this.plugin.saveSettings();
					})
			);
		new Setting(containerEl)
			.setName("Group By Folder")
			.setDesc("if you specify a value, the exporter will create sub-directories based on this field")
			.addText((text) =>
				text
					.setPlaceholder("any metadata field")
					.setValue(this.plugin.settings.groupBy)
					.onChange(async (value) => {
						this.plugin.settings.groupBy = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Metadata To Filename")
			.setDesc("if you specify a value, the exporter will rename your file to this front-matter value - this is useful e.g. if you are using a static site generator, and want to use a field as the filename to make it more web-accessible. (If it does not have a value, it falls back to the original filename) - WARN: if multiple files have the same property values the last one will be written!")
			.addText((text) =>
				text
					.setPlaceholder("any metadata field")
					.setValue(this.plugin.settings.slug)
					.onChange(async (value) => {
						this.plugin.settings.slug = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Smart Slug")
			.setDesc("translate page titles to web-friendly, escaped values like: 'Some Note Title' => 'some-note-title'")
			.addToggle((text) =>
				text
					.setValue(this.plugin.settings.smartSlug)
					.onChange(async (value) => {
						this.plugin.settings.smartSlug = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Empty target folder on each export")
			.setDesc("if true, contents will be erased every time!")
			.addToggle((text) =>
				text
					.setValue(this.plugin.settings.emptyTargetFolder)
					.onChange(async (value) => {
						this.plugin.settings.emptyTargetFolder = value;
						await this.plugin.saveSettings();
					})
			);

	}
}

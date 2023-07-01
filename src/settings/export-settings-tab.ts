import { App, PluginSettingTab, Setting } from "obsidian";

import BulkExporterPlugin, { DEFAULT_SETTINGS } from "src/main";

export class OutputSettingTab extends PluginSettingTab {
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
					.setPlaceholder(DEFAULT_SETTINGS.outputFolder)
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
			.setDesc("if true, contents will be erased every time. This can be good for getting rid of deleted blog posts, as by default the plugin does not track the ones that were deleted.")
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

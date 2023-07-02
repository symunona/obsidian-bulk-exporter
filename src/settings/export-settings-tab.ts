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

		const linkToDocs = createEl('a', {href: 'https://github.com/symunona/obsidian-bulk-exporter', text: 'Docs'})
		const filenameInfo = createSpan({text: 'You can define the output path with the following JS expression. Example: ${blog}/${created.date} - see '})
		filenameInfo.append(linkToDocs)
		const fragment = document.createDocumentFragment()
		fragment.append(filenameInfo)
		new Setting(containerEl)
			.setName("Output Filename and Path")
			.setDesc(fragment)
			.addText((text) =>
				text
					.setPlaceholder("${blog}/${slug}")
					.setValue(this.plugin.settings.outputFormat)
					.onChange(async (value) => {
						this.plugin.settings.outputFormat = value;
						// TODO: validate! Can I validate?
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

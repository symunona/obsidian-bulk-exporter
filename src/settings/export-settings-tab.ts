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

		const linkToIssues = createEl('a', {href: 'https://github.com/symunona/obsidian-bulk-exporter/issues', text: 'Github Issue Tracker'})
		const genericInfo = createSpan({text: "Export a certain subset of your notes, based on whether they match a DataView query. Bug reports and Feature Requests are welcome at "})
		genericInfo.append(linkToIssues)
		const genericFragment = document.createDocumentFragment()
		genericFragment.append(genericInfo)

		new Setting(containerEl)
			.setName("Bulk Exporter")
			.setDesc(genericFragment)

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

		const linkToDataViewDocs = createEl('a', {href: 'https://blacksmithgu.github.io/obsidian-dataview/queries/data-commands/', text: 'DataView Language Specs'})
		const filterInfo = createSpan({text: `Use a DataView style query for matching your metadata. Example: "blog='personal'". For more, see `})
		filterInfo.append(linkToDataViewDocs)
		const filterInfoFragment = document.createDocumentFragment()
		filterInfoFragment.append(filterInfo)

		new Setting(containerEl)
			.setName("Filter Query")
			.setDesc(filterInfoFragment)
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
		const filenameInfo = createSpan({text: 'You can define the output path with the following JS expression. Example: "${blog}/${created.date}-${slug}" - see '})
		filenameInfo.append(linkToDocs)
		const exportFileNameInfoFragment = document.createDocumentFragment()
		exportFileNameInfoFragment.append(filenameInfo)
		new Setting(containerEl)
			.setName("Output Filename and Path")
			.setDesc(exportFileNameInfoFragment)
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

		new Setting(containerEl)
			.setName("Run Script After Export")
			.setDesc("Place here anything you want to run after the export is done. Uses child_process.spawn.")
			.addText((text) =>
				text
					.setPlaceholder("shell script path")
					.setValue(this.plugin.settings.shell)
					.onChange(async (value) => {
						this.plugin.settings.shell = value;
						// TODO: validate! Can I validate?
						await this.plugin.saveSettings();
					})
			);

	}
}

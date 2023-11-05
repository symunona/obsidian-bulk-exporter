import { App, PluginSettingTab, Setting } from "obsidian";

import BulkExporterPlugin from "src/main";
import { BulkExportSettings, DEFAULT_SETTINGS } from "src/models/bulk-export-settings";
import { ConfirmModal } from "src/ui/confirm-modal";

export class OutputSettingTab extends PluginSettingTab {
	plugin: BulkExporterPlugin;

	currentSetting: BulkExportSettings
	header: HTMLDivElement;
	tabs: HTMLDivElement;
	buttons: HTMLButtonElement[];


	constructor(app: App, plugin: BulkExporterPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();
		containerEl.classList.add('bulk-export-settings')

		const linkToIssues = createEl('a', { href: 'https://github.com/symunona/obsidian-bulk-exporter/issues', text: 'Github Issue Tracker' })
		const genericInfo = createSpan({ text: "Export a certain subset of your notes, based on whether they match a DataView query. Bug reports and Feature Requests are welcome at " })
		genericInfo.append(linkToIssues)
		const genericFragment = document.createDocumentFragment()
		genericFragment.append(genericInfo)

		new Setting(containerEl)
			.setName("Bulk Exporter")
			.setDesc(genericFragment)


		this.header = containerEl.createDiv({ cls: 'bulk-export-settings-header' })
		this.tabs = containerEl.createDiv({ cls: 'bulk-export-settings-tabs' })

		this.buttons = this.plugin.settings.items.map((setting, index) =>
			this.createButton(setting)
		)
		this.buttons.map((e) => this.header.append(e))

		const addBtn = this.header.createEl('button', { cls: 'tab-header add-element', text: '+' })
		addBtn.addEventListener('click', () => {
			const newSetting = Object.assign({}, DEFAULT_SETTINGS, this.plugin.settings.items[this.plugin.settings.selected])
			newSetting.name += ' Copy'
			newSetting.groupOpenMap = {}
			newSetting.lastExport = {}
			this.plugin.settings.items.push(newSetting)
			const newBtn = this.createButton(newSetting)
			this.buttons.push(newBtn)
			addBtn.parentNode?.insertBefore(newBtn, addBtn)
			this.selectSetting(newSetting)
		})
		this.selectSetting()
	}

	selectSetting(setting?: BulkExportSettings) {
		if (setting) {
			this.renderSettingsPage(this.tabs, setting)
		} else if (this.plugin.settings.items.length === 0) {
			// Create default
			this.plugin.settings.items.push(Object.assign({}, DEFAULT_SETTINGS))
			this.renderSettingsPage(this.tabs, this.plugin.settings.items[0])
		} else if (this.plugin.settings.items.length === 1) {
			this.renderSettingsPage(this.tabs, this.plugin.settings.items[0])
		} else if (this.plugin.settings.items.length > this.plugin.settings.selected) {
			this.renderSettingsPage(this.tabs, this.plugin.settings.items[this.plugin.settings.selected])
		} else {
			this.renderSettingsPage(this.tabs, this.plugin.settings.items[0])
		}
	}

	createButton(setting: BulkExportSettings) {
		const button = createEl('button', { cls: 'tab-header', text: setting.name || 'no-name' })
		button.addEventListener('click', async () => {
			this.plugin.settings.selected = this.plugin.settings.items.indexOf(setting)
			this.selectSetting(setting)
			await this.plugin.saveSettingsWithRefresh();
		})
		return button
	}

	renderSettingsPage(containerEl: HTMLElement, settings: BulkExportSettings) {
		containerEl.empty();

		this.plugin.settings.selected = this.plugin.settings.items.indexOf(settings)
		this.buttons.forEach((b) => b.classList.remove('active'))
		this.buttons[this.plugin.settings.selected].classList.add('active')

		new Setting(containerEl)
			.setName("Name of the export set")
			.addText((text) =>
				text
					.setPlaceholder('default')
					.setValue(settings.name)
					.onChange(async (value) => {
						settings.name = value
						this.buttons[this.plugin.settings.selected].setText(settings.name || '-- no name --')
						await this.plugin.saveSettingsWithRefresh();
					})
			);

		new Setting(containerEl)
			.setName("Export Target Folder")
			.setDesc("Which folder do you want to export converted markdown files with their assets?")
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS.outputFolder)
					.setValue(settings.outputFolder)
					.onChange(async (value) => {
						settings.outputFolder = value;
						await this.plugin.saveSettingsWithRefresh();
					})
			);

		const linkToDataViewDocs = createEl('a', { href: 'https://blacksmithgu.github.io/obsidian-dataview/queries/data-commands/', text: 'DataView Language Specs' })
		const filterInfo = createSpan({ text: `Use a DataView style query for matching your metadata. Example: "blog='personal'". For more, see ` })
		filterInfo.append(linkToDataViewDocs)
		const filterInfoFragment = document.createDocumentFragment()
		filterInfoFragment.append(filterInfo)

		new Setting(containerEl)
			.setName("Filter Query")
			.setDesc(filterInfoFragment)
			.addText((text) =>
				text
					.setPlaceholder("default")
					.setValue(settings.exportQuery)
					.onChange(async (value) => {
						settings.exportQuery = value;
						await this.plugin.saveSettingsWithRefresh();
					})
			);


		const linkToDocs = createEl('a', { href: 'https://github.com/symunona/obsidian-bulk-exporter', text: 'Docs' })
		const filenameInfo = createSpan({ text: 'You can define the output path with the following JS expression. Example: "${blog}/${created.date}-${slug}" - see ' })
		filenameInfo.append(linkToDocs)
		const exportFileNameInfoFragment = document.createDocumentFragment()
		exportFileNameInfoFragment.append(filenameInfo)
		new Setting(containerEl)
			.setName("Output Filename and Path")
			.setDesc(exportFileNameInfoFragment)
			.addText((text) =>
				text
					.setPlaceholder("${blog}/${slug}")
					.setValue(settings.outputFormat)
					.onChange(async (value) => {
						settings.outputFormat = value;
						// TODO: validate! Can I validate?
						await this.plugin.saveSettingsWithRefresh();
					})
			);


		new Setting(containerEl)
			.setName("Empty target folder on each export")
			.setDesc("if true, the target folder contents will be erased every time. This can be good for getting rid of deleted blog posts, as by default the plugin does not track the ones that were deleted. Note that the ROOT of the folder is NOT deleted if everything is ordered in folders, so if you want to have your blogs in a monorepo, you can do so.")
			.addToggle((text) =>
				text
					.setValue(settings.emptyTargetFolder)
					.onChange(async (value) => {
						settings.emptyTargetFolder = value;
						await this.plugin.saveSettingsWithRefresh();
					})
			);


		containerEl.createEl('h2', { text: 'Preview' })

		new Setting(containerEl)
			.setName("Published Field / Drafts")
			.setDesc("If provided, files that DO NOT have this field in their front matter will be shown on the file tree and the export preview, but will not get actually exported.")
			.addText((text) =>
				text
					.setPlaceholder("key of the meta value, like draft")
					.setValue(settings.isPublishedField)
					.onChange(async (value) => {
						settings.isPublishedField = value.trim();
						// TODO: validate! Can I validate?
						await this.plugin.saveSettingsWithRefresh();
					})
			);


		new Setting(containerEl)
			.setName("Visible Columns")
			.setDesc("Same as clicking on the eye icon")
			.addText((text) =>
				text
					.setPlaceholder("*")
					.setValue(settings.headerFieldsToShow.join(', '))
					.onChange(async (value) => {
						settings.headerFieldsToShow = value.split(',').map(v=>v.trim()).filter(v=>v);
						await this.plugin.saveSettingsWithRefresh();
					})
			);



		containerEl.createEl('h2', { text: 'Attachments and Links' })


		new Setting(containerEl)
			.setName("Flatten attachments to File Root")
			.setDesc("if true, all attachments will go to the file root's asset folder.")
			.addToggle((text) =>
				text
					.setValue(settings.absoluteAssets)
					.onChange(async (value) => {
						settings.absoluteAssets = value;
						await this.plugin.saveSettingsWithRefresh();
					})
			);


		new Setting(containerEl)
			.setName("Attachment / Asset folder name")
			.setDesc("Relative to the file's export path, or absolute, to the file's Attachment and link root above.")
			.addText((text) =>
				text
					.setPlaceholder("assets")
					.setValue(settings.assetPath)
					.onChange(async (value) => {
						settings.assetPath = value;
						// TODO: validate! Can I validate?
						await this.plugin.saveSettingsWithRefresh();
					})
			);



		containerEl.createEl('h2', { text: '' })

		new Setting(containerEl)
			.setName("Run Script After Export")
			.setDesc("Place here anything you want to run after the export is done. Uses child_process.spawn.")
			.addText((text) =>
				text
					.setPlaceholder("shell script path")
					.setValue(settings.shell)
					.onChange(async (value) => {
						settings.shell = value;
						// TODO: validate! Can I validate?
						await this.plugin.saveSettingsWithRefresh();
					})
			);


		if (this.plugin.settings.items.length > 1) {
			containerEl.createEl('hr')
			const deleteButton = containerEl.createEl('button', { text: 'Delete this Export Settings', cls: 'danger' })
			deleteButton.addEventListener('click', () => {
				new ConfirmModal(this.plugin.app, {
					okClass: 'danger',
					okText: 'Delete',
					okCallback: () => {
						this.plugin.settings.items.splice(this.plugin.settings.selected, 1)
						this.plugin.saveSettingsWithRefresh()
						this.buttons[this.plugin.settings.selected].remove()
						this.selectSetting()
					}
				}).open()
			})
		}
	}
}

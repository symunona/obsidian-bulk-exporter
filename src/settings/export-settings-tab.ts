import { App, Notice, PluginSettingTab, Setting, ToggleComponent } from "obsidian";

import BulkExporterPlugin from "src/main";
import {
	BulkExportSettings,
	DEFAULT_SETTINGS,
} from "src/models/bulk-export-settings";
import { ConfirmModal } from "src/ui/confirm-modal";
import { ImportSettingsModal } from "src/ui/import-settings-modal";
import { outputFormatWarning } from "src/utils/indexing/create-path-map";
import {
	downloadSettings,
	extendSettings,
	overwriteSettings,
	pickSettingsFile,
} from "./settings-transfer";

export class OutputSettingTab extends PluginSettingTab {
	plugin: BulkExporterPlugin;

	currentSetting: BulkExportSettings;
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
		containerEl.classList.add("bulk-export-settings");

		const linkToIssues = createEl("a", {
			href: "https://github.com/symunona/obsidian-bulk-exporter/issues",
			text: "GitHub issue tracker",
		});
		const genericInfo = createSpan({
			text: "Export a certain subset of your notes, based on whether they match a DataView query. Bug reports and Feature Requests are welcome at ",
		});
		genericInfo.append(linkToIssues);
		const genericFragment = createFragment();
		genericFragment.append(genericInfo);

		new Setting(containerEl)
			.setName("Bulk exporter")
			.setDesc(genericFragment);

		new Setting(containerEl)
			.setName("Export / import settings")
			.setDesc("Want to transfer to another vault?")
			.addButton((button) =>
				button.setButtonText("Export").onClick(() => {
					downloadSettings(this.plugin);
				})
			)
			.addButton((button) =>
				button.setButtonText("Import").onClick(() => {
					pickSettingsFile((imported, fileName) => {
						new ImportSettingsModal(this.plugin.app, {
							fileName,
							imported,
							existingCount: this.plugin.settings.items.length,
							overwriteCallback: () => {
								overwriteSettings(this.plugin, imported);
								void this.applyImport(imported.items.length);
							},
							extendCallback: () => {
								extendSettings(this.plugin, imported);
								void this.applyImport(imported.items.length);
							},
						}).open();
					});
				})
			);

		this.header = containerEl.createDiv({
			cls: "bulk-export-settings-header",
		});
		this.tabs = containerEl.createDiv({ cls: "bulk-export-settings-tabs" });

		this.buttons = this.plugin.settings.items.map((setting, index) =>
			this.createButton(setting)
		);
		this.buttons.map((e) => this.header.append(e));

		const addBtn = this.header.createEl("button", {
			cls: "tab-header add-element",
			text: "+",
		});
		addBtn.addEventListener("click", () => {
			const newSetting = Object.assign(
				{},
				DEFAULT_SETTINGS,
				this.plugin.settings.items[this.plugin.settings.selected]
			);
			newSetting.name += " Copy";
			newSetting.groupOpenMap = {};
			newSetting.lastExport = {};
			this.plugin.settings.items.push(newSetting);
			const newBtn = this.createButton(newSetting);
			this.buttons.push(newBtn);
			addBtn.parentNode?.insertBefore(newBtn, addBtn);
			this.selectSetting(newSetting);
		});
		this.selectSetting();
	}

	/**
	 * Persist whatever the import just did to the settings, and rebuild the
	 * whole tab, as the tab buttons changed.
	 */
	async applyImport(importedCount: number) {
		await this.plugin.saveSettingsWithRefresh();
		this.display();
		new Notice(
			`Imported ${importedCount} export setting${
				importedCount > 1 ? "s" : ""
			}`
		);
	}

	selectSetting(setting?: BulkExportSettings) {
		if (setting) {
			this.renderSettingsPage(this.tabs, setting);
		} else if (this.plugin.settings.items.length === 0) {
			// Create default
			this.plugin.settings.items.push(
				Object.assign({}, DEFAULT_SETTINGS)
			);
			this.renderSettingsPage(this.tabs, this.plugin.settings.items[0]);
		} else if (this.plugin.settings.items.length === 1) {
			this.renderSettingsPage(this.tabs, this.plugin.settings.items[0]);
		} else if (
			this.plugin.settings.items.length > this.plugin.settings.selected
		) {
			this.renderSettingsPage(
				this.tabs,
				this.plugin.settings.items[this.plugin.settings.selected]
			);
		} else {
			this.renderSettingsPage(this.tabs, this.plugin.settings.items[0]);
		}
	}

	createButton(setting: BulkExportSettings) {
		const button = createEl("button", {
			cls: "tab-header",
			text: setting.name || "no-name",
		});
		button.addEventListener("click", () => {
			this.plugin.settings.selected =
				this.plugin.settings.items.indexOf(setting);
			this.selectSetting(setting);
			void this.plugin.saveSettingsWithRefresh();
		});
		return button;
	}

	renderSettingsPage(containerEl: HTMLElement, settings: BulkExportSettings) {
		containerEl.empty();

		this.plugin.settings.selected =
			this.plugin.settings.items.indexOf(settings);
		this.buttons.forEach((b) => b.classList.remove("active"));
		this.buttons[this.plugin.settings.selected].classList.add("active");

		new Setting(containerEl)
			.setName("Name of the export set")
			.addText((text) =>
				text
					.setPlaceholder("Default")
					.setValue(settings.name)
					.onChange(async (value) => {
						settings.name = value;
						this.buttons[this.plugin.settings.selected].setText(
							settings.name || "-- no name --"
						);
						await this.plugin.saveSettingsWithRefresh();
					})
			);

		new Setting(containerEl)
			.setName("Export target folder")
			.setDesc(
				"Which folder do you want to export converted Markdown files with their assets?"
			)
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS.outputFolder)
					.setValue(settings.outputFolder)
					.onChange(async (value) => {
						settings.outputFolder = value;
						await this.plugin.saveSettingsWithRefresh();
					})
			);

		const linkToDataViewDocs = createEl("a", {
			href: "https://blacksmithgu.github.io/obsidian-dataview/queries/data-commands/",
			text: "Dataview language specs",
		});
		const linkToDocs1 = createEl("a", {
			href: "https://github.com/symunona/obsidian-bulk-exporter",
			text: "Docs",
		});

		const filterInfo = createSpan({
			text: `Use a DataView style query for matching your metadata. Example: 'blog="personal"'. For more, see `,
		});
		filterInfo.append(linkToDataViewDocs);
		filterInfo.append(" and ");
		filterInfo.append(linkToDocs1);
		const filterInfoFragment = createFragment();
		filterInfoFragment.append(filterInfo);

		new Setting(containerEl)
			.setName("Filter query")
			.setDesc(filterInfoFragment)
			.addTextArea((text) =>
				text
					.setPlaceholder("Default")
					.setValue(settings.exportQuery)
					.onChange(async (value) => {
						settings.exportQuery = value;
						await this.plugin.saveSettingsWithRefresh();
					})
			);


		const linkToDocs2 = createEl("a", {
			href: "https://github.com/symunona/obsidian-bulk-exporter",
			text: "Docs",
		});

		const filenameInfo = createSpan({
			text: 'You can define the output path with the following JS expression. Example: "${blog}/${created.date}-${slug}" - see ',
		});
		filenameInfo.append(linkToDocs2);
		const exportFileNameInfoFragment = createFragment();
		exportFileNameInfoFragment.append(filenameInfo);
		const outputFormatSetting = new Setting(containerEl)
			.setName("Output filename and path")
			.setDesc(exportFileNameInfoFragment)
			.addText((text) =>
				text
					.setPlaceholder("${blog}/${slug}")
					.setValue(settings.outputFormat)
					.onChange(async (value) => {
						settings.outputFormat = value;
						showOutputFormatWarning(value);
						await this.plugin.saveSettingsWithRefresh();
					})
			);

		// A bad output format used to be completely silent: `food/` exported
		// exactly nothing, and a format with no ${...} in it wrote every note
		// over the same single file. Say so, right where it is typed, and keep
		// saying it - the warning is rendered on open too, not just on change.
		// @see https://github.com/symunona/obsidian-bulk-exporter/issues/18
		const outputFormatWarningEl = outputFormatSetting.descEl.createDiv({
			// `mod-warning` is obsidian's own "this is a warning" text colour,
			// so this needs no stylesheet of its own.
			cls: "bulk-export-settings-warning mod-warning",
		});
		const showOutputFormatWarning = (value: string) => {
			const warning = outputFormatWarning(value);
			outputFormatWarningEl.setText(warning || "");
			outputFormatWarningEl.toggle(Boolean(warning));
		};
		showOutputFormatWarning(settings.outputFormat || "");

		new Setting(containerEl)
			.setName("Empty target folder on each export")
			.setDesc(
				"If true, the target folder contents will be erased every time. This can be good for getting rid of deleted blog posts, as by default the plugin does not track the ones that were deleted. Note that the root of the folder is not deleted if everything is ordered in folders, so if you want to have your blogs in a monorepo, you can do so."
			)
			.addToggle((text) =>
				text
					.setValue(settings.emptyTargetFolder)
					.onChange(async (value) => {
						settings.emptyTargetFolder = value;
						if (value) {
							ignorePatterns.settingEl.show();
						} else {
							ignorePatterns.settingEl.hide();
						}
						await this.plugin.saveSettingsWithRefresh();
					})
			);

		const linkToGlobDocs = createEl("a", {
			href: "https://globster.xyz/",
			text: "Glob pattern matcher",
		});
		const ignoreInfo = createSpan({
			text: `Files in the root folder matching this pattern will NOT be deleted. E.g. ignore 'engine' and 'rest' folders, just type in {engine,rest} - `,
		});
		ignoreInfo.append(linkToGlobDocs);
		const ignoreMatcherElement = createFragment();
		ignoreMatcherElement.append(ignoreInfo);

		const ignorePatterns = new Setting(containerEl)
			.setName("Ignore delete glob pattern")
			.setDesc(ignoreMatcherElement)
			.addText((text) =>
				text
					.setPlaceholder("*")
					.setValue(settings.emptyTargetFolderIgnore)
					.onChange(async (value) => {
						settings.emptyTargetFolderIgnore = value;
						await this.plugin.saveSettingsWithRefresh();
					})
			);
		if (!settings.emptyTargetFolder) {
			ignorePatterns.settingEl.hide();
		}

		new Setting(containerEl).setName("Preview").setHeading();

		new Setting(containerEl)
			.setName("Published field / drafts")
			.setDesc(
				"If provided, files that do not have this field in their front matter will be shown on the file tree and the export preview, but will not get actually exported."
			)
			.addText((text) =>
				text
					.setPlaceholder("Key of the meta value, like draft")
					.setValue(settings.isPublishedField)
					.onChange(async (value) => {
						settings.isPublishedField = value.trim();
						// TODO: validate! Can I validate?
						await this.plugin.saveSettingsWithRefresh();
					})
			);

		new Setting(containerEl)
			.setName("Visible columns")
			.setDesc("Same as clicking on the eye icon")
			.addText((text) =>
				text
					.setPlaceholder("*")
					.setValue(settings.headerFieldsToShow.join(", "))
					.onChange(async (value) => {
						settings.headerFieldsToShow = value
							.split(",")
							.map((v) => v.trim())
							.filter((v) => v);
						await this.plugin.saveSettingsWithRefresh();
					})
			);

		new Setting(containerEl).setName("Links").setHeading();

		new Setting(containerEl)
			.setName("Normalize spaces in links")
			.setDesc(
				"If true, spaces in local links will be URL escaped (e.g. %20 for spaces)"
			)
			.addToggle((text) =>
				text
					.setValue(settings.normalizeSpacesInLinks)
					.onChange(async (value) => {
						settings.normalizeSpacesInLinks = value;
						await this.plugin.saveSettingsWithRefresh();
					})
			);

		new Setting(containerEl)
			.setName("Keep links not found")
			.setDesc(
				"Instead of replacing them with plain text, just leave them as is."
			)
			.addToggle((text) =>
				text
					.setValue(settings.keepLinksNotFound)
					.onChange(async (value) => {
						settings.keepLinksNotFound = value;
						await this.plugin.saveSettingsWithRefresh();
					})
			);

		new Setting(containerEl)
			.setName("Keep links not exported")
			.setDesc("For e.g. You want to export them in another batch.")
			.addToggle((text) =>
				text
					.setValue(settings.keepLinksPrivate)
					.onChange(async (value) => {
						settings.keepLinksPrivate = value;
						await this.plugin.saveSettingsWithRefresh();
					})
			);

		new Setting(containerEl)
			.setName("Convert wiki links to '[]()' styled standard links")
			.setDesc(
				"If true, all links will be the standard unified format."
			)
			.addToggle((text) =>{
				text
					.setValue(!settings.preserveWikiLinks)
					.onChange(async (value) => {
						settings.preserveWikiLinks = !value;
						keepAsIsDOM.setDisabled(!settings.preserveWikiLinks)
						if (!settings.preserveWikiLinks){
							keepAsIsToggle.setValue(false)
						}
						await this.plugin.saveSettingsWithRefresh();
					})
				}
			)

		let keepAsIsToggle: ToggleComponent
		const keepAsIsDOM = new Setting(containerEl)
			.setName("Preserve wiki links as is")
			.setDesc(
				`Do not replace with new exported folder paths, keep them untouched.
				Needs "convert wiki links" toggle to be off.
				(Use this for e.g. Quartz exports)`
			)
		keepAsIsDOM.addToggle((text) =>
			keepAsIsToggle = text
					.setValue(settings.keepWikiLinksAsIs)
					.onChange(async (value) => {
						settings.keepWikiLinksAsIs = value;
						await this.plugin.saveSettingsWithRefresh();
					})
			)
			.setDisabled(!settings.preserveWikiLinks)

		new Setting(containerEl).setName("Attachments").setHeading();

		new Setting(containerEl)
			.setName("Flatten attachments to file root")
			.setDesc(
				"If true, all attachments will go to the file root's asset folder."
			)
			.addToggle((text) =>
				text
					.setValue(settings.absoluteAssets)
					.onChange(async (value) => {
						settings.absoluteAssets = value;
						await this.plugin.saveSettingsWithRefresh();
					})
			);

		new Setting(containerEl)
			.setName("Keep original attachment file names")
			.setDesc(
				"By default the plugin uses MD5 hashes in the file names to make them unique. If you want to keep the original file names, set this to true. \nWarning: if you have the same file name in different folders, they will overwrite each other, randomly, you have to make sure your file names are unique!"
			)
			.addToggle((text) =>
				text
					.setValue(settings.keepOriginalAttachmentFileNames)
					.onChange(async (value) => {
						settings.keepOriginalAttachmentFileNames = value;
						await this.plugin.saveSettingsWithRefresh();
					})
			);

		new Setting(containerEl)
			.setName("Attachment / asset folder name")
			.setDesc(
				"Relative to the file's export path, or absolute, to the file's attachment and link root above."
			)
			.addText((text) =>
				text
					.setPlaceholder("Assets")
					.setValue(settings.assetPath)
					.onChange(async (value) => {
						settings.assetPath = value;
						// TODO: validate! Can I validate?
						await this.plugin.saveSettingsWithRefresh();
					})
			);

		new Setting(containerEl).setName("Other").setHeading();

		new Setting(containerEl)
			.setName("Run script after export")
			.setDesc(
				"Place here anything you want to run after the export is done. Uses child_process.spawn."
			)
			.addText((text) =>
				text
					.setPlaceholder("Shell script path")
					.setValue(settings.shell)
					.onChange(async (value) => {
						settings.shell = value;
						// TODO: validate! Can I validate?
						await this.plugin.saveSettingsWithRefresh();
					})
			);

		if (this.plugin.settings.items.length > 1) {
			containerEl.createEl("hr");
			const deleteButton = containerEl.createEl("button", {
				text: "Delete this export settings",
				cls: "danger",
			});
			deleteButton.addEventListener("click", () => {
				new ConfirmModal(this.plugin.app, {
					okClass: "danger",
					okText: "Delete",
					okCallback: () => {
						this.plugin.settings.items.splice(
							this.plugin.settings.selected,
							1
						);
						void this.plugin.saveSettingsWithRefresh();
						this.buttons[this.plugin.settings.selected].remove();
						this.selectSetting();
					},
				}).open();
			});
		}
	}
}

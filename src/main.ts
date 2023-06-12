import {
	App,
	Editor,
	MarkdownView,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TAbstractFile,
} from "obsidian";
import { BulkExporterView, META_DATA_VIEW_TYPE } from "src/view";

import { getAPI as getDataViewApi } from "obsidian-dataview";
import { FolderMeta } from "./utils/folder-meta";
import { DEFAULT_EXPORT_PATH } from "./export/exporter";
import { FileListItemWrapper } from "./utils/file-list-indicator";


// Remember to rename these classes and interfaces!

interface MetaDataViewSettings {
	slug: string;
	smartSlug: boolean;
	groupBy: string;
	outputFolder: string;
	exportQuery: string;
	emptyTargetFolder: boolean
}

const DEFAULT_SETTINGS: MetaDataViewSettings = {
	outputFolder: "output",
	exportQuery: "blog",
	slug: '',
	smartSlug: true,
	groupBy: '',
	emptyTargetFolder: false
};

export default class BulkExporterPlugin extends Plugin {
	settings: MetaDataViewSettings;

	// metaFolderCache: { [filePath: string]: any } = {};
	// metaFolderAttributeCache: { [folderPath: string]: any } = {};
	folderMeta: FolderMeta;

	dataViewApi = getDataViewApi();

	async onload() {
		// const { vault } = this.app;

		await this.loadSettings();
		console.warn('initin file list item wrapper')

		this.registerView(
			META_DATA_VIEW_TYPE,
			(leaf) => new BulkExporterView(leaf)
		);

		// This creates an icon in the left ribbon.
		const ribbonIconEl = this.addRibbonIcon(
			"file-spreadsheet",
			"Bulk Exporter",
			(evt: MouseEvent) => {
				// Called when the user clicks the icon.
				// new Notice("This is a notice!");
				this.activateView();
				// console.warn("this updated");
			}
		);
		// Perform additional things with the ribbon
		ribbonIconEl.addClass("my-plugin-ribbon-class");

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		// const statusBarItemEl = this.addStatusBarItem();
		// statusBarItemEl.setText('Status Bar Text');

		// This adds a simple command that can be triggered anywhere
		// this.addCommand({
		// 	id: "open-sample-modal-simple",
		// 	name: "Open sample modal (simple)",
		// 	callback: () => {
		// 		new SampleModal(this.app).open();
		// 	},
		// });
		// This adds an editor command that can perform some operation on the current editor instance
		// this.addCommand({
		// 	id: "sample-editor-command",
		// 	name: "Sample editor command",
		// 	editorCallback: (editor: Editor, view: MarkdownView) => {
		// 		console.log(editor.getSelection());
		// 		editor.replaceSelection("Sample Editor Command");
		// 	},
		// });
		// This adds a complex command that can check whether the current state of the app allows execution of the command
		this.addCommand({
			id: "open-sample-modal-complex",
			name: "Open sample modal (complex)",
			checkCallback: (checking: boolean) => {
				// Conditions to check
				const markdownView =
					this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					// If checking is true, we're simply "checking" if the command can be run.
					// If checking is false, then we want to actually perform the operation.
					if (!checking) {
						new SampleModal(this.app).open();
					}

					// This command will only show up in Command Palette when the check function returns true
					return true;
				}
			},
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new OutputSettingTab(this.app, this));

		// If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// Using this function will automatically remove the event listener when this plugin is disabled.
		// this.registerDomEvent(document, "click", (evt: MouseEvent) => {
		// 	console.log("click", evt);
		// });

		// When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		// this.registerInterval(
		// 	window.setInterval(() => console.log("setInterval"), 5 * 60 * 1000)
		// );

		// Track if a file has been modified!
		// this.registerEvent(
		// 	this.app.vault.on("modify", (e) => {
		// 		console.warn("File modified:", e.name, e);
		// 	})
		// );

		// console.log('pages', )

		this.registerEvent(
			this.app.metadataCache.on("resolved", async() => {
				console.warn("dataview ready");
				if (this.dataViewApi) {
					// this.folderMeta = new FolderMeta(this.dataViewApi.index);

					const initialQuery = this.normalizeQuery(this.settings.exportQuery)
					console.log('[Bulk-Exporter] initial query results', initialQuery)
					const data = await this.dataViewApi.query(initialQuery);

					if (data.successful) {
						// new HeaderTabs
						console.log(`[Bulk-Exporter] Found ${data.value.values.length} files`)
						const fileMap = this.createPathhMap(data.value.values)
						console.log(fileMap)
						new FileListItemWrapper(this, fileMap)
					}

					// new FileListItemWrapper(this, this.folderMeta)
					// console.log("yaaay", this.folderMeta);
				} else {
					new Notice(
						"Meta-Dataview needs Dataview plugin to be installed."
					);
				}
			})
		);

		// console.warn('register file menu events')

		// this.registerEvent(
		// 	this.app.workspace.on('file-menu', (menu, file: TFile) => {
		// 		console.warn('file menu', menu)
		// 	}))


		// console.log("DataView API: ", this.dataViewApi);
		if (this.dataViewApi) {
			this.folderMeta = new FolderMeta(this.dataViewApi.index);
		}

		// console.log(dataViewApi.index.pages);
		// this.registerEvent(this.app.metadataCache.on("dataview:index-ready", () => {
		// });

		// this.app.metadataCache.on("dataview:index-ready", () => {});

		// const basePath = this.app.vault.adapter.basePath;

		// vault.getMarkdownFiles().slice(0,10).map(async (file)=>{
		// 	const content = await vault.cachedRead(file)
		// 	console.log(content)
		// })
		// const plugins = this.app.plugins as { [id: string] Plugin>
		// if (!this.app.plugins?.plugins?.dataview?.api){
		// 	console.error('Dataview plugin did not load yet!')
		// } else {
		// 	console.log(this.app.plugins.plugins.dataview.api)
		// }
	}

	onunload() { }

	normalizeQuery(userQuery: string):string{
		let query = ''
		if (userQuery.startsWith('from') ||
			userQuery.startsWith('where') ||
			userQuery.startsWith('group by') ||
			userQuery.startsWith('limit') ||
			userQuery.startsWith('flatten')) {
			query = "table file " + userQuery
		} else {
			// Assume the where
			query = "table file where " + userQuery
		}
		return query
	}

	createPathhMap(queryResults): { [key: string]: TAbstractFile} {
		const foundFileNames = queryResults
		.map((item) => {
			return item[0].path;
		});


		const foundFileMap: { [key: string]: Array<any> } = {}
		const foundFiles = this.lastFoundFileList = queryResults.map((item) => {
			foundFileMap[item[1].path] = item[1]
			return item[1];
		});
		return foundFileMap

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

		await this.app.workspace.getRightLeaf(false).setViewState({
			type: META_DATA_VIEW_TYPE,
			active: true,
		});

		this.app.workspace.revealLeaf(
			this.app.workspace.getLeavesOfType(META_DATA_VIEW_TYPE)[0]
		);
	}
}

class SampleModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.setText("Woah!");
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
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
		containerEl.createEl("h2", { text: "Export Settings" });
		containerEl.createEl("div", { text: "Meta DataView can export a certain subset of your notes, based on whether they match a query filter. " });

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

// @ts-ignore
export const getAPI = (app?: App): MetaDataviewApi | undefined => {
	// @ts-ignore
	if (app) return app.plugins.plugins["meta-dataview"];
};

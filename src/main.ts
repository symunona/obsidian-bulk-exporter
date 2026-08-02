import { Notice, Plugin } from "obsidian";
import { BulkExporterView, META_DATA_VIEW_TYPE } from "src/view";
import { Exporter } from "./export/exporter";
import { BulkExportSettingsList } from "./models/bulk-export-settings";
import { OutputSettingTab } from "./settings/export-settings-tab";
import { parseSavedSettingsData } from "./utils/data-parser";
import { error } from "./utils/log";
import { isDataviewAvailable } from "./utils/data-view-api";
import { debounce } from "underscore";

/** Turns whatever was thrown into something worth showing a human. */
function describeThrown(thrown: unknown): string {
	return thrown instanceof Error
		? `${thrown.name}: ${thrown.message}`
		: String(thrown);
}


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
			"Bulk exporter preview",
			(evt: MouseEvent) => {
				void this.activateView();
			}
		);

		this.addCommand({
			id: "bulk-export",
			name: "Bulk export",
			callback: () => {
				// A command callback cannot be async, so the export runs
				// detached - but detached must not mean unwatched. Without this
				// `.catch` a rejection here (a broken dataview query, a
				// read-only output folder) became an unhandled rejection and the
				// user saw a preview pane open on a stale list, no error, no
				// hint that nothing had been written.
				this.exporter.searchAndExportAll().catch((e: unknown) => {
					this.reportFailure("Bulk export failed", e, true);
				});
				void this.activateView();
			},
		});

		this.addSettingTab(new OutputSettingTab(this.app, this));

		this.registerEvent(
			this.app.metadataCache.on("resolved", async () => {
				// If the dataview plugin was not loaded when this inited,
				// let's create the initial search! Wait until Obsidian is fully loaded.
				if (!this.inited && document.querySelector('.mod-root')) {
					if (!isDataviewAvailable()) {
						return;
					}
					// Same story as the command above, except this one fires on
					// its own during startup: report it to the log and the
					// console, but no Notice - the user did not ask for
					// anything, and a popup on every vault open would be noise.
					this.exporter.searchAll().catch((e: unknown) => {
						this.reportFailure("Initial export search failed", e, false);
					});
					this.inited = true;
				} else {
					// Check files
					// This seems to run on index updates.
				}
			})
		);
	}

	/**
	 * Somewhere a human can actually see it: the log pane (which buffers until
	 * it is opened, see utils/log.ts), the developer console, and - when the
	 * user asked for the thing that broke - a Notice.
	 */
	reportFailure(what: string, thrown: unknown, notify: boolean) {
		const message = describeThrown(thrown);
		console.error(`[Bulk Exporter] ${what}`, thrown);
		error(`${what}: ${message}`);
		if (notify) {
			new Notice(`Bulk Exporter: ${what}. ${message}`);
		}
	}

	onunload() {
		// Do cleanup the sidebar.
		this.exporter.display.clean()
	}

	async loadSettings() {
		const data = (await this.loadData()) as Record<string, unknown> | null | undefined;
		this.settings = parseSavedSettingsData(data)
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async saveSettingsWithRefresh(){
		await this.saveSettings()
		this.debouncedRefresh()
	}

	debouncedRefresh = debounce(()=>{
		if (this.app.workspace.getLeavesOfType(META_DATA_VIEW_TYPE)?.length){
			const view = this.app.workspace.getLeavesOfType(META_DATA_VIEW_TYPE)[0].view as BulkExporterView;
			void view.refresh()
		}
	}, 1000)

	async activateView() {
		this.app.workspace.detachLeavesOfType(META_DATA_VIEW_TYPE);

		await this.app.workspace.getLeaf(false).setViewState({
			type: META_DATA_VIEW_TYPE,
			active: true,
		});

		await this.app.workspace.revealLeaf(
			this.app.workspace.getLeavesOfType(META_DATA_VIEW_TYPE)[0]
		);
	}
}

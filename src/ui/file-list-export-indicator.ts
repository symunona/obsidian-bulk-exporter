import { getIcon } from "src/obsidian-api-helpers/get-icon";
import BulkExporterPlugin from "src/main";
import { ExportMap, ExportProperties } from "src/models/export-properties";
import { BulkExportSettings } from "src/models/bulk-export-settings";

export class FileListItemWrapper {
	plugin: BulkExporterPlugin;
	fileMap: ExportMap;
	settings: BulkExportSettings;

	constructor(plugin: BulkExporterPlugin) {
		this.plugin = plugin;
		this.settings = this.plugin.settings;
	}

	/**
	 * Cleans up after itself.
	 */
	clean() {
		const fileExplorers =
			this.plugin.app.workspace.getLeavesOfType("file-explorer");
		fileExplorers.forEach((fileExplorer) => {
			// @ts-ignore: the type of this is obstructed, as it's an internal plugin.
			const fileExplorerFileItems = fileExplorer.view.fileItems;

			Object.entries(fileExplorerFileItems).forEach(
				([path, fileItem]) => {
					// @ts-ignore: so as fileItem: it's an internal type the file explorer uses.
					const fileItemElement = fileItem.selfEl as HTMLElement;
					fileItemElement.querySelector('.export-plugin-icon')?.remove()
				}
			);
		});
	}

	/**
	 * Adds an icon before the name element in file-explorer view
	 */
	async applyStatusIcons(fileMap: ExportMap) {
		const settings = (await this.plugin.loadData()) || {};
		const lastExport = settings.lastExport || {};
		const fileExplorers =
			this.plugin.app.workspace.getLeavesOfType("file-explorer");
		this.clean();
		// Each open file explorer.
		fileExplorers.forEach((fileExplorer) => {
			// @ts-ignore: the type of this is obstructed, as it's an internal plugin.
			const fileExplorerFileItems = fileExplorer.view.fileItems;

			Object.entries(fileExplorerFileItems).forEach(
				([path, fileItem]) => {
					// @ts-ignore: so as fileItem: it's an internal type the file explorer uses.
					const fileItemElement = fileItem.selfEl as HTMLElement;

					if (fileMap[path]) {
						// Get the tree-node element, and see if there is already an indicator icon.
						this.applyStatusIconToFile(
							fileItemElement,
							path,
							lastExport[path],
							// @ts-ignore
							fileMap[path].file.frontmatter
						);
					}
				}
			);
		});
	}

	updateElementStatus(exportProperties: ExportProperties) {
		const lastExport = this.settings.lastExport || {};
		const fileExplorers =
			this.plugin.app.workspace.getLeavesOfType("file-explorer");

		// Iterate over all the file explorers present
		fileExplorers.forEach((fileExplorer) => {
			// @ts-ignore: the type of this is obstructed, as it's an internal plugin.
			const fileExplorerFileItems = fileExplorer.view.fileItems;

			const fileExplorerFileItem =
				fileExplorerFileItems[exportProperties.from];

			if (!fileExplorerFileItem) {
				console.warn(
					"[Exporter] [File List Indicator] Could not find",
					exportProperties.from
				);
				return;
			}
			// @ts-ignore: so as fileItem: it's an internal type the file explorer uses.
			const fileItemElement = fileExplorerFileItem.selfEl as HTMLElement;
			this.applyStatusIconToFile(
				fileItemElement,
				exportProperties.from,
				lastExport[exportProperties.from],
				// @ts-ignore
				exportProperties.file.frontmatter
			);
		});
	}

	applyStatusIconToFile(
		element: HTMLElement,
		path: string,
		alreadyExported: ExportProperties,
		frontMatter: {[key: string]: any}
	) {
		let iconSpanAddedAlready = element.querySelector(".export-plugin-icon");

		// If not, create it.
		if (!iconSpanAddedAlready) {
			iconSpanAddedAlready = createSpan({
				cls: "export-plugin-icon",
				text: "",
			});
			element.prepend(iconSpanAddedAlready);
		}

		this.removeClasses(iconSpanAddedAlready, "green orange lime");
		iconSpanAddedAlready.innerHTML = "";

		if (this.plugin.settings.draftField &&
			frontMatter &&
			frontMatter[this.plugin.settings.draftField]
		) {
			iconSpanAddedAlready.classList.add("grey");
			iconSpanAddedAlready.append(getIcon("file-plus"));
			// @ts-ignore - this is a DOM Element, I have no clue why id would not have a title attr prop...
			iconSpanAddedAlready.title = "Draft";

			return
		}

		// Not yet exported! Add a new icon.
		if (!alreadyExported) {
			iconSpanAddedAlready.classList.add("lime");
			iconSpanAddedAlready.append(getIcon("file-plus"));
			// @ts-ignore - this is a DOM Element, I have no clue why id would not have a title attr prop...
			iconSpanAddedAlready.title = "New - Added After Last Export";
		} else {
			// Is the content up to date?
			const file = this.plugin.app.metadataCache.getFirstLinkpathDest(
				path,
				""
			);
			// @ts-ignore
			const lastModifyDateOfFile = new Date(file?.stat.mtime).getTime();
			const lastExportedDate = new Date(
				alreadyExported.lastExportDate
			).getTime();

			if (lastModifyDateOfFile === lastExportedDate) {
				iconSpanAddedAlready.classList.add("green");
				iconSpanAddedAlready.append(getIcon("check-circle"));
				// @ts-ignore
				iconSpanAddedAlready.title = "Up to date";
			} else {
				iconSpanAddedAlready.classList.add("orange");
				iconSpanAddedAlready.append(getIcon("file-plus"));
				// @ts-ignore
				iconSpanAddedAlready.title = "Modified Since Last Export";
			}
		}
	}

	removeClasses(element: Element, str: string) {
		str.split(" ").forEach((cls) => {
			element.classList.remove(cls);
		});
	}
}

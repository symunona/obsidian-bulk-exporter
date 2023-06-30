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
        this.settings = this.plugin.settings
		// plugin.app.workspace.onLayoutReady(async () => {
		//     this.applyStatusIcons()
		// })

		// plugin.registerEvent(
		//     plugin.app.workspace.on('layout-change', () => this.applyStatusIcons())
		// )

		// plugin.registerEvent(
		//     plugin.app.vault.on('rename', async (newFile, oldPath) => {
		//         this.applyStatusIcons()
		//     })
		// )
	}
	/**
	 * Adds an icon before the name element in file-explorer view
	 */
	async applyStatusIcons(fileMap: ExportMap) {
		const settings = await this.plugin.loadData();
		const lastExport = settings.lastExport || {};

		const fileExplorers =
			this.plugin.app.workspace.getLeavesOfType("file-explorer");

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
							fileMap[path],
							lastExport[path]
						);
					}
				}
			);
		});
	}

    updateElementStatus(exportProperties: ExportProperties){
        const lastExport = this.settings.lastExport || {};
        const fileExplorers = this.plugin.app.workspace.getLeavesOfType("file-explorer");

        // Iterate over all the file explorers present
        fileExplorers.forEach((fileExplorer) => {
            // @ts-ignore: the type of this is obstructed, as it's an internal plugin.
			const fileExplorerFileItems = fileExplorer.view.fileItems;

            const fileExplorerFileItem = fileExplorerFileItems[exportProperties.to];
            if (!fileExplorerFileItem) {
                console.warn('[Exporter] [File List Indicator] Could not find', exportProperties.to)
                return
            }
            // @ts-ignore: so as fileItem: it's an internal type the file explorer uses.
            const fileItemElement = fileExplorerFileItem.selfEl as HTMLElement;
            this.applyStatusIconToFile(fileItemElement, exportProperties,lastExport[exportProperties.to])
        })
    }

	applyStatusIconToFile(
		element: HTMLElement,
		exportProperties: ExportProperties,
		alreadyExported: ExportProperties
	) {
		let iconSpanAddedAlready = element.querySelector(".export-plugin-icon");

		// If not, create it.
		if (!iconSpanAddedAlready) {
			iconSpanAddedAlready = createSpan({
				cls: "export-plugin-icon",
				text: "🔥",
			});
			element.prepend(iconSpanAddedAlready);
		}

        this.removeClasses(iconSpanAddedAlready, "green orange yellow");
        iconSpanAddedAlready.innerHTML = "";

		// Not yet exported! Add a new icon.
		if (!alreadyExported) {
			iconSpanAddedAlready.classList.add("orange");
			iconSpanAddedAlready.append(getIcon("file-plus"));
		} else {
			// Is the content up to date?
			if (alreadyExported.md5 === exportProperties.md5) {
                iconSpanAddedAlready.classList.add("green");
                iconSpanAddedAlready.append(getIcon("check-circle"));
			} else {
                iconSpanAddedAlready.classList.add("orange");
                iconSpanAddedAlready.append(getIcon("file-plus"));
			}
		}
	}

    removeClasses(element: Element, str: string){
        str.split(' ').forEach(cls => {
            element.classList.remove(cls)
        });
    }
}

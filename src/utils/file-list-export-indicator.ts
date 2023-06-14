import BulkExporterPlugin from "src/main"
import { ExportMap } from "./create-path-map"

export class FileListItemWrapper {
    plugin: BulkExporterPlugin
    fileMap: ExportMap

    constructor(plugin: BulkExporterPlugin, fileMap: ExportMap) {
        this.plugin = plugin
        this.fileMap = fileMap
        plugin.app.workspace.onLayoutReady(async () => {
            this.applyStatusIcons()
        })

        plugin.registerEvent(
            plugin.app.workspace.on('layout-change', () => this.applyStatusIcons())
        )

        plugin.registerEvent(
            plugin.app.vault.on('rename', async (newFile, oldPath) => {
                this.applyStatusIcons()
            })
        )
    }
    /**
     * Adds an icon before the name element in file-explorer view
     */
    applyStatusIcons() {
        const fileExplorers = this.plugin.app.workspace.getLeavesOfType('file-explorer')
        fileExplorers.forEach((fileExplorer) => {
            // @ts-ignore
            Object.entries(fileExplorer.view.fileItems).forEach(
                ([path, fileItem]) => {
                    if (this.fileMap[path]) {
                        // Get the tree-node element, and see if there is already an indicator icon.
                        // @ts-ignore
                        const iconSpanAddedAlready = fileItem.selfEl.querySelector('.export-plugin-icon')

                        // If not, create it.
                        if (!iconSpanAddedAlready)
                        {
                            const iconSpan = createSpan({cls: 'export-plugin-icon', text: 'X🔥'})
                            // @ts-ignore
                            fileItem.selfEl.prepend(iconSpan)
                        }
                        // Get status from former hash
                        // TODO
                    }
                }
            )
        })
    }
}
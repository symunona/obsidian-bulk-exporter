import BulkExporterPlugin from "src/main"
import { ExportFileMap } from "./fileMap"

export class FileListItemWrapper {
    plugin: BulkExporterPlugin
    fileMap: ExportFileMap

    constructor(plugin: BulkExporterPlugin, fileMap: ExportFileMap) {
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
                // plugin.settings.fileColors
                //     .filter((fileColor) => fileColor.path === oldPath)
                //     .forEach((fileColor) => {
                //         fileColor.path = newFile.path
                //     })
                // plugin.saveSettings()
                this.applyStatusIcons()
            })
        )
    }
    applyStatusIcons() {
        const fileExplorers = this.plugin.app.workspace.getLeavesOfType('file-explorer')
        console.warn(this.fileMap)
        fileExplorers.forEach((fileExplorer) => {
            Object.entries(fileExplorer.view.fileItems).forEach(
                ([path, fileItem]) => {
                    // const itemClasses = fileItem.selfEl.classList.value
                    //     .split(' ')
                    //     .filter((cls) => !cls.startsWith('file-color'))
                    // const file = this.plugin.settings.fileColors.find(
                    //     (file) => file.path === path
                    // )

                    // if (file) {
                    //     itemClasses.push('file-color-file')
                    //     itemClasses.push('file-color-color-' + file.color)
                    // }

                    // fileItem.selfEl.classList.value = itemClasses.join(' ')

                    // console.warn('cls', path)

                    if (this.fileMap[path]){
                        const iconSpan = createSpan({cls: '', text: '🔥'})
                        fileItem.selfEl.prepend(iconSpan)
                    }

                    // if (path.indexOf('_') > -1){
                    //     console.error('e!', path)
                    //     const iconSpan = createSpan({cls: '', text: 'X'})
                    //     fileItem.selfEl.prependChild(iconSpan)
                    // }
                }
            )
        })
    }
}
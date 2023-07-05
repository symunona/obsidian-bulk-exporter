import { Plugin } from "obsidian"

/**
 * Reveals absolute path of file or dir in the left side file explorer panel.
 * @param path
 */
export function revealInFolder(plugin: Plugin, path: string) {
    // The revealInFolder is not part of the official API, so this uses a
    // little hacking around that.
    // If this is to ever break, we just bail.
    // @ts-ignore: app does not reveal internal plugin API.
    const fileExplorer = plugin.app.internalPlugins.getPluginById('file-explorer').instance

    if (fileExplorer) {
        const fileObject = plugin.app.vault.getAbstractFileByPath(path)
        fileExplorer.revealInFolder(fileObject)
    }
}


/**
 * Dug this out from app.js: the event handler for the menuitem on the side bar.
 */
import { Plugin } from "obsidian";
import { Platform } from "obsidian";

export function showFolderInSystemBrowserAbsolute(plugin: Plugin, path: string) {
    // @ts-ignore
    window.electron && (Platform.isMacOS ? electron.remote.shell : electron.shell).showItemInFolder(path)
}

export function showFolderInSystemBrowser(plugin: Plugin, relativePath: string) {

    // @ts-ignores
    const fullPath = plugin.app.vault.getFullPath(relativePath)

    showFolderInSystemBrowserAbsolute(plugin, fullPath)
}
/**
 * Dug this out from app.js: the event handler for the menuitem on the side bar.
 */
import { Plugin } from "obsidian";
import { Platform } from "obsidian";
import { normalize } from "path";

export function showFolderInSystemBrowserAbsolute(plugin: Plugin, path: string) {
    const normalizedPath = normalize(path)
    // @ts-ignore
    window.electron && (Platform.isMacOS ? electron.remote.shell : electron.shell).openPath(normalizedPath)
}

export function showFolderInSystemBrowser(plugin: Plugin, relativePath: string) {

    // @ts-ignores
    const fullPath = plugin.app.vault.getFullPath(relativePath)

    showFolderInSystemBrowserAbsolute(plugin, fullPath)
}
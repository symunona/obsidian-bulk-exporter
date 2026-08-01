/**
 * Dug this out from app.js: the event handler for the menuitem on the side bar.
 */
import { Plugin, Vault } from "obsidian";
import { Platform } from "obsidian";
import { normalize } from "path";

/**
 * Electron's `shell` API is not part of Obsidian's public type surface. The
 * desktop app exposes it as `window.electron` (a browser `window` is the
 * global object, so this is the same value the renderer-global `electron`
 * identifier used to point at).
 */
interface ElectronShell {
    openPath(path: string): Promise<string>;
}

interface ElectronGlobal {
    shell: ElectronShell;
    remote?: {
        shell: ElectronShell;
    };
}

declare global {
    interface Window {
        electron?: ElectronGlobal;
    }
}

/**
 * `getFullPath` is not declared on the public `Vault` type (only on the
 * concrete `DataAdapter` implementations), but the desktop `Vault` exposes
 * it directly as a convenience. Not part of the official API.
 */
interface VaultWithFullPath extends Vault {
    getFullPath(normalizedPath: string): string;
}

export function showFolderInSystemBrowserAbsolute(plugin: Plugin, path: string) {
    const normalizedPath = normalize(path)
    const electron = window.electron
    if (electron) {
        const shell = (Platform.isMacOS && electron.remote) ? electron.remote.shell : electron.shell
        void shell.openPath(normalizedPath)
    }
}

export function showFolderInSystemBrowser(plugin: Plugin, relativePath: string) {

    // Not part of the official API.
    const vault = plugin.app.vault as VaultWithFullPath
    const fullPath = vault.getFullPath(relativePath)

    showFolderInSystemBrowserAbsolute(plugin, fullPath)
}

import { App, Plugin, TAbstractFile } from "obsidian"

/**
 * The core "file-explorer" internal plugin's view. Not part of the official
 * API.
 */
interface FileExplorerView {
    revealInFolder(file: TAbstractFile | null): void;
}

interface InternalPluginInstance {
    instance: FileExplorerView | undefined;
}

interface InternalPlugins {
    getPluginById(id: string): InternalPluginInstance;
}

interface AppWithInternalPlugins extends App {
    internalPlugins: InternalPlugins;
}

/**
 * Reveals absolute path of file or dir in the left side file explorer panel.
 * @param path
 */
export function revealInFolder(plugin: Plugin, path: string) {
    // The revealInFolder is not part of the official API, so this uses a
    // little hacking around that.
    // If this is to ever break, we just bail.
    const app = plugin.app as AppWithInternalPlugins
    const fileExplorer = app.internalPlugins.getPluginById('file-explorer').instance

    if (fileExplorer) {
        const fileObject = plugin.app.vault.getAbstractFileByPath(path)
        fileExplorer.revealInFolder(fileObject)
    }
}

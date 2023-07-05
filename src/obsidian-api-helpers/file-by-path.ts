import { Notice, Plugin } from "obsidian";

/**
 * Opens a file in a new leaf.
 * @param filePath
 */
export function openFileByPath(plugin: Plugin, filePath: string) {
	const file = plugin.app.metadataCache.getFirstLinkpathDest(filePath, "");
	if (!file) {
		new Notice("Could not open " + filePath);
		return;
	}
	const leaf = plugin.app.workspace.getUnpinnedLeaf();
	leaf.openFile(file, { active: true });
}

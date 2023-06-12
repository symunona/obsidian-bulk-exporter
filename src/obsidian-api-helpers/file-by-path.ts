/**
 * Opens a file in a new leaf.
 * @param filePath
 */
export function openFileByPath(filePath: string) {
    const file = this.app.metadataCache.getFirstLinkpathDest(filePath, "");
    const leaf = this.app.workspace.getUnpinnedLeaf();
    leaf.openFile(file, { active: true })
}


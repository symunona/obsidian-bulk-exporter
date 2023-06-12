/**
 * Draws a folder tree from a root element recursively.
 * Handles collapse and open.
 */

import { getIcon } from "obsidian";
import Folder from "../models/folder";

export default function renderTree(leaf: HTMLElement, tree: Folder) {
	const foldersWithinFolder = Object.keys(tree.children).filter(
		(child) => tree.children[child] instanceof Folder
	);
	const filesWithinFolder = Object.keys(tree.children).filter((child) => {
		return !(tree.children[child] instanceof Folder);
	});
	foldersWithinFolder.forEach((subFolderKey) => {
		// Add subfolder opener:
		const folderRootEl = leaf.createDiv({ cls: "nav-folder tree-item" });
		const title = folderRootEl.createDiv({ cls: "nav-folder-title is-clickable mod-collapsible tree-item-self" });
		const collapseArrow = title.createDiv({
			cls: "nav-folder-collapse-indicator collapse-icon",
		});

		// @ts-ignore
		collapseArrow.append(getIcon("chevron-down"));

		title.createDiv({
			cls: "nav-folder-title-content",
			text: subFolderKey,
		});
		const subFolderEl = folderRootEl.createDiv({
			cls: "nav-folder-children",
		});

		title.addEventListener('click', function (e: Event) {

			if (this.classList.contains('is-collapsed')) {
				subFolderEl.style.height = 'auto'
			} else {
				subFolderEl.style.height = '0';
			}
			this.classList.toggle('is-collapsed')
		})
		// @ts-ignore
		renderTree(subFolderEl, tree.children[subFolderKey]);
	});
	filesWithinFolder.forEach((fileName) => {
		const fileItemContainer = leaf.createDiv({ cls: "nav-file tree-item" });
		const title = fileItemContainer.createDiv({ cls: 'nav-file-title is-clickable tree-item-self' })
		title.createDiv({ cls: 'nav-file-title-content', text: fileName })
		fileItemContainer.addEventListener('click', () => {
			const file = this.app.metadataCache.getFirstLinkpathDest(tree.children[fileName], "");
			const leaf = this.app.workspace.getUnpinnedLeaf();
			leaf.openFile(file, { active: true })
		})
	});
}

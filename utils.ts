import { basename, dirname, sep } from "path";
import { extend } from "underscore";
import { getIcon } from "obsidian";
import Folder from "src/models/folder";

// @ts-ignore
window.getIcon = getIcon;

export function createTreeFromFileMap(fileList: Array<string>) {
	const map: {
		[id: string]: { [baesName: string]: string };
	} = {};

	// These are the folders that each file is in.
	fileList.forEach((item) => {
		const dir = dirname(item);
		if (!map[dir]) {
			map[dir] = {};
		}
		map[dir][basename(item)] = item;
	});

	let folderTree: Folder = new Folder("(root)");

	// Smart folder tree, where we have folders that only have one child grouped.
	// First, just build the tree, than snap it together.
	Object.keys(map).forEach((folderKey) => {
		const folders = folderKey.split(sep);
		let currentFolderRef = folderTree;
		folders.forEach((subFolder) => {
			currentFolderRef.children[subFolder] =
				currentFolderRef.children[subFolder] ||
				new Folder(subFolder, currentFolderRef);
			// @ts-ignore
			currentFolderRef = currentFolderRef.children[subFolder];
		});
		currentFolderRef.children = extend(
			currentFolderRef.children,
			map[folderKey]
		);
	});

	// Now snap together all the ones that only have one keys:
	// console.log('folderTee', folderTree)
	folderTree = snapTogetherSoloElements(folderTree, "");
	// console.log('SNAPPED', folderTree)
	return folderTree;
}

function snapTogetherSoloElements(
	folderTreeRoot: Folder,
	path: string
): Folder {
	const foldersWithinFolder = Object.keys(folderTreeRoot).filter(
		(child) => folderTreeRoot.children[child] instanceof Folder
	);
	const filesWithinFolderCount = Object.keys(folderTreeRoot).filter(
		(child) => folderTreeRoot.children[child] instanceof String
	).length;
	// Dd the snap
	if (foldersWithinFolder.length === 1 && filesWithinFolderCount === 0) {
		const subFolderName = Object.keys(folderTreeRoot)[0];

		const collapsed = snapTogetherSoloElements(
			// @ts-ignore due to we just filtered it up there.
			folderTreeRoot[subFolderName],
			(path += sep + folderTreeRoot)
		);

		folderTreeRoot.name += sep + subFolderName;
		folderTreeRoot.children = collapsed.children;
		return folderTreeRoot;
	} else {
		foldersWithinFolder.map((subFolderName) =>
			snapTogetherSoloElements(
				// @ts-ignore due to we just filtered it up there.
				folderTreeRoot[subFolderName],
				(path += sep + folderTreeRoot)
			)
		);
		return folderTreeRoot;
	}
}

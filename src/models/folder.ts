
export default class Folder {
	constructor(name: string, parent?: Folder) {
		this.name = name;
		this.parent = parent;
	}
	name: string;
	parent: Folder | undefined;
	children: { [fileOrFolderName: string]: Folder | string } = {};
}

/**
 * Draws a folder tree from a root element recursively.
 * Handles collapse and open.
 */

import { Notice, TAbstractFile } from "obsidian";
import Folder from "../models/folder";
import { revealInFolder } from "../obsidian-api-helpers/file-explorer";
import { getIcon } from "../obsidian-api-helpers/get-icon";
import { createLink, isHttpUrl } from "../utils/url";
import { openFileByPath } from "src/obsidian-api-helpers/file-by-path";
import { URL } from "url";

const OVERWRITE_LOCALE = 'hu-HU'

export type CallbackFunction = (path: string) => void;

export class MetaDataViewTableRender {
	leaf: HTMLElement
	treeRoot: Folder
	metaKeysToShow: { [key: string]: Array<string> }
	fileMapByAbsolutePath: { [key: string]: Array<any> }
	goToFilter: CallbackFunction

	constructor(
		leaf: HTMLElement,
		tree: Folder,
		metaKeysToShow: { [key: string]: Array<string> },
		fileMap: { [key: string]: Array<TAbstractFile> },
		goToFilter: CallbackFunction) {
		this.leaf = leaf;
		this.treeRoot = tree
		this.metaKeysToShow = metaKeysToShow
		this.fileMapByAbsolutePath = fileMap
		this.goToFilter = goToFilter
		this.render()
	}

	render() {
		const metaFields = Object.keys(this.metaKeysToShow)

		const tableRoot = this.leaf.createEl('table', { cls: "dataview table-view-table" });
		const tableHead = tableRoot.createEl('thead', { cls: "table-view-thead" })
		const tableHeadTr = tableHead.createEl('tr', { cls: "table-view-tr-header" })
		tableHeadTr.createEl('th', { text: 'path' })

		// Header
		metaFields.forEach((name) => {
			const tableHeadTh = tableHeadTr.createEl('th', {
				cls: 'table-view-th', attr: { 'data-column-id': name }
			})
			tableHeadTr.append(tableHeadTh)
			// const toggler = tableHeadTh.createSpan({cls: 'column-toggler'})
			// 	.append(getIcon('chevron-down'))
			// const titleText =
			tableHeadTh.createSpan({ text: name })
		})
		const tBody = tableRoot.createEl('tbody', { cls: 'table-view-tbody' })

		this.renderSubTable(tBody, this.treeRoot, 0, '')

		this.leaf.appendChild(tableRoot)
	}

	renderSubTable(
		tableRoot: HTMLElement,
		tree: Folder,
		depth: number,
		absolutePath: string
	) {

		const foldersWithinFolder = Object.keys(tree.children).filter(
			(child) => tree.children[child] instanceof Folder
		);
		const filesWithinFolder = Object.keys(tree.children).filter((child) => {
			return !(tree.children[child] instanceof Folder);
		});

		// Iterate through every folder.
		foldersWithinFolder.forEach((subFolderKey) => {
			this.renderSubTable(
				tableRoot,
				// @ts-ignore - these are only folders!
				tree.children[subFolderKey],
				depth + 1,
				absolutePath ? (absolutePath + '/' + subFolderKey) : subFolderKey
			);
		});

		// Render header only if there is at least one file in it!
		if (filesWithinFolder.length) {
			this.renderFolderHeaderRow(tableRoot, absolutePath)
		}

		filesWithinFolder.forEach((fileName: string) => {
			this.renderFileRow(tableRoot, tree.children[fileName])
		});
	}

	renderFileRow(tableBodyRoot: HTMLElement, fullPath: string) {
		// @ts-ignore: TODO: I did a poor job with this filtering, the string should be a TAbstractFile
		const metaData = this.fileMapByAbsolutePath[fullPath].frontmatter;

		const fileName = fullPath.substring(fullPath.lastIndexOf('/') + 1)
		const folderPath = fullPath.substring(0, fullPath.length - fileName.length - 1)

		const fileItemRow = tableBodyRoot.createEl('tr', {
			cls: "nav-file tree-item meta-data-table-file-row",
			attr: { 'data-path': folderPath }
		});

		const title = fileItemRow.createEl('td', {
			cls: 'nav-file-title is-clickable tree-item-self',
			text: fileName
		})

		// title.createDiv({ cls: 'nav-file-title-content', text: fileName })
		title.addEventListener('click', () => {
			revealInFolder(fullPath)
		})
		title.addEventListener('dblclick', () => {
			revealInFolder(fullPath)
			openFileByPath(fullPath)
		})


		Object.keys(this.metaKeysToShow).forEach((metaKey) => {
			this.renderMetaCell(fileItemRow, metaKey, metaData[metaKey])
		})
	}


	renderFolderHeaderRow(tableBodyRoot: HTMLElement, absolutePath: string) {
		const pathHeader = tableBodyRoot.createEl('tr', { cls: "table-sub-header tree-item" });

		// TODO: get the full path of the folder here
		const pathHeaderTd = pathHeader.createEl('td', {
			attr: { colspan: Object.keys(this.metaKeysToShow).length + 1 }
		})

		const title = pathHeaderTd.createDiv({ cls: "nav-folder-title mod-collapsible tree-item-self" });

		const collapseArrow = title.createDiv({
			cls: "nav-folder-collapse-indicator collapse-icon",
		});

		const text = title.createEl('a', {
			cls: "nav-folder-title-content",
			text: absolutePath,
		});

		text.addEventListener('click', (e) => {
			this.goToFilter(`from "${absolutePath}"`)
		})

		const filterReveal = title.createSpan({ cls: 'reveal-eye' })
		filterReveal.append(getIcon('eye'))

		collapseArrow.append(getIcon("chevron-down"));

		collapseArrow.addEventListener('click', (event) => {
			event.stopPropagation();
			pathHeaderTd.classList.toggle('is-collapsed')
			const isOpen = !pathHeaderTd.classList.contains('is-collapsed')

			const elements = tableBodyRoot.querySelectorAll(`.meta-data-table-file-row[data-path="${absolutePath}"]`)
			if (elements) {
				elements.forEach((el) => el.style.display = isOpen ? 'table-row' : 'none')
			}

		})

		filterReveal.addEventListener('click', () => {
			revealInFolder(absolutePath)
		})
	}

	renderMetaCell(
		fileItemRow: HTMLElement,
		metaKey: string,
		value: any
	) {
		// console.log('stirng!')
		const td = fileItemRow.createEl('td', { cls: 'data-view-meta-key' })
		if (metaKey === 'tags' && value instanceof Array) {
			// console.log('aaaaa', value)
			value.forEach((tag: string, i) => {
				const tagLink = td.createEl('a', { cls: 'tag-link', text: tag })
				tagLink.addEventListener('click', () => {
					// DataView does not handle multi-word tags, instead it
					// adds them to multiple indexes. Hence if this is a multi-word tag,
					// let's just filter it with an AND.
					if (tag.indexOf(' ') > -1) {
						return this.goToFilter(`from ${tag.split(' ').map(t => `#${t}`).join(' AND ')}`)
					}
					this.goToFilter(`from #${tag}`)
				})
				if (i < value.length - 1)
					td.createSpan({ text: ', ' })
			})
		} else if ((typeof (value) === 'string') && isHttpUrl(value.trim())) {
			createLink(td, value, '🔗 ' + new URL(value).hostname, value)
		// There is no space in it: either a date, or something we can create a filter for.
		} else if (value && (typeof (value) === 'string') && value.indexOf(' ') === -1) {
			// Try if this is a date
			if (isValidDate(new Date(value))) {
				const date = new Date(value)
				let display = date.toLocaleDateString(OVERWRITE_LOCALE)
				// Hide time, if it's just a date
				if (!(date.getUTCHours() === 0 && date.getMinutes() === 0)) {
					display += ' ' + date.toLocaleTimeString()
				}
				td.createSpan({ cls: 'meta-value', text: display, attr: { title: value } })
			} else {
				const link = createLink(td, value, value)
				link.addEventListener('click', () => {
					this.goToFilter(`where contains(${metaKey}, "${value}")`)
				})
			}
		} else if (value instanceof Array) {
			td.createSpan({ cls: 'meta-value', text: value.join(', ') })
		} else if (value instanceof Object) {
			td.createEl('button', { cls: 'meta-value', text: 'JS Object', attr: { title: JSON.stringify(value, null, 2) } })
			td.addEventListener('click', () => {
				new Notice("Copied to clipboard! \n" + JSON.stringify(value, null, 2));
				navigator.clipboard.writeText(JSON.stringify(value, null, 2));
			})
		} else if (value === undefined) {
			td.classList.add('undefined')
		} else if (typeof (value) === 'boolean') {
			td.classList.add('boolean')
			td.createEl('input', {attr: {type: 'checkbox', disabled: true, checked: value}})
		} else {
			td.createSpan({ cls: 'meta-value', text: value })
		}

	}
}

function isValidDate(date: Date) {
	return date instanceof Date && isFinite(+date);
}

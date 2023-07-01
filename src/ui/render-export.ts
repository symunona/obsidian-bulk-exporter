/**
 * Draws a folder tree from a root element recursively.
 * Handles collapse and open.
 */

import { Notice } from "obsidian";
import { revealInFolder } from "../obsidian-api-helpers/file-explorer";
import { getIcon } from "../obsidian-api-helpers/get-icon";
import { createLink, isHttpUrl } from "../utils/url";
import { openFileByPath } from "src/obsidian-api-helpers/file-by-path";
import { URL } from "url";
import { getGroups } from "src/export/exporter";
import { without } from "underscore";
import { ExportGroupMap, ExportMap, ExportProperties } from "src/models/export-properties";
import { BulkExportSettings } from "src/models/bulk-export-settings";
import { getMetaFields } from "src/utils/folder-meta";

const OVERWRITE_LOCALE = 'hu-HU'

export type CallbackFunction = (path: string) => void;

export class ExportTableRender {
	leaf: HTMLElement
	groupMap: ExportGroupMap
	exportMap: ExportMap
	metaKeysToShow: { [key: string]: Array<string> }
	fileMapByAbsolutePath: { [key: string]: Array<any> }
	goToFilter: CallbackFunction
	metaFields: Array<string>
	metaFieldsNoExtras: Array<string>

	constructor(
		leaf: HTMLElement,
		exportMap: ExportMap,
		settings: BulkExportSettings
	) {
		this.leaf = leaf;
		this.exportMap = exportMap
		this.groupMap = getGroups(exportMap, settings)
		this.metaKeysToShow = getMetaFields(exportMap)
		this.metaFields = without(['fileName'].concat(Object.keys(this.metaKeysToShow)), settings.groupBy)
		this.metaFieldsNoExtras = without(Object.keys(this.metaKeysToShow), settings.groupBy)
		this.render()
	}

	render() {
		const tableRoot = this.leaf.createEl('table', { cls: "dataview table-view-table" });
		const tableHead = tableRoot.createEl('thead', { cls: "table-view-thead" })
		const tableHeadTr = tableHead.createEl('tr', { cls: "table-view-tr-header" })

		// Header
		this.metaFields.forEach((name) => {
			const tableHeadTh = tableHeadTr.createEl('th', {
				cls: 'table-view-th', attr: { 'data-column-id': name }
			})
			tableHeadTr.append(tableHeadTh)
			tableHeadTh.createSpan({ text: name })
		})

		Object.keys(this.groupMap).forEach((group) => {
			const tBody = tableRoot.createEl('tbody', { cls: 'table-view-tbody' })
			// this.renderGroup(tBody, this.groupMap[group], 0, '')
			this.renderFolderHeaderRow(tBody, group)
			this.groupMap[group].forEach((file) => {
				this.renderFileRow(tBody, file)
			})
			this.leaf.appendChild(tableRoot)
		})
	}

	renderFileRow(tableBodyRoot: HTMLElement, item: ExportProperties) {
		// @ts-ignore: TODO: I did a poor job with this filtering, the string should be a TAbstractFile
		const metaData = item.file.frontmatter;

		const fileItemRow = tableBodyRoot.createEl('tr', {
			cls: "nav-file tree-item meta-data-table-file-row",
			attr: {'data-path': item.group}
		});

		const title = fileItemRow.createEl('td', {
			cls: 'nav-file-title is-clickable tree-item-self',
			text: item.newFileName
		})

		// title.createDiv({ cls: 'nav-file-title-content', text: fileName })
		title.addEventListener('click', () => {
			revealInFolder(item.from)
		})
		title.addEventListener('dblclick', () => {
			revealInFolder(item.from)
			openFileByPath(item.from)
		})

		this.metaFieldsNoExtras.forEach((metaKey) => {
			this.renderMetaCell(fileItemRow, metaKey, metaData[metaKey])
		})
	}


	renderFolderHeaderRow(tableBodyRoot: HTMLElement, group: string) {
		const pathHeader = tableBodyRoot.createEl('tr', { cls: "table-sub-header tree-item" });

		// TODO: get the full path of the folder here
		const pathHeaderTd = pathHeader.createEl('td', {
			attr: { colspan: Object.keys(this.metaKeysToShow).length + 1 }
		})

		const title = pathHeaderTd.createDiv({ cls: "nav-folder-title mod-collapsible tree-item-self" });

		const collapseArrow = title.createDiv({
			cls: "nav-folder-collapse-indicator collapse-icon",
		});

		title.createEl('a', {
			cls: "nav-folder-title-content",
			text: group,
		});

		collapseArrow.append(getIcon("chevron-down"));

		collapseArrow.addEventListener('click', (event) => {
			event.stopPropagation();
			pathHeaderTd.classList.toggle('is-collapsed')
			const isOpen = !pathHeaderTd.classList.contains('is-collapsed')

			const elements = tableBodyRoot.querySelectorAll(`.meta-data-table-file-row[data-path="${group}"]`)
			if (elements) {
				elements.forEach((el: HTMLElement) => el.style.display = isOpen ? 'table-row' : 'none')
			}

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
			td.createEl('input', { attr: { type: 'checkbox', disabled: true, checked: value } })
		} else {
			td.createSpan({ cls: 'meta-value', text: value })
		}

	}
}

function isValidDate(date: Date) {
	return date instanceof Date && isFinite(+date);
}

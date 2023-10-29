/**
 * Draws an export grouped by the export path.
 * Handles collapse and open.
 */

import { Notice } from "obsidian";
import { revealInFolder } from "../obsidian-api-helpers/file-explorer";
import { getIcon } from "../obsidian-api-helpers/get-icon";
import { createLink, isHttpUrl } from "../utils/url";
import { openFileByPath } from "src/obsidian-api-helpers/file-by-path";
import { URL } from "url";
import { getGroups } from "src/export/exporter";
import { ExportGroupMap, ExportMap, ExportProperties } from "src/models/export-properties";
import { getMetaFields } from "src/utils/folder-meta";
import BulkExporterPlugin from "src/main";
import { without } from "underscore";
import { HeaderFieldSelectorModal } from "./header-selector-modal";

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
	metaFieldsWithoutFileName: Array<string>
	plugin: BulkExporterPlugin;
	draftField: string;
	fieldsToRender: Array<string>;

	constructor(
		leaf: HTMLElement,
		exportMap: ExportMap,
		plugin: BulkExporterPlugin
	) {
		const resultListEl = leaf.createEl("div", {
			cls: "nav-files-container meta-data-view-table-container",
		});

		this.leaf = resultListEl;
		this.plugin = plugin;
		this.exportMap = exportMap
		this.groupMap = getGroups(exportMap)
		this.metaKeysToShow = getMetaFields(exportMap)
		this.metaFields = ['fileName'].concat(Object.keys(this.metaKeysToShow))

		// Put the draftField to the beginning, next to the filename.
		if (this.plugin.settings.draftField) {
			delete this.metaKeysToShow[this.plugin.settings.draftField]
			this.draftField = this.plugin.settings.draftField;
			this.metaFields = ['fileName', this.plugin.settings.draftField].concat(Object.keys(this.metaKeysToShow))
		}

		this.metaFieldsWithoutFileName = without(this.metaFields, 'fileName')

		this.render()
	}

	render() {
		if (this.plugin.settings.headerFieldsToShow?.length){
			this.fieldsToRender = this.plugin.settings.headerFieldsToShow
		} else {
			this.fieldsToRender = this.metaFieldsWithoutFileName
		}

		this.leaf.innerHTML = ''
		const tableRoot = this.leaf.createEl('table', { cls: "dataview table-view-table" });
		const tableHead = tableRoot.createEl('thead', { cls: "table-view-thead" })
		const tableHeadTr = tableHead.createEl('tr', { cls: "table-view-tr-header" })

		const fileNameTh = tableHeadTr.createEl('th', {
			cls: 'table-view-th',
			attr: { 'data-column-id': 'fileName' },
		})

		const editHeaderFieldsLink = fileNameTh.createEl('span', {cls: 'clickable'})
		editHeaderFieldsLink.append(getIcon('eye'));

		// Header
		this.fieldsToRender.forEach((name) => {
			const tableHeadTh = tableHeadTr.createEl('th', {
				cls: 'table-view-th', attr: { 'data-column-id': name }
			})
			tableHeadTr.append(tableHeadTh)
			tableHeadTh.createSpan({ text: name })
		})

		editHeaderFieldsLink.addEventListener('click', ()=>{
			new HeaderFieldSelectorModal(this.plugin, this.metaFields, ()=>{
				this.render();
			}).open();
		})

		Object.keys(this.groupMap).forEach((group) => {
			const tBody = tableRoot.createEl('tbody', { cls: 'table-view-tbody' })
			this.renderFolderHeaderRow(tBody, group, this.groupMap)
			this.groupMap[group].forEach((file) => {
				this.renderFileRow(tBody, file)
			})
			this.leaf.appendChild(tableRoot)
		})
	}

	renderFileRow(tableBodyRoot: HTMLElement, item: ExportProperties) {
		const metaData = item.frontMatter;
		const group = item.toRelativeToExportDirRoot
		const isOpen = (this.plugin.settings.groupOpenMap || {})[group]
		const fileItemRow = tableBodyRoot.createEl('tr', {
			cls: "nav-file tree-item meta-data-table-file-row",
			attr: { 'data-path': item.toRelativeToExportDirRoot, style: isOpen ? '' : 'display: none' }
		});
		if (this.plugin.settings.draftField && metaData[this.plugin.settings.draftField]) {
			fileItemRow.classList.add('draft')
		}

		const linkTd = fileItemRow.createEl('td', {
			cls: 'nav-file-title is-clickable tree-item-self reveal-link',
		})
		// linkTd.append(getIcon('external-link'))

		fileItemRow.addEventListener('click', () => {
			revealInFolder(this.plugin, item.from)
		})

		fileItemRow.addEventListener('dblclick', () => {
			revealInFolder(this.plugin, item.from)
			openFileByPath(this.plugin, item.from)
		})

		this.fieldsToRender.forEach((metaKey) => {
		if (metaKey ==='fileName'){
				this.renderMetaCell(fileItemRow, metaKey, item.newFileName)
			} else {
				this.renderMetaCell(fileItemRow, metaKey, metaData[metaKey])
			}
		})
	}


	renderFolderHeaderRow(tableBodyRoot: HTMLElement, group: string, exportGroupMap: ExportGroupMap) {
		const pathHeader = tableBodyRoot.createEl('tr', { cls: "table-sub-header tree-item" });

		const isOpen = (this.plugin.settings.groupOpenMap || {})[group]

		// TODO: get the full path of the folder here
		const pathHeaderTd = pathHeader.createEl('td', {
			attr: { colspan: Object.keys(this.metaKeysToShow).length + 1 }, cls: isOpen ? '' : 'is-collapsed'
		})

		const title = pathHeaderTd.createDiv({ cls: "nav-folder-title mod-collapsible tree-item-self" });

		const collapseArrow = title.createDiv({
			cls: "nav-folder-collapse-indicator collapse-icon",
		});

		title.createEl('a', {
			cls: "nav-folder-title-content",
			text: group,
		});

		title.append(this.folderHeaderRowStats(exportGroupMap[group]))

		collapseArrow.append(getIcon("chevron-down"));

		pathHeaderTd.addEventListener('click', (evt) => this.collapseHeaderRow(evt, pathHeaderTd, tableBodyRoot, group))
		collapseArrow.addEventListener('click', (evt) => this.collapseHeaderRow(evt, pathHeaderTd, tableBodyRoot, group))
	}

	collapseHeaderRow(event: Event, pathHeaderTd: HTMLElement, tableBodyRoot: HTMLElement, group: string) {
		event.stopPropagation();
		pathHeaderTd.classList.toggle('is-collapsed')
		const isOpen = !pathHeaderTd.classList.contains('is-collapsed')

		this.plugin.settings.groupOpenMap = this.plugin.settings.groupOpenMap || {}
		this.plugin.settings.groupOpenMap[group] = isOpen
		this.plugin.saveSettings()

		const elements = tableBodyRoot.querySelectorAll(`.meta-data-table-file-row[data-path="${group}"]`)
		if (elements) {
			elements.forEach((el: HTMLElement) => el.style.display = isOpen ? 'table-row' : 'none')
		}
	}

	folderHeaderRowStats(list: ExportProperties[]) {
		const allInFolder = list.length
		const metadataWrapper = createSpan({ cls: 'metadata' })

		if (this.plugin.settings.draftField) {
			const draftsInFolder = this.countDraftsInFolder(list)
			const publishedInFolder = allInFolder - draftsInFolder;
			if (draftsInFolder > 0){
				metadataWrapper.title = 'Published / Draft = ' + allInFolder;
				metadataWrapper.createSpan({
					text: String(publishedInFolder),
					cls: 'metadata-published',
				})
				metadataWrapper.append('/')
				metadataWrapper.createSpan({
					text: String(draftsInFolder),
					cls: 'metadata-draft'
				})
			} else {
				metadataWrapper.append(String(allInFolder))
			}
		} else {
			metadataWrapper.append(String(allInFolder))
		}
		return metadataWrapper
	}

	countDraftsInFolder(list: ExportProperties[]): number {
		return list.filter((e) => {
			return Boolean(e.frontMatter[this.plugin.settings.draftField])
		}).length
	}

	renderMetaCell(
		fileItemRow: HTMLElement,
		metaKey: string,
		value: any
	) {
		const td = fileItemRow.createEl('td', { cls: 'data-view-meta-key' })
		if (metaKey === 'tags' && value instanceof Array) {
			value.forEach((tag: string, i) => {
				td.createSpan({ cls: 'tag-link', text: tag })
				if (i < value.length - 1)
					td.createSpan({ text: ', ' })
			})
		} else if ((typeof (value) === 'string') && isHttpUrl(value.trim())) {
			createLink(td, value, '🔗 ' + new URL(value).hostname, value)
			// There is no space in it: can be a date or a string.
		} else if (value && (typeof (value) === 'string') && value.indexOf(' ') === -1) {
			// Try if this is a date
			if (isValidDate(new Date(value))) {
				const date = new Date(value)
				let display = date.toLocaleDateString(OVERWRITE_LOCALE)
				// Smart hide time, if it's just a date
				if (!(date.getUTCHours() === 0 && date.getMinutes() === 0)) {
					display += ' ' + date.toLocaleTimeString()
				}
				td.createSpan({ cls: 'meta-value', text: display, attr: { title: value } })
			} else {
				td.createSpan({ text: value })
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

	remove(){
		this.leaf.remove();
	}
}

function isValidDate(date: Date) {
	return date instanceof Date && isFinite(+date);
}

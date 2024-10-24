/**
 * Draws an export grouped by the export path.
 * Handles collapse and open.
 */

import { Notice } from "obsidian";
import { revealInFolder } from "../obsidian-api-helpers/file-explorer";
import { getIcon } from "../obsidian-api-helpers/get-icon";
import { createLink, isHttpUrl } from "./url";
import { openFileByPath } from "src/obsidian-api-helpers/file-by-path";
import { URL } from "url";
import { getGroups } from "src/export/exporter";
import { ExportGroupMap, ExportMap, ExportProperties } from "src/models/export-properties";
import { getMetaFields } from "src/utils/indexing/folder-meta";
import BulkExporterPlugin from "src/main";
import { without } from "underscore";
import { HeaderFieldSelectorModal } from "./header-selector-modal";
import { BulkExportSettings } from "src/models/bulk-export-settings";
import openSettingsPage from "src/obsidian-api-helpers/open-settings-page";
import { showFolderInSystemBrowserAbsolute } from "src/obsidian-api-helpers/show-in-folder";
import { isAbsolute, join } from "path";
import { statusIcon } from "./status-icon";

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
	isPublishedField: string;
	fieldsToRender: Array<string>;
	settings: BulkExportSettings;

	constructor(
		leaf: HTMLElement,
		exportMap: ExportMap,
		settings: BulkExportSettings,
		plugin: BulkExporterPlugin
	) {
		const resultListEl = leaf.createEl("div", {
			cls: "nav-files-container meta-data-view-table-container",
		});

		this.leaf = resultListEl
		this.settings = settings
		this.plugin = plugin
		this.exportMap = exportMap
		this.groupMap = getGroups(exportMap)
		this.metaKeysToShow = getMetaFields(exportMap)
		this.metaFields = ['fileName'].concat(Object.keys(this.metaKeysToShow))

		// Put the draftField to the beginning, next to the filename.
		if (this.settings.isPublishedField) {
			delete this.metaKeysToShow[this.settings.isPublishedField]
			this.isPublishedField = this.settings.isPublishedField;
			this.metaFields = ['fileName', this.settings.isPublishedField].concat(Object.keys(this.metaKeysToShow))
		}

		this.metaFieldsWithoutFileName = without(this.metaFields, 'fileName')

		this.render()
	}

	render() {
		if (this.settings.headerFieldsToShow?.length) {
			this.fieldsToRender = this.settings.headerFieldsToShow
		} else {
			this.fieldsToRender = this.metaFieldsWithoutFileName
		}

		this.leaf.innerHTML = ''
		const preHeader = this.leaf.createEl('h2', { text: this.settings.name })
		const tableRoot = this.leaf.createEl('table', { cls: "dataview table-view-table" });
		const tableHead = tableRoot.createEl('thead', { cls: "table-view-thead" })
		const tableHeadTr = tableHead.createEl('tr', { cls: "table-view-tr-header" })

		tableHeadTr.createEl('th', {
			cls: 'table-view-th debug-column',
			attr: { 'data-column-id': 'fileName' },
		})

		const preHeaderButtons = preHeader.createSpan({ cls: 'table-header-buttons' })
		const editHeaderFieldsLink = preHeaderButtons.createEl('span', {
			cls: 'clickable table-header-link',
			title: 'Edit Visible Header Fields'
		})
		editHeaderFieldsLink.append(getIcon('eye'));

		const editSettingsLink = preHeaderButtons.createEl('span', {
			cls: 'clickable table-header-link',
			title: 'Edit Export Settings'
		})
		editSettingsLink.append(getIcon('settings'));
		editSettingsLink.addEventListener('click', () => {
			this.plugin.settings.selected = this.plugin.settings.items.indexOf(this.settings)
			openSettingsPage("bulk-exporter", this.plugin);
		})

		const openOutputFolderLink = preHeaderButtons.createEl('span', {
			cls: 'clickable table-header-link',
			title: 'Open Output Folder'
		})
		openOutputFolderLink.append(getIcon('folder-open'));
		openOutputFolderLink.addEventListener('click', () => {
			// first, check if the output folder is absolute

			if (isAbsolute(this.settings.outputFolder)){
				showFolderInSystemBrowserAbsolute(this.plugin, this.settings.outputFolder)
			} else {
				const outputFolder = join(process.cwd(), this.settings.outputFolder) + '/'
				showFolderInSystemBrowserAbsolute(this.plugin, outputFolder)
			}
		})

		// Header
		this.fieldsToRender.forEach((name) => {
			const tableHeadTh = tableHeadTr.createEl('th', {
				cls: 'table-view-th', attr: { 'data-column-id': name }
			})
			tableHeadTr.append(tableHeadTh)
			tableHeadTh.createSpan({ text: name })
		})

		editHeaderFieldsLink.addEventListener('click', () => {
			new HeaderFieldSelectorModal(this.plugin, this.settings, this.metaFields, () => {
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
		const isOpen = (this.settings.groupOpenMap || {})[group]
		const fileItemRow = tableBodyRoot.createEl('tr', {
			cls: "nav-file tree-item meta-data-table-file-row",
			attr: { 'data-path': item.toRelativeToExportDirRoot, style: isOpen ? '' : 'display: none' }
		});
		if (this.settings.isPublishedField && !metaData[this.settings.isPublishedField]) {
			fileItemRow.classList.add('draft')
		}

		const linkTd = fileItemRow.createEl('td', {
			cls: 'nav-file-title tree-item-self debug-column',
		})

		statusIcon(linkTd, item, this.settings, this.plugin)


		fileItemRow.addEventListener('click', () => {
			revealInFolder(this.plugin, item.from)
		})

		fileItemRow.addEventListener('dblclick', () => {
			revealInFolder(this.plugin, item.from)
			openFileByPath(this.plugin, item.from)
		})

		this.fieldsToRender.forEach((metaKey) => {
			if (metaKey === 'fileName') {
				this.renderMetaCell(fileItemRow, metaKey, item.newFileName)
			} else {
				this.renderMetaCell(fileItemRow, metaKey, metaData[metaKey])
			}
		})
	}

	renderFolderHeaderRow(tableBodyRoot: HTMLElement, group: string, exportGroupMap: ExportGroupMap) {
		const pathHeader = tableBodyRoot.createEl('tr', { cls: "table-sub-header tree-item" });

		const isOpen = (this.settings.groupOpenMap || {})[group]

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

		this.settings.groupOpenMap = this.settings.groupOpenMap || {}
		this.settings.groupOpenMap[group] = isOpen
		this.plugin.saveSettings()

		const elements = tableBodyRoot.querySelectorAll(`.meta-data-table-file-row[data-path="${group}"]`)
		if (elements) {
			elements.forEach((el: HTMLElement) => el.style.display = isOpen ? 'table-row' : 'none')
		}
	}

	folderHeaderRowStats(list: ExportProperties[]) {
		const allInFolder = list.length
		const metadataWrapper = createSpan({ cls: 'metadata' })

		if (this.settings.isPublishedField) {
			const publishedInFolder = this.publishedInFolder(list)
			const draftsInFolder = allInFolder - publishedInFolder;
			if (publishedInFolder > 0) {
				metadataWrapper.title = 'Published / Draft SUM = ' + allInFolder;
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

	publishedInFolder(list: ExportProperties[]): number {
		return list.filter((e) => {
			return Boolean(e.frontMatter[this.settings.isPublishedField])
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
		} else if ((typeof (value) === 'string') && isNumber(value)) {
			td.createSpan({ text: value, cls: 'number' })
		} else if (value && (typeof (value) === 'string') && value.indexOf(' ') === -1) {
			// Try if this is a date
			if (isValidDate(new Date(value))) {
				const date = new Date(value)
				let display = date.toLocaleDateString(OVERWRITE_LOCALE)
				// Smart hide time, if it's just a date
				if (!(date.getHours() === 0 && date.getMinutes() === 0)) {
					display += ' ' + date.toLocaleTimeString()
				}
				td.createSpan({ cls: 'meta-value date', text: display, attr: { title: value } })
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


	remove() {
		this.leaf.remove();
	}
}



function isNumber(string: string) {
	return string.match(/^[0-9]+\.?[0-9]*$/)
}

function isValidDate(date: Date) {
	return date instanceof Date && isFinite(+date);
}

import { openFileByPath } from "src/obsidian-api-helpers/file-by-path";
import { getIcon } from "src/obsidian-api-helpers/get-icon";
import { ExportProperties } from "src/models/export-properties";
import BulkExporterPlugin from "src/main";

import { error, log } from "src/utils/log";
import { AttachmentLink, LinkType } from "./get-links-and-attachments";

/**
 * One file that could not be exported at all, plus whatever we know about why.
 * `exportSelection` collects these instead of letting the first throw abort the
 * whole batch.
 * @see https://github.com/symunona/obsidian-bulk-exporter/issues/17
 */
export interface ExportFailure {
    /** The file that never made it out. */
    exportProperties: ExportProperties;
    /** What was thrown, as text. */
    message: string;
    /** The link(s) blamed for it, if the failure could be pinned on one. */
    links: Array<AttachmentLink>;
}

/**
 * I want great logging per file, with all the info.
 * For easy debugging and preserving sanity.
 * @param allAssetsExported
 * @param plugin
 * @param failures files that threw and were skipped - reported in red, at the end.
 */
export function exportedLogEntry(
    outputPathMap: { [path: string]: Array<ExportProperties> },
    plugin: BulkExporterPlugin,
    failures: Array<ExportFailure> = []
) {
    let errorCount = 0;

    const root = createDiv({ text: 'Export Structure', cls: 'pull-in' })

    Object.keys(outputPathMap).sort().forEach((pathKey) => {
        const arrayOfFiles = outputPathMap[pathKey]
        const pathContainer = root.createDiv()
        const pathToggler = pathContainer.createDiv({ cls: 'clickable', text: `${pathKey} (${arrayOfFiles.length})` })
        pathToggler.addEventListener("click", () => pathFileListElement.classList.toggle('export-stats-open'));
        const pathFileListElement = pathContainer.createDiv({ cls: 'export-stats' })
        for (let i = 0; i < arrayOfFiles.length; i++) {
            const fileExportProperties = outputPathMap[pathKey][i]
            if (!fileExportProperties) return;

            // Depending on whether there were errors, let's change the color in the log!
            const linkToFileElement = createDiv({ cls: 'clickable', text: fileExportProperties.toRelative });
            const imageCount = (fileExportProperties.imageInBody?.length || 0) + (fileExportProperties.imageInMeta?.length || 0)
            const exportStats = createDiv({
                text: `${fileExportProperties.linkStats?.length || 0} Local links, ${imageCount} images.`,
                cls: 'export-stats'
            })
            exportStats.classList.add('pull-in')
            const linkButton = exportStats.createEl('a')
            const newLink = getIcon('external-link')
            linkButton.append(newLink)
            linkButton.addEventListener('click', () => openFileByPath(plugin, fileExportProperties.from))

            linkToFileElement.addEventListener("click", () => exportStats.classList.toggle('export-stats-open'));

            // Links
            const linkStatContainer = exportStats.createDiv({ text: `Links found: ${fileExportProperties.linkStats?.length || 0}` })
            fileExportProperties.linkStats?.forEach((linkStat) => {
                const link = linkStatContainer.createDiv({
                    cls: 'pull-in clickable',
                    text: `${linkStat.linkType} `
                })
                const linkText = link.createEl('a', { text: linkStat.text || linkStat.originalPath || linkStat.newPath, title: linkStat.originalPath + ' -> ' + linkStat.newPath })
                linkText.append(getIcon('external-link'))

                linkText.addEventListener('click', (evt) => {
                    evt.stopPropagation();
                    if (linkStat.linkType === LinkType.external) {
                        window.open(linkStat.originalPath)
                    } else {
                        openFileByPath(plugin, linkStat.originalPath)
                    }
                })
            })

            // Assets
            const assetStatContainer = exportStats.createDiv({ text: `Image From Body Copied: ${fileExportProperties.imageInBody?.length || 0}` })

            fileExportProperties.imageInBody?.forEach((asset) => {
                const fileAssetElement = fileAssetElementCreator(asset, errorCount, plugin)
                errorCount = fileAssetElement.errorCount
                if (errorCount > 0) { console.error(asset) }
                assetStatContainer.append(fileAssetElement.assetElement)
            })

            fileExportProperties.imageInMeta?.forEach((asset) => {
                const fileAssetElement = fileAssetElementCreator(asset, errorCount, plugin)
                errorCount = fileAssetElement.errorCount
                if (errorCount > 0) { console.error(asset) }
                assetStatContainer.append(fileAssetElement.assetElement)
            })

            if (fileExportProperties.copyGlob && Object.keys(fileExportProperties.copyGlob).length) {
                const globContainer = assetStatContainer.createDiv({ text: 'copy globs' })

                Object.keys(fileExportProperties.copyGlob || {}).forEach((globKey) => {
                    if (!globKey || !fileExportProperties.copyGlob) return
                    const arrayOfAssets = fileExportProperties.copyGlob[globKey]
                    const globGroupContainer = globContainer.createDiv({
                        cls: 'pull-in',
                        text: `${globKey} (${arrayOfAssets.length})`
                    })
                    arrayOfAssets.forEach((asset) => {
                        const fileAssetElement = fileAssetElementCreator(asset, errorCount, plugin)
                        errorCount = fileAssetElement.errorCount
                        if (errorCount > 0) { console.error(asset) }
                        if (asset.source === 'folder') {
                            globGroupContainer.append(createSpan('[Folder] '))
                        }
                        globGroupContainer.append(fileAssetElement.assetElement)
                    })
                })
            }

            const container = createSpan({ 'text': '' })
            container.append(linkToFileElement, exportStats)
            if (errorCount) {
                container.classList.add('error')
                container.append(createSpan({ text: ` ${errorCount} errors` }))
            }
            pathFileListElement.append(container)
        }
    })
    log(root);

    if (failures.length) {
        logExportFailures(failures);
    }
}

/**
 * The export finished, but not everything made it out. Say so, loudly, naming
 * every file we dropped and - where we could pin it down - the link that did it.
 */
function logExportFailures(failures: Array<ExportFailure>) {
    const root = createDiv({
        cls: 'pull-in',
        text: `${failures.length} file(s) could not be exported:`
    })
    failures.forEach((failure) => {
        const fileElement = root.createDiv({
            cls: 'pull-in error',
            text: `${failure.exportProperties.from} - ${failure.message}`
        })
        failure.links.forEach((link) => {
            fileElement.createDiv({
                cls: 'pull-in',
                text: `link: [${link.text}] -> ` +
                    `${link.normalizedOriginalPath || link.originalPath} - ${link.error}`
            })
        })
    })
    error(root);
}

function fileAssetElementCreator(asset: AttachmentLink, errorCount: number, plugin: BulkExporterPlugin) {
    const assetElement = createEl('a', {
        cls: 'clickable-link',
        title: asset.newPath,
        text: `${asset.originalPath || asset.newPath}`
    })
    if (asset.count && asset.count > 1) {
        assetElement.innerText += ` (${asset.count})`
    }
    assetElement.classList.add('pull-in')
    if (asset.status === 'assetNotFound') {
        errorCount++;
        assetElement.classList.add('error')
    } else {
        assetElement.addEventListener('click', (evt) => {
            evt.stopPropagation(); openFileByPath(plugin, asset.originalPath)
        })
    }
    return {
        assetElement,
        errorCount
    }
}

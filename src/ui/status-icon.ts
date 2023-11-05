/**
 * Create a status icon if appropriate
 * - draft: do not show anything
 * - exportedAlready:
 *      show last export status:
 *       - modified since last export:
 *          - yellow document draft
 *       - else
 *          - if there was a bug
 *             - bug icon with info
 *          - else
 *             - check: everything is allright
 *
 * - not exported:
 *      new grey icon
 */

import { LinkParseResults } from "src/export/get-links-and-attachments";
import { BulkExportSettings } from "src/models/bulk-export-settings";
import { ExportProperties } from "src/models/export-properties";
import { getIcon } from "src/obsidian-api-helpers/get-icon";
import { StatsModal } from "./stats-modal";
import BulkExporterPlugin from "src/main";

export function statusIcon(root: HTMLElement, item: ExportProperties, settings: BulkExportSettings, plugin: BulkExporterPlugin) {
    // Draft
    if (settings.isPublishedField) {
        if (!item.frontMatter[settings.isPublishedField]) {
            return;
        }
    }

    const iconSpanAddedAlready = root.createSpan({ cls: 'status-icon' })
    // Not draft
    // is Already Exported?
    const alreadyExported: ExportProperties = settings.lastExport[item.file?.path]
    iconSpanAddedAlready.addEventListener('click', ()=>{
        new StatsModal(plugin, alreadyExported || item).open()
    })

    if (alreadyExported) {
        if (modifiedSinceLastExport(item, alreadyExported)) {
            iconSpanAddedAlready.classList.add("orange");
            iconSpanAddedAlready.append(getIcon("file-plus"));
            iconSpanAddedAlready.title = "Modified Since Last Export";
        } else {
            const hadErrorsLastExport = hadErrors(alreadyExported)
            if (!hadErrorsLastExport) {
                iconSpanAddedAlready.classList.add("green");
                iconSpanAddedAlready.append(getIcon("check-circle"));
                iconSpanAddedAlready.title = "Up to date"
            } else {
                // Show errors
                root.classList.add('warn')

                const bugButton = iconSpanAddedAlready.createSpan({ title: JSON.stringify(hadErrorsLastExport, null, 2) })
                bugButton.append(getIcon('bug'))
            }

        }
    }
}


function hadErrors(alreadyExported: ExportProperties) {
    if (!alreadyExported.linksAndAttachments) { return false }
    const debugInfo = getDebugInfo(alreadyExported.linksAndAttachments)
    const errors = debugInfo.internalAttachmentsError.length ||
        debugInfo.internalHeaderAttachmentsError.length ||
        debugInfo.internalLinksError.length;
    return errors ? debugInfo : false
}

function modifiedSinceLastExport(item: ExportProperties, alreadyExported: ExportProperties) {
    const lastModifyDateOfFile = new Date(item.file?.mtime).getTime();
    const lastExportedDate = new Date(
        alreadyExported.lastExportDate
    ).getTime();

    return lastModifyDateOfFile !== lastExportedDate
}

function getDebugInfo(linksAndAttachments: LinkParseResults) {
    const internalLinksError = linksAndAttachments.internalLinks
        .filter((l) => l.error)
        .map(l => l.normalizedOriginalPath + ' - ' + l.error)
    const internalAttachmentsError = linksAndAttachments.internalAttachments
        .filter((l) => l.error)
        .map(l => l.normalizedOriginalPath + ' - ' + l.error)
    const internalHeaderAttachmentsError = linksAndAttachments.internalHeaderAttachments
        .filter((l) => l.error)
        .map(l => l.normalizedOriginalPath + ' - ' + l.error)

    return {
        internalLinksError,
        internalAttachmentsError,
        internalHeaderAttachmentsError
    }
}

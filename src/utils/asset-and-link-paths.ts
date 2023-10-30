import { dirname, join } from "path";
import { BulkExportSettings } from "src/models/bulk-export-settings";
import { ExportProperties } from "src/models/export-properties";

export function getAssetPaths(
    exportProperties: ExportProperties,
    settings: BulkExportSettings) {

    const assetFolderName = settings.assetPath || 'assets'

    // Create asset dir if not exists
    let toDir = join(dirname(exportProperties.toAbsoluteFs), assetFolderName);
    let toDirRelative = assetFolderName

    // In case of absolute export, use root in the links.
    if (settings.absoluteAssets) {
        toDirRelative = '/' + assetFolderName
        toDir = join(settings.outputFolder, assetFolderName)
    }
    return {
        toDir,
        toDirRelative
    }
}
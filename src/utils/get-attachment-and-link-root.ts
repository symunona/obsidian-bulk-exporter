import { join, relative } from "path";
import { AttachmentLink, AttachmentLinkStatus } from "src/export/get-links-and-attachments";
import { BulkExportSettings } from "src/models/bulk-export-settings";
import { ExportProperties } from "src/models/export-properties";


/**
 *
 * @param exportProperties
 * @param settings
 */
export function getAssetFolder(exportProperties: ExportProperties, settings: BulkExportSettings){
    if (settings.absoluteAssets){
        return join(exportProperties.relativeRoot, settings.assetPath || 'assets')
    } else {
        return join(exportProperties.toRelativeToExportDirRoot, settings.assetPath || 'assets')
    }
}

export function getLinkUrl(exportProperties: ExportProperties, link: AttachmentLink){

    const fromAbsolute = exportProperties.toRelativeToExportDirRoot
    const base = exportProperties.relativeRoot;
    const fromAbsoluteToRoot = relative(fromAbsolute, base)

    if (exportProperties.toRelativeToExportDirRoot.startsWith(exportProperties.relativeRoot)){
        const base = exportProperties.toRelativeToExportDirRoot.substring(exportProperties.relativeRoot.length)
        
    }

    throw new Error('Not Implemented yet! Happy path is when the relativeRoot is part of the file root.')

    // This is tough.
    return 
}

// base to file ->
// base to target ->
// find the largest

// frabs path/to/file/out
// base  asdf/cdt                      X
// frrel ../../path/to/file/out
// toabs path/to/aaa
// torel ../../path/to/aaa

// frabs path/to/file/out
// base  path                          !
// frrel to/file/out
// toabs path/asdf/ccc
// torel asdf/ccc

// frabs path/to/file
// base  path/to
// frrel file
// toabs something
// torel ../../something

// frabs path/to/file
// base  path
// frrel file
// toabs something
// torel ../something

// frabs path/to/file
// base  path/to
// frrel file
// toabs path/something
// torel ../something

// frabs path/to/file
// base  path/to
// frrel file
// toabs path/something
// torel ../something

// frabs path/to/file
// base  path/to
// frrel file
// toabs path/to/xxx/something
// torel xxx/something



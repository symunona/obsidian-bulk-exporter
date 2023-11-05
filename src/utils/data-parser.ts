import { BulkExportSettingsList, DEFAULT_SETTINGS } from "../models/bulk-export-settings";

export function parseSavedSettingsData(storedData: any): BulkExportSettingsList{

    if (storedData) {
        // Backward Compatibility: if it's not an array, it's the old BulkExportSettings.
        if (!(storedData.items instanceof Array)) {
            return {
                selected: 0,
                preview: 'all',
                items: [Object.assign(
                    {},
                    DEFAULT_SETTINGS,
                    storedData
                )]
            }
        }
        else {
            const settings = Object.assign({items: [], selected: 0, preview: 'all'}, storedData);
            if (!settings.items.length) {
                settings.items.push(Object.assign({}, DEFAULT_SETTINGS))
            }
            return settings;
        }
    } else {
        return {
            selected: 0,
            preview: 'all',
            items: [
                Object.assign({}, DEFAULT_SETTINGS)
            ]
        }
    }
}
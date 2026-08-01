import { BulkExportSettingsList, DEFAULT_SETTINGS } from "../models/bulk-export-settings";

/**
 * `storedData` is whatever Obsidian's `loadData()` gave us back: free-form JSON
 * that is either absent, the current `BulkExportSettingsList`, or the legacy
 * single `BulkExportSettings` object.
 */
export function parseSavedSettingsData(storedData?: Record<string, unknown> | null): BulkExportSettingsList{

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
            const defaults: BulkExportSettingsList = {items: [], selected: 0, preview: 'all'};
            const settings: BulkExportSettingsList = { ...defaults, ...storedData };
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
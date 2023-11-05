import oldData from "./old-data.json"
import { BulkExportSettings, DEFAULT_SETTINGS } from "../models/bulk-export-settings"
import { parseSavedSettingsData } from "../utils/data-parser"


describe('parse old data object', () => {
    it('should work with empty undefined', () => {
        testIfHasEveryField(parseSavedSettingsData(undefined))
    })
    it('should work with empty object', () => {
        testIfHasEveryField(parseSavedSettingsData({}))
    })
    it('should work with empty object', () => {
        testIfHasEveryField(parseSavedSettingsData(oldData))
    })
    it('populate default on empty', () => {
        testIfHasEveryField(parseSavedSettingsData({items: []}))
    })
})



function testIfHasEveryField(object: any) {
    ['items', 'selected', 'preview'].forEach((field) => {
        if (object[field] === undefined) { throw new Error(`${field} does not exist on settings list object`) }
    })
    object.items.forEach((setting: BulkExportSettings) => {
        Object.keys(DEFAULT_SETTINGS).forEach((field: string) => {
            // @ts-ignore
            if ((typeof setting[field]) !== (typeof DEFAULT_SETTINGS[field])) {
                throw new Error(`setting is missing field ${field}`)
            }
        })
    })
}


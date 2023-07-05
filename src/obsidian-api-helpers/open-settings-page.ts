import { Plugin } from "obsidian"

/**
 * Opens settings and navigates to the given plugin settings page.
 * NOTE: Not part of the official API.
 * @param pluginId to be opened
 */
export default function(pluginId: string, plugin: Plugin) {
    // @ts-ignore
    plugin.app.setting.open()
    // @ts-ignore
    plugin.app.setting.openTabById(pluginId)
}
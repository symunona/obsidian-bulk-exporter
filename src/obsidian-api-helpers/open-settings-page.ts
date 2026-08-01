import { App, Plugin } from "obsidian"

/**
 * The app-level settings modal manager. Not part of the official API.
 */
interface AppSetting {
    open(): void;
    openTabById(id: string): void;
}

interface AppWithSetting extends App {
    setting: AppSetting;
}

/**
 * Opens settings and navigates to the given plugin settings page.
 * NOTE: Not part of the official API.
 * @param pluginId to be opened
 */
export default function(pluginId: string, plugin: Plugin) {
    const app = plugin.app as AppWithSetting
    app.setting.open()
    app.setting.openTabById(pluginId)
}

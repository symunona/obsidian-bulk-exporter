/**
 * Opens settings and navigates to the given plugin settings page.
 * @param pluginId to be opened
 */
export default function(pluginId: string) {
    this.app.setting.open()
    this.app.setting.openTabById(pluginId)
}
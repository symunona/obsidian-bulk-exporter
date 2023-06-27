/**
 * Get any plugin settings by id!
 * Do not forget to type check.
 *
 * NOTE: You may just want to get YOUR plugin settings by passing the plugin to your view?
 *
 * @param pluginId to be queried
 * @returns plugin settings
 */
export default function getPluginSettingsById(pluginId: string) {
    return this.app.plugins.plugins[pluginId].settings;
}
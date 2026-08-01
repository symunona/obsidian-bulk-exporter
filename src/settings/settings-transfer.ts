/**
 * Move export configurations between vaults: dump them to a JSON file,
 * read them back on the other side.
 */
import { Notice } from "obsidian";

import BulkExporterPlugin from "src/main";
import {
	BulkExportSettings,
	BulkExportSettingsList,
	DEFAULT_SETTINGS,
} from "src/models/bulk-export-settings";

/**
 * Per export set state that only makes sense in the vault it was created in:
 * the export cache and the open/closed state of the preview groups.
 */
function stripCache(setting: BulkExportSettings): BulkExportSettings {
	return Object.assign({}, DEFAULT_SETTINGS, setting, {
		lastExport: {},
		groupOpenMap: {},
	});
}

export function getTransferableSettings(
	settings: BulkExportSettingsList
): BulkExportSettingsList {
	return {
		selected: settings.selected,
		preview: settings.preview,
		items: settings.items.map(stripCache),
	};
}

/**
 * Reads what a user picked, and normalizes it to the current settings format.
 * Throws with a human readable message if the file is not ours.
 */
export function parseImportedSettings(raw: string): BulkExportSettingsList {
	let parsed;
	try {
		parsed = JSON.parse(raw);
	} catch (e) {
		throw new Error("This is not a valid JSON file.");
	}

	// Accept a single export set as well: that's how the settings looked
	// before multiple export sets were a thing.
	const items = parsed && parsed.items instanceof Array ? parsed.items : [parsed];

	const valid = items.filter(
		(item: any) => item && typeof item === "object" && !(item instanceof Array)
	);
	if (!valid.length) {
		throw new Error("No export settings found in this file.");
	}

	return {
		selected: 0,
		preview: parsed.preview || "all",
		items: valid.map(stripCache),
	};
}

export function downloadSettings(plugin: BulkExporterPlugin) {
	const data = getTransferableSettings(plugin.settings);
	const fileName = `bulk-exporter-settings-${new Date()
		.toISOString()
		.slice(0, 10)}.json`;

	const url = URL.createObjectURL(
		new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
	);
	const link = document.body.createEl("a", { href: url });
	link.download = fileName;
	link.click();
	link.remove();
	// Revoking right away can cancel the download that just started.
	setTimeout(() => URL.revokeObjectURL(url), 10000);

	new Notice(
		`Exported ${data.items.length} export setting${
			data.items.length > 1 ? "s" : ""
		} to ${fileName}`
	);
}

/**
 * Opens a file picker, hands the parsed settings over to the callback.
 */
export function pickSettingsFile(
	callback: (imported: BulkExportSettingsList, fileName: string) => void
) {
	const input = document.createElement("input");
	input.type = "file";
	input.accept = "application/json,.json";
	input.addEventListener("change", async () => {
		const file = input.files && input.files[0];
		if (!file) {
			return;
		}
		try {
			callback(parseImportedSettings(await file.text()), file.name);
		} catch (e) {
			// The log view is not necessarily open, so this goes to the console.
			console.error("Could not import settings", e);
			new Notice(`Could not import settings: ${e.message}`);
		}
	});
	input.click();
}

/**
 * Replaces every export set with the imported ones.
 */
export function overwriteSettings(
	plugin: BulkExporterPlugin,
	imported: BulkExportSettingsList
) {
	plugin.settings.items = imported.items;
	plugin.settings.preview = imported.preview;
	plugin.settings.selected = 0;
}

/**
 * Appends the imported export sets, keeping the existing ones, and selects
 * the first newly added one.
 */
export function extendSettings(
	plugin: BulkExporterPlugin,
	imported: BulkExportSettingsList
) {
	const firstNewIndex = plugin.settings.items.length;
	plugin.settings.items = plugin.settings.items.concat(imported.items);
	plugin.settings.selected = firstNewIndex;
}

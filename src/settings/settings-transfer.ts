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
function stripCache(setting: Partial<BulkExportSettings>): BulkExportSettings {
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
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		throw new Error("This is not a valid JSON file.");
	}

	// A JSON export always round-trips to a plain object; anything else
	// (an array, a primitive) can't hold export settings.
	const parsedObject: Record<string, unknown> | undefined =
		parsed && typeof parsed === "object" && !(parsed instanceof Array)
			? (parsed as Record<string, unknown>)
			: undefined;

	// Accept a single export set as well: that's how the settings looked
	// before multiple export sets were a thing.
	const items: unknown[] =
		parsedObject && parsedObject.items instanceof Array
			? parsedObject.items
			: [parsed];

	const valid = items.filter(
		(item): item is Partial<BulkExportSettings> =>
			typeof item === "object" && item !== null && !(item instanceof Array)
	);
	if (!valid.length) {
		throw new Error("No export settings found in this file.");
	}

	return {
		selected: 0,
		preview:
			typeof parsedObject?.preview === "string" ? parsedObject.preview : "all",
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
	window.setTimeout(() => URL.revokeObjectURL(url), 10000);

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
	const input = createEl("input");
	input.type = "file";
	input.accept = "application/json,.json";

	const onFileChosen = async () => {
		const file = input.files && input.files[0];
		if (!file) {
			return;
		}
		try {
			callback(parseImportedSettings(await file.text()), file.name);
		} catch (e: unknown) {
			// The log view is not necessarily open, so this goes to the console.
			console.error("Could not import settings", e);
			const message = e instanceof Error ? e.message : String(e);
			new Notice(`Could not import settings: ${message}`);
		}
	};
	input.addEventListener("change", () => {
		void onFileChosen();
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

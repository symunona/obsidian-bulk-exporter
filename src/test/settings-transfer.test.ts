import { DEFAULT_SETTINGS } from "../models/bulk-export-settings";
import {
	getTransferableSettings,
	parseImportedSettings,
} from "../settings/settings-transfer";

function settingsList() {
	return {
		selected: 1,
		preview: "all",
		items: [
			Object.assign({}, DEFAULT_SETTINGS, {
				name: "blog",
				lastExport: { "a.md": { toRelativeDir: "blog" } as any },
				groupOpenMap: { blog: true },
			}),
			Object.assign({}, DEFAULT_SETTINGS, { name: "wiki" }),
		],
	};
}

describe("getTransferableSettings", () => {
	test("drops the export cache and the group open state", () => {
		const result = getTransferableSettings(settingsList());
		expect(result.items[0].lastExport).toEqual({});
		expect(result.items[0].groupOpenMap).toEqual({});
	});

	test("keeps the configuration itself", () => {
		const result = getTransferableSettings(settingsList());
		expect(result.items.map((i) => i.name)).toEqual(["blog", "wiki"]);
		expect(result.selected).toBe(1);
	});

	test("does not modify the settings it dumps", () => {
		const original = settingsList();
		getTransferableSettings(original);
		expect(Object.keys(original.items[0].lastExport)).toEqual(["a.md"]);
	});
});

describe("parseImportedSettings", () => {
	test("reads a settings file", () => {
		const raw = JSON.stringify(getTransferableSettings(settingsList()));
		const result = parseImportedSettings(raw);
		expect(result.items.map((i) => i.name)).toEqual(["blog", "wiki"]);
		expect(result.selected).toBe(0);
	});

	test("accepts a single, pre-multi-export-set config", () => {
		const raw = JSON.stringify({ name: "legacy", exportQuery: "blog" });
		const result = parseImportedSettings(raw);
		expect(result.items.length).toBe(1);
		expect(result.items[0].name).toBe("legacy");
		// Missing keys get the defaults, so the settings page can render it.
		expect(result.items[0].assetPath).toBe(DEFAULT_SETTINGS.assetPath);
	});

	test("strips the cache of the imported sets as well", () => {
		const raw = JSON.stringify({
			items: [{ name: "blog", lastExport: { "a.md": {} } }],
		});
		expect(parseImportedSettings(raw).items[0].lastExport).toEqual({});
	});

	test("throws on a non JSON file", () => {
		expect(() => parseImportedSettings("# just a note")).toThrow(
			"not a valid JSON"
		);
	});

	test("throws on JSON that holds no export settings", () => {
		expect(() => parseImportedSettings("[1, 2]")).toThrow(
			"No export settings found"
		);
	});
});

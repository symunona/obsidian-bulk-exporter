/**
 * The `obsidian` npm package only ships types, the implementation lives in the
 * app. This is just enough of it for the pure logic to be testable in jest.
 */
import type { App } from "obsidian";
import { load } from "js-yaml";

// The real parseYaml is js-yaml under the hood too.
export const parseYaml = load;

export class Notice {
	constructor(public message: string) {}
	hide() {}
}

export class Modal {
	// The real Modal only has a contentEl once it is opened by the app.
	contentEl: HTMLElement | null = null;
	constructor(public app: App) {}
	open() {}
	close() {}
}

export class Plugin {}
export class PluginSettingTab {}
export class Setting {}
export class ItemView {}

export const Platform = { isDesktop: true, isMobile: false };

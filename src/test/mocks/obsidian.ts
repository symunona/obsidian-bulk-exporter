/**
 * The `obsidian` npm package only ships types, the implementation lives in the
 * app. This is just enough of it for the pure logic to be testable in jest.
 */
export class Notice {
	constructor(public message: string) {}
	hide() {}
}

export class Modal {
	contentEl: any = null;
	constructor(public app: any) {}
	open() {}
	close() {}
}

export class Plugin {}
export class PluginSettingTab {}
export class Setting {}
export class ItemView {}

export const Platform = { isDesktop: true, isMobile: false };

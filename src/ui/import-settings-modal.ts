import { App, Modal } from "obsidian";

import { BulkExportSettingsList } from "src/models/bulk-export-settings";

type ImportSettingsModalOptions = {
	fileName: string;
	imported: BulkExportSettingsList;
	existingCount: number;
	overwriteCallback: () => void;
	extendCallback: () => void;
};

/**
 * Asks what to do with a settings file the user just picked: replace what is
 * in this vault, or add the new export sets next to the existing ones.
 */
export class ImportSettingsModal extends Modal {
	options: ImportSettingsModalOptions;

	constructor(app: App, options: ImportSettingsModalOptions) {
		super(app);
		this.options = options;
	}

	onOpen() {
		const { fileName, imported, existingCount } = this.options;

		this.contentEl.classList.add("bulk-export-import-settings");
		this.contentEl.createEl("h3", { text: "Import export settings" });
		this.contentEl.createEl("p", {
			text: `${fileName} contains ${imported.items.length} export setting${
				imported.items.length > 1 ? "s" : ""
			}: ${imported.items.map((i) => i.name || "no-name").join(", ")}`,
		});
		this.contentEl.createEl("p", {
			text: `This vault currently has ${existingCount}. Overwrite replaces them, add keeps both.`,
		});

		const footer = this.contentEl.createDiv({ cls: "footer" });

		const cancelBtn = footer.createEl("button", {
			text: "Cancel",
			cls: "cancel",
		});
		cancelBtn.addEventListener("click", () => this.close());

		const extendBtn = footer.createEl("button", {
			text: "Add to existing",
		});
		extendBtn.addEventListener("click", () => {
			this.options.extendCallback();
			this.close();
		});

		const overwriteBtn = footer.createEl("button", {
			text: "Overwrite",
			cls: "danger",
		});
		overwriteBtn.addEventListener("click", () => {
			this.options.overwriteCallback();
			this.close();
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}

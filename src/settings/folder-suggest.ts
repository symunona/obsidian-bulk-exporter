import { AbstractInputSuggest, App, TFolder } from "obsidian";

/**
 * Dropdown autocomplete over the vault's real folders, attachable to a
 * text input or textarea. Selection only fills the field — free text for
 * not-yet-existing folders stays allowed.
 */
export class FolderSuggest extends AbstractInputSuggest<TFolder> {
	private inputEl: HTMLInputElement | HTMLTextAreaElement;

	constructor(app: App, inputEl: HTMLInputElement | HTMLTextAreaElement) {
		super(app, inputEl as HTMLInputElement);
		this.inputEl = inputEl;
	}

	getSuggestions(query: string): TFolder[] {
		const q = query.toLowerCase();
		return this.app.vault
			.getAllLoadedFiles()
			.filter(
				(f): f is TFolder =>
					f instanceof TFolder && f.path.toLowerCase().includes(q)
			)
			.sort((a, b) => a.path.localeCompare(b.path));
	}

	renderSuggestion(folder: TFolder, el: HTMLElement): void {
		el.setText(folder.path);
	}

	selectSuggestion(folder: TFolder): void {
		this.inputEl.value = folder.path;
		// Fire input so the TextComponent onChange handler runs and the
		// setting actually gets saved.
		this.inputEl.dispatchEvent(new Event("input"));
		this.close();
	}
}

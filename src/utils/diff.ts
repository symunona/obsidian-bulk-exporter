import { ParsedDiff, diffWords, structuredPatch } from "diff";
import { readFileSync } from "fs";
import { ExportProperties } from "src/models/export-properties";
import { preventEmptyString } from "./diff-utils";
import BulkExporterPlugin from "src/main";

// These are from https://github.com/friebetill/obsidian-file-diff

export class Difference {
	constructor(args: {
		file1Start: number;
		file2Start: number;
		file1Lines: string[];
		file2Lines: string[];
	}) {
		this.file1Start = args.file1Start;
		this.file2Start = args.file2Start;
		this.file1Lines = args.file1Lines;
		this.file2Lines = args.file2Lines;
	}

	public readonly file1Start: number;

	public readonly file2Start: number;

	public readonly file1Lines: string[];

	public readonly file2Lines: string[];
}


export class FileDifferences {
	private constructor(args: {
		file1Name?: string;
		file2Name?: string;
		differences: Difference[];
	}) {
		this.file1Name = args.file1Name;
		this.file2Name = args.file2Name;
		this.differences = args.differences;
	}
    public readonly file1Name?: string;

	public readonly file2Name?: string;

	public readonly differences: Difference[];


	/**
	 * Returns a FileDifferences object from the given ParsedDiff instance.
	 *
	 * Why create a new data structure if parsedDiff already exists?
	 *
	 * The FileDifferences class was created because there was a limitation in
	 * the existing ParsedDiff class from the diff library for my use case. The
	 * hunk object in the ParsedDiff class can contain multiple separated line
	 * differences, which is problematic because I wanted to display a separate
	 * action line for each contiguous change and thus allow for more precise
	 * selection of changes. Additionally, the user needs to be able to apply
	 * the changes one by one and so I have to keep a state where only one
	 * contiguous change but is applied. To solve this, I considered two
	 * options: removing the contiguous change directly in the hunk object or
	 * introducing a new data structure with a finer granularity. I ultimately
	 * chose the latter option as it seemed simpler.
	 */
	static fromParsedDiff(parsedDiff: ParsedDiff): FileDifferences {
		const differences: Difference[] = [];

		parsedDiff.hunks.forEach((hunk) => {
			let line1Count = 0;
			let line2Count = 0;
			for (let i = 0; i < hunk.lines.length; i += 1) {
				const line = hunk.lines[i];

				if (line.startsWith('+') || line.startsWith('-')) {
					const start = i;

					// Find the end of the contiguous lines
					let end = start;
					while (
						end < hunk.lines.length - 1 &&
						(hunk.lines[end + 1].startsWith('+') ||
							hunk.lines[end + 1].startsWith('-'))
					) {
						end += 1;
					}

					// Add the contiguous lines to the differences
					const file1Lines = hunk.lines
						.slice(start, end + 1)
						.filter((l) => l.startsWith('-'))
						.map((l) => l.slice(1));
					const file2Lines = hunk.lines
						.slice(start, end + 1)
						.filter((l) => l.startsWith('+'))
						.map((l) => l.slice(1));
					differences.push(
						new Difference({
							file1Start: hunk.oldStart + start - line2Count - 1,
							file2Start: hunk.newStart + start - line1Count - 1,
							file1Lines,
							file2Lines,
						})
					);

					line1Count += file1Lines.length;
					line2Count += file2Lines.length;
					i += end - start;
				}
			}
		});

		return new this({
			file1Name: parsedDiff.oldFileName,
			file2Name: parsedDiff.newFileName,
			differences,
		});
	}
}

export class DiffView {
	private fileDifferences: FileDifferences;

	private file1Lines: string[];

	private file2Lines: string[];

    private contentEl: HTMLElement;

    constructor(content: HTMLElement, item: ExportProperties, plugin: BulkExporterPlugin){
        const diffDom = content.createDiv()

        diffDom.createEl('h3', {text: 'Diff'})
        const fromToDom = diffDom.createDiv()
        fromToDom.createEl('span', {text: item.from})
        fromToDom.createSpan({text: ' => '})
        fromToDom.createEl('span', {text: item.toRelative})

        this.contentEl = diffDom
        this.load(item, plugin)
    }

    async load(item: ExportProperties, plugin: BulkExporterPlugin){
        const diffContentDom = this.contentEl.createDiv({
            cls: 'file-diff__container',
        })
        this.file1Lines = (await plugin.app.vault.adapter.read(item.from)).split('\n');
        this.file2Lines = readFileSync(item.toAbsoluteFs, 'utf-8').split('\n');

        const parsedDiff = structuredPatch(
            item.from,
            item.toAbsoluteFs,
            this.file1Lines.join('\n'),
            this.file2Lines.join('\n')
        );
        this.fileDifferences = FileDifferences.fromParsedDiff(parsedDiff);

        this.buildLines(diffContentDom);

        this.scrollToFirstDifference();
    }

	private buildLines(container: HTMLDivElement): void {
		let lineCount1 = 0;
		let lineCount2 = 0;
		const maxLineCount = Math.max(this.file1Lines.length, this.file2Lines.length)
		while (lineCount1 <= maxLineCount || lineCount2 <= maxLineCount) {
			const difference = this.fileDifferences.differences.find(
				// eslint-disable-next-line no-loop-func
				(d) =>
					d.file1Start === lineCount1 && d.file2Start === lineCount2
			);

			if (difference != null) {
				const differenceContainer = container.createDiv({
					cls: 'difference',
				});
				this.buildDifferenceVisualizer(differenceContainer, difference);
				lineCount1 += difference.file1Lines.length;
				lineCount2 += difference.file2Lines.length;
			} else {
				const line =
					lineCount1 <= lineCount2
						? this.file1Lines[lineCount1]
						: this.file2Lines[lineCount2];
				container.createDiv({
					// Necessary to give the line a height when it's empty.
					text: preventEmptyString(line),
					cls: 'file-diff__line',
				});
				lineCount1 += 1;
				lineCount2 += 1;
			}
		}
	}

	private buildDifferenceVisualizer(
		container: HTMLDivElement,
		difference: Difference
	): void {
		// Draw top diff
		for (let i = 0; i < difference.file1Lines.length; i += 1) {
			const line1 = difference.file1Lines[i];
			const line2 = difference.file2Lines[i];

			const lineDiv = container.createDiv({ cls: 'file-diff__line file-diff__top-line__bg' });
			const diffSpans = this.buildDiffLine(line1, line2, 'file-diff_top-line__character');

			// Remove border radius if applicable
			if (i < difference.file1Lines.length - 1 || difference.file2Lines.length !== 0) {
				lineDiv.classList.add('file-diff__no-bottom-border');
			}
			if (i !== 0) {
				lineDiv.classList.add('file-diff__no-top-border');
			}

			lineDiv.appendChild(diffSpans);
		}

		// Draw bottom diff
		for (let i = 0; i < difference.file2Lines.length; i += 1) {
			const line1 = difference.file1Lines[i];
			const line2 = difference.file2Lines[i];

			const lineDiv = container.createDiv({ cls: 'file-diff__line file-diff__bottom-line__bg' });
			const diffSpans = this.buildDiffLine(line2, line1, 'file-diff_bottom-line__character');

			// Remove border radius if applicable
			if ((i == 0 && difference.file1Lines.length > 0) || i > 0) {
				lineDiv.classList.add('file-diff__no-top-border');
			}
			if (i < difference.file2Lines.length - 1) {
				lineDiv.classList.add('file-diff__no-bottom-border');
			}

			lineDiv.appendChild(diffSpans);
		}
	}

	private buildDiffLine(line1: string, line2: string, charClass: string) {
		const fragment = document.createElement('div');

		if (line1 != undefined && line1.length === 0) {
			fragment.textContent = preventEmptyString(line1);
		} else if (line1 != undefined && line2 != undefined) {
			const differences = diffWords(line2, line1);

			for (const difference of differences) {
				if (difference.removed) {
					continue;
				}

				const span = document.createElement('span');
				// Necessary to give the line a height when it's empty.
				span.textContent = preventEmptyString(difference.value);
				if (difference.added) {
					span.classList.add(charClass);
				}
				fragment.appendChild(span);
			}
		} else if(line1 != undefined && line2 == undefined) {
			const span = document.createElement('span');
			// Necessary to give the line a height when it's empty.
			span.textContent = preventEmptyString(line1);
			span.classList.add(charClass);
			fragment.appendChild(span);
		} else {
			fragment.textContent = preventEmptyString(line1);
		}

		return fragment;
	}

	private scrollToFirstDifference(): void {
		if (this.fileDifferences.differences.length === 0) {
			return;
		}

		const containerRect = this.contentEl
			.getElementsByClassName('file-diff__container')[0]
			.getBoundingClientRect();
		const elementRect = this.contentEl
			.getElementsByClassName('difference')[0]
			.getBoundingClientRect();
		this.contentEl.scrollTo({
			top: elementRect.top - containerRect.top - 100,
			behavior: 'smooth',
		});
	}
}



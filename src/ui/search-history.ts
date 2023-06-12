import { Result } from "obsidian-dataview";
import { QueryResult } from "obsidian-dataview/lib/api/plugin-api";
import { getIcon } from "../obsidian-api-helpers/get-icon";

export type CallbackFunction = (query: string) => Promise<Result<QueryResult, string>>;

let history: Array<HistoryItem> = []
const storedHistoryRaw = localStorage.getItem('meta-search-history')
if (typeof (storedHistoryRaw) === 'string') {
    history = JSON.parse(storedHistoryRaw)
}

export class SearchInputWithHistory {
    history: Array<HistoryItem> = history
    searchInputElement: HTMLInputElement
    searchWrapperElement: HTMLDivElement
    btnContainerElement: HTMLElement
    suggestionContainerElement: HTMLElement
    searchCallback: CallbackFunction
    currentHistoryPointer: number = history.length
    backButton: HTMLButtonElement;
    removeHistoryItemElement: HTMLElement;
    historyLinkContainerElement: HTMLSpanElement;

    constructor(leaf: HTMLElement, searchCallback: CallbackFunction, initialQuery: string) {
        this.searchWrapperElement = leaf.createDiv({ cls: 'meta-search-wrapper' })
        this.searchInputElement = this.searchWrapperElement.createEl("input", {
            value: initialQuery,
            cls: "full-width filter meta-search-input",
            placeholder: "dataview style filter e.g. metakey = test. Use ↑↓ for history",
        });
        this.removeHistoryItemElement = this.searchWrapperElement.createSpan({cls: 'remove-history-item'})
        this.removeHistoryItemElement.append(getIcon('x'))
        this.removeHistoryItemElement.addEventListener('click', ()=>this.removeHistoryItem())
        this.hideRemoveIcon()

        this.searchCallback = searchCallback;

        this.searchInputElement.addEventListener("change", () => this.doSearch())
        this.searchInputElement.addEventListener('keydown', (evt: KeyboardEvent) => {
            if (evt.key === 'ArrowUp') {
                if (this.currentHistoryPointer > 0) { this.currentHistoryPointer-- }
                this.pasteHistoryItem(this.history[this.currentHistoryPointer])
                evt.preventDefault();
                this.showRemoveIcon();
            } else if (evt.key === 'ArrowDown') {
                if (this.currentHistoryPointer < this.history.length) { this.currentHistoryPointer++ }
                evt.preventDefault();
                if (this.currentHistoryPointer === this.history.length) {
                    // Empty
                    this.pasteHistoryItem(null)
                } else {
                    this.pasteHistoryItem(this.history[this.currentHistoryPointer])
                    this.showRemoveIcon();
                }
            } else if (evt.key === 'Enter') {
                this.doSearch()
            }
        })
        this.createSearchHistoryMenu()
        this.createHistoryLinks()
    }

    pasteHistoryItem(historyItem: any) {
        if (historyItem instanceof Object) {
            this.searchInputElement.value = historyItem.query
        } else {
            this.searchInputElement.value = ''
        }
        this.searchInputElement.focus()
        this.searchInputElement.select()
    }

    showRemoveIcon(){ this.removeHistoryItemElement.style.display = 'block'}
    hideRemoveIcon(){ this.removeHistoryItemElement.style.display = 'none'}

    back() {
        if (this.currentHistoryPointer > 0) { this.currentHistoryPointer }
        this.pasteHistoryItem(this.history[this.currentHistoryPointer])
    }

    removeHistoryItem(item?: HistoryItem){
        let indexToRemove = this.currentHistoryPointer;
        if (item){
            indexToRemove = this.history.indexOf(item)
        } else {
            this.pasteHistoryItem(this.history[--this.currentHistoryPointer])
        }
        this.history.splice(indexToRemove, 1)
        this.hideRemoveIcon()

        this.historyLinkContainerElement.remove()
        this.createHistoryLinks()
        this.persistHistory();
    }


    clearHistory(){

    }

    set(value: string) {
        this.searchInputElement.value = value
        this.doSearch()
    }

    createSearchHistoryMenu() {
        this.suggestionContainerElement = this.searchWrapperElement.createDiv({ cls: 'history' })
        this.btnContainerElement = this.searchWrapperElement.createDiv({ cls: 'icon-btn-container' })

        // this.backButton = this.btnContainerElement.createEl('button', { cls: 'btn' })
        // this.backButton.append(getIcon('arrow-left'))
        // this.backButton.addEventListener('click', () => this.back())
    }

    createHistoryLinks(){
        this.historyLinkContainerElement = this.suggestionContainerElement.createSpan({cls: 'meta-history-links'})
        this.history.forEach((item)=>this.renderHistoryLink(item))
    }

    renderHistoryLink(item: HistoryItem){
        const el = this.historyLinkContainerElement.createSpan({cls: 'meta-history-link'})
        const title = el.createSpan({cls: 'title', text: item.query})
        const removeButton = el.createSpan({cls: 'remove-button'})
        removeButton.append(getIcon('x'))
        removeButton.addEventListener('click', (evt)=>{
            evt.stopPropagation()
            this.removeHistoryItem(item)
        })
        title.addEventListener('click', ()=>this.set(item.query))
    }


    async doSearch() {
        const query = this.searchInputElement.value.toLowerCase().trim()
        if (query.length) {
            const newHistoryItem = new HistoryItem(query)
            this.currentHistoryPointer = this.history.indexOf(newHistoryItem)

            // Remove history duplicates
            const sameQueryHistoryItem = this.history.find((historyElement) => historyElement.query === query)
            if (sameQueryHistoryItem) {
                this.history.splice(this.history.indexOf(sameQueryHistoryItem), 1)
            } else {
                this.renderHistoryLink(newHistoryItem)
            }
            this.history.push(newHistoryItem)
            this.persistHistory();

            const data = await this.searchCallback(this.searchInputElement.value.toLowerCase().trim())
            newHistoryItem.successful = data.successful;
        }
    }

    persistHistory(){
        localStorage.setItem('meta-search-history', JSON.stringify(this.history))
    }
}

class HistoryItem {
    query: string
    successful: boolean
    constructor(query: string) {
        this.query = query
    }
}
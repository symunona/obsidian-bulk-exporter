
export type SelectList = Array<{value: string, text: string}>
type Callback = (evt: Event, selectedId: string) => void

export class Select {
    constructor(rootElement: HTMLElement, items: SelectList, onChange: Callback, domInfo?: DomElementInfo){
        const select = rootElement.createEl('select', domInfo)
        items.forEach((listItem)=>{
            select.createEl('option', {value: listItem.value, text: listItem.text})
        })
        if (domInfo?.value){
            select.value = domInfo.value
        }
        select.addEventListener('change', (evt)=>{
            onChange(evt, select.value)
        })
    }
}
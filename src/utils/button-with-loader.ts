import { getIcon } from "src/obsidian-api-helpers/get-icon"

type ButtonWithLoaderCallbackFunction = (evt: MouseEvent) => Promise<void>
type ButtonWithLoaderErrorHandlerFunction = (e: Error) => void

type ButtonWithLoaderParams = {
    domElementInfo: DomElementInfo
    domElementName: string
    iconId: string
    loadingIconId: string
    errorIconId: string
}

const DEFAULT_BUTTON_PROPERTIES: ButtonWithLoaderParams = {
    domElementName: 'button',
    domElementInfo: { text: 'Save' },
    iconId: 'folder-input',
    loadingIconId: 'loader-2',
    errorIconId: 'alert-circle'
}

export class ButtonWithLoader {
    constructor(
        root: HTMLElement,
        params: Partial<ButtonWithLoaderParams>,
        onClick: ButtonWithLoaderCallbackFunction,
        onError: ButtonWithLoaderErrorHandlerFunction
    ) {
        const buttonWithLoaderSettings = Object.assign({}, DEFAULT_BUTTON_PROPERTIES, params)
        const button = root.createEl('button', buttonWithLoaderSettings.domElementInfo)
        const icon = getIcon(buttonWithLoaderSettings.iconId)
        const loadingIcon = getIcon(buttonWithLoaderSettings.loadingIconId)
        const errorIcon = getIcon(buttonWithLoaderSettings.errorIconId)
        loadingIcon.style.display = 'none'
        loadingIcon.classList.add('spin')
        errorIcon.style.display = 'none'
        button.append(icon, loadingIcon, errorIcon)

        button.addEventListener('click', async (evt)=> {
            icon.style.display = 'none'
            loadingIcon.style.display = 'block'
            errorIcon.style.display = 'none'
            button.disabled = true
            try{
                await onClick(evt)
                loadingIcon.style.display = 'none'
                icon.style.display = 'block'
            } catch (e){
                loadingIcon.style.display = 'none'
                errorIcon.style.display = 'block'
                onError(e)
            }
            button.disabled = false
        })

    }
}
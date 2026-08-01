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
        icon.classList.add('button-with-loader-icon')
        loadingIcon.classList.add('button-with-loader-icon', 'spin', 'is-hidden')
        errorIcon.classList.add('button-with-loader-icon', 'is-hidden')
        button.append(icon, loadingIcon, errorIcon)
        button.classList.add('with-icon')

        button.addEventListener('click', (evt) => {
            void (async () => {
                icon.classList.add('is-hidden')
                loadingIcon.classList.remove('is-hidden')
                errorIcon.classList.add('is-hidden')
                button.disabled = true
                try {
                    await onClick(evt)
                    loadingIcon.classList.add('is-hidden')
                    icon.classList.remove('is-hidden')
                } catch (e: unknown) {
                    loadingIcon.classList.add('is-hidden')
                    errorIcon.classList.remove('is-hidden')
                    const error = e instanceof Error ? e : new Error(String(e))
                    onError(error)
                    console.error(error)
                }
                button.disabled = false
            })()
        })

    }
}
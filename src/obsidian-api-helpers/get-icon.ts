import { getIcon as obsidianGetIcon } from "obsidian";

export function getIcon(iconId: string): SVGSVGElement{
    const icon = obsidianGetIcon(iconId)
    if (!icon){
        throw new Error(`Icon does not exists: ${iconId}`)
    }
    return icon
}
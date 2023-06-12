let target : HTMLElement

export function log(...args: any){
    if (!target){
        console.warn(args)
    } else {
        target.innerText += args.join(' ') + '\n'
    }
}

export function setLogOutput(targetElement : HTMLElement){
    target = targetElement
}
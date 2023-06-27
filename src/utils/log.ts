let target : HTMLElement

export function log(...args: any){
    toView('', ...args)
}

export function warn(...args: any){
    toView('#838009', ...args)
}

export function error(...args: any){
    toView('red', ...args)
}

function toView(color: string, ...args: any){
    if (!target){
        console.error('too early', args)
        return
    }
    const h = String(new Date().getHours()).padStart(2, '0')
    const m = String(new Date().getMinutes()).padStart(2, '0')
    const s = String(new Date().getSeconds()).padStart(2, '0')
    const timeStamp = `[${h}:${m}:${s}] `
    target.innerHTML += `<span style="color: ${color}">` + timeStamp + args.join(' ') + '</span>\n'
}


export function setLogOutput(targetElement : HTMLElement){
    target = targetElement
    targetElement.addClass('log')
    log('Logging started.')
}
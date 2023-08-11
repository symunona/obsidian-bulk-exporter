let target: HTMLElement;

export const COLORS = {
	LOG: "",
	WARN: "#838009",
	ERROR: "red"
}
export function log(...args: any) {
	return toView(COLORS.LOG, ...args);
}

export function warn(...args: any) {
	return toView(COLORS.WARN, ...args);
}

export function error(...args: any) {
	return toView(COLORS.ERROR, ...args);
}

function toView(color: string, ...args: any) {
	if (!target) {
		console.error("too early", args);
		throw new Error('hmm.')
	}
	return logEntry(target, color, ...args);
}
export function logEntry(target: HTMLElement, color: string, ...args: any): HTMLElement{
	const h = String(new Date().getHours()).padStart(2, "0");
	const m = String(new Date().getMinutes()).padStart(2, "0");
	const s = String(new Date().getSeconds()).padStart(2, "0");
	const timeStamp = `[${h}:${m}:${s}] `;
	const spn = createSpan({ attr: { style: `color: ${color}`, class: 'log-entry' } });
	spn.append(timeStamp);
	args.forEach((element: string | Node) => {
		spn.append(element);
	});
    spn.append(createEl('br'))
	target.append(spn);
	return spn
}

export function setLogOutput(targetElement: HTMLElement) {
	target = targetElement;
	targetElement.addClass("log");
	log("Logging started.");
}

let target: HTMLElement;

export function log(...args: any) {
	toView("", ...args);
}

export function warn(...args: any) {
	toView("#838009", ...args);
}

export function error(...args: any) {
	toView("red", ...args);
}

function toView(color: string, ...args: any) {
	if (!target) {
		console.error("too early", args);
		return;
	}
	const h = String(new Date().getHours()).padStart(2, "0");
	const m = String(new Date().getMinutes()).padStart(2, "0");
	const s = String(new Date().getSeconds()).padStart(2, "0");
	const timeStamp = `[${h}:${m}:${s}] `;
	const spn = createSpan({ attr: { style: `color: ${color}` } });
	spn.append(timeStamp);
	args.forEach((element: string | Node) => {
		spn.append(element);
	});
    spn.append(createEl('br'))
	target.append(spn);
}

export function setLogOutput(targetElement: HTMLElement) {
	target = targetElement;
	targetElement.addClass("log");
	log("Logging started.");
}

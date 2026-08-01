/**
 * The plugin's log pane.
 *
 * The pane is a piece of the sidebar view, so it exists only once
 * `BulkExporterView.onOpen` has run and called `setLogOutput`. Plenty of code
 * runs before that ever happens: the `bulk-export` palette command exports
 * FIRST and opens the view afterwards, and the `metadataCache "resolved"`
 * handler does the startup search with no view in sight.
 *
 * This used to `throw new Error('hmm.')` on exactly those paths. Both call sites
 * are fire-and-forget, so the throw became an unhandled rejection: the export
 * never happened, the status icons were never applied, and the user was told
 * nothing at all - the single loudest failure mode this plugin has.
 *
 * So an entry logged before there is anywhere to put it is BUFFERED, and
 * replayed the moment a target registers. Buffering rather than console-only
 * because the console is not somewhere a user looks: the point of the pane is
 * that opening it shows what happened, including what happened before it was
 * open. The console echo stays as well, for whoever has the dev tools up while
 * the pane is still closed.
 */
let target: HTMLElement | null = null;

export const COLORS = {
	LOG: "",
	WARN: "#838009",
	ERROR: "red"
}

interface PendingEntry {
	color: string;
	args: unknown[];
}

/**
 * Logged before any target existed, oldest first. Capped: a plugin left running
 * with the pane closed must not grow this without bound. Past the cap the
 * OLDEST entries are dropped, since the newest ones are what explain the state
 * the user is looking at.
 */
const pending: Array<PendingEntry> = [];
const PENDING_LIMIT = 500;

export function log(...args: unknown[]) {
	return toView(COLORS.LOG, ...args);
}

export function warn(...args: unknown[]) {
	return toView(COLORS.WARN, ...args);
}

export function error(...args: unknown[]) {
	return toView(COLORS.ERROR, ...args);
}

/**
 * @returns the element that was appended, or `undefined` while the entry is
 * only buffered - there is no element yet to hand back.
 */
function toView(color: string, ...args: unknown[]): HTMLElement | undefined {
	if (!target) {
		buffer(color, args);
		return undefined;
	}
	return logEntry(target, color, ...args);
}

function buffer(color: string, args: unknown[]) {
	toConsole(color, args);
	pending.push({ color, args });
	while (pending.length > PENDING_LIMIT) { pending.shift() }
}

/**
 * The safety net: visible right now, to anyone with the dev tools open.
 *
 * Even an ordinary entry goes out as a console WARNING here, not a log line -
 * having anything to say before the pane exists is itself the unusual state,
 * and `console.log` is what the plugin guidelines ask us not to spend.
 */
function toConsole(color: string, args: unknown[]) {
	const prefix = "[Bulk Exporter] (log pane not open yet)";
	if (color === COLORS.ERROR) {
		console.error(prefix, ...args);
	} else {
		console.warn(prefix, ...args);
	}
}

export function logEntry(target: HTMLElement, color: string, ...args: unknown[]): HTMLElement{
	const h = String(new Date().getHours()).padStart(2, "0");
	const m = String(new Date().getMinutes()).padStart(2, "0");
	const s = String(new Date().getSeconds()).padStart(2, "0");
	const timeStamp = `[${h}:${m}:${s}] `;
	const spn = createSpan({ attr: { style: `color: ${color}`, class: 'log-entry' } });
	spn.append(timeStamp);
	args.forEach((element) => {
		// Non-Node values are stringified by `append` anyway; do it explicitly
		// so the value stays typed as `Node | string`.
		spn.append(element instanceof Node ? element : String(element));
	});
    spn.append(createEl('br'))
	target.append(spn);
	return spn
}

export function setLogOutput(targetElement: HTMLElement) {
	target = targetElement;
	targetElement.addClass("log");
	// Replay first, so the pane reads in the order things actually happened.
	flushPending(targetElement);
	log("Logging started.");
}

function flushPending(targetElement: HTMLElement) {
	// Spliced out before replaying: `logEntry` cannot re-enter this, but a
	// second `setLogOutput` (the view is re-created on every reopen) must not
	// print the same history twice.
	const replay = pending.splice(0, pending.length);
	replay.forEach((entry) => logEntry(targetElement, entry.color, ...entry.args));
}

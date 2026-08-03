/**
 * Just enough YAML to stand in for Obsidian's `parseYaml` in jest.
 *
 * The plugin only ever hands YAML two kinds of input: one top level front matter
 * key with everything that belongs to it, and a single scalar cut out of one line.
 * That is the whole subset this parser covers - block maps, block sequences, flow
 * sequences and maps, the three scalar styles, comments, and the core scalar tags.
 *
 * What it deliberately does NOT do is guess: anything it cannot read for certain -
 * a block scalar header, an anchor, a tab indent, a bare `key: value: value` - is
 * a thrown `YamlError`, exactly like the real parser. Both callers in
 * `front-matter.ts` catch and degrade, so a throw costs one entry, never the file.
 */

export class YamlError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "YamlError";
	}
}

interface Line {
	indent: number;
	content: string;
}

export function parseYaml(text: string): unknown {
	if (typeof text !== "string") {
		throw new YamlError("expected a string to parse");
	}
	const lines = toLines(text);
	if (!lines.length) {
		return null;
	}
	const [value, next] = parseNode(lines, 0, lines[0].indent);
	if (next < lines.length) {
		throw new YamlError(
			`bad indentation of a mapping entry: "${lines[next].content}"`
		);
	}
	return value;
}

/** Blank lines and whole line comments carry no value, so they never reach the parser. */
function toLines(text: string): Array<Line> {
	const lines: Array<Line> = [];
	text.split(/\r?\n/).forEach((raw) => {
		const line = raw.replace(/\s+$/, "");
		const indent = line.length - line.replace(/^ +/, "").length;
		if (/^\s*\t/.test(line)) {
			throw new YamlError("tab characters must not be used in indentation");
		}
		const content = line.substring(indent);
		if (content === "" || content.startsWith("#")) {
			return;
		}
		lines.push({ indent, content });
	});
	return lines;
}

/** A node is whatever the line at `i` opens: a sequence, a map, or a lone scalar. */
function parseNode(lines: Array<Line>, i: number, indent: number): [unknown, number] {
	if (isSequenceLine(lines[i].content)) {
		return parseSequence(lines, i, indent);
	}
	if (splitKey(lines[i].content)) {
		return parseMap(lines, i, indent);
	}
	// Not a collection: a document that is one scalar. Anything following it is
	// a continuation this parser does not read.
	if (i + 1 < lines.length) {
		throw new YamlError(`could not read "${lines[i].content}" as a scalar`);
	}
	return [parseScalar(lines[i].content), i + 1];
}

function isSequenceLine(content: string): boolean {
	return content === "-" || content.startsWith("- ");
}

function parseMap(lines: Array<Line>, from: number, indent: number): [unknown, number] {
	const map: Record<string, unknown> = {};
	let i = from;
	while (i < lines.length && lines[i].indent === indent) {
		const line = lines[i];
		const split = splitKey(line.content);
		if (!split) {
			throw new YamlError(`could not read "${line.content}" as a mapping entry`);
		}
		i++;
		if (split.rest === "") {
			// The value is whatever is nested under the key. A sequence may sit at
			// the key's own indent - YAML allows that - anything else must be deeper.
			const nested = lines[i];
			if (nested && (nested.indent > indent ||
				(nested.indent === indent && isSequenceLine(nested.content)))) {
				const [value, next] = parseNode(lines, i, nested.indent);
				map[split.key] = value;
				i = next;
			} else {
				map[split.key] = null;
			}
		} else {
			map[split.key] = parseScalar(split.rest);
		}
	}
	if (i < lines.length && lines[i].indent > indent) {
		throw new YamlError(`bad indentation of a mapping entry: "${lines[i].content}"`);
	}
	return [map, i];
}

function parseSequence(lines: Array<Line>, from: number, indent: number): [unknown, number] {
	const items: Array<unknown> = [];
	let i = from;
	while (i < lines.length && lines[i].indent === indent && isSequenceLine(lines[i].content)) {
		const line = lines[i];
		const rest = line.content.substring(1).replace(/^ +/, "");
		if (rest === "") {
			const nested = lines[i + 1];
			if (nested && nested.indent > indent) {
				const [value, next] = parseNode(lines, i + 1, nested.indent);
				items.push(value);
				i = next;
			} else {
				items.push(null);
				i++;
			}
			continue;
		}
		// "- key: value" and "- - a" both continue on the same physical line. Treat
		// what follows the dash as a line of its own, indented to where it starts.
		const offset = line.content.length - rest.length;
		const inner = lines.slice(i);
		inner[0] = { indent: indent + offset, content: rest };
		const stop = inner.findIndex(
			(candidate, at) => at > 0 && candidate.indent <= indent);
		const [value, next] = parseNode(
			stop > -1 ? inner.slice(0, stop) : inner, 0, indent + offset);
		items.push(value);
		i += next;
	}
	return [items, i];
}

/**
 * The `key:` at the head of a line, and whatever is left of the line after it.
 * Null when the line does not open a mapping entry at all.
 */
function splitKey(content: string): { key: string, rest: string } | null {
	let at = 0;
	if (content[0] === '"' || content[0] === "'") {
		at = closingQuote(content, 0, content[0]);
		if (at < 0) { return null; }
	}
	// A key ends at the first colon that is followed by a space or the line end -
	// which is what keeps "C:/images/a.png" and "https://x/a.png" whole.
	while (at < content.length) {
		if (content[at] === ":" && (at + 1 === content.length || content[at + 1] === " ")) {
			const key = parseScalar(content.substring(0, at));
			const rest = content.substring(at + 1).replace(/^ +/, "");
			if (typeof key !== "string" && typeof key !== "number") { return null; }
			return { key: String(key), rest };
		}
		at++;
	}
	return null;
}

const NUMBER_MATCHER = /^[-+]?(\d+|\d*\.\d+)([eE][-+]?\d+)?$/;
const DATE_MATCHER = /^\d{4}-\d{2}-\d{2}$/;
const TIMESTAMP_MATCHER = /^\d{4}-\d{2}-\d{2}[Tt ][\d:.]+([Zz]|[-+]\d{2}(:?\d{2})?)?$/;

function parseScalar(raw: string): unknown {
	const text = raw.trim();
	if (text === "") { return null; }

	if (text[0] === '"' || text[0] === "'") {
		const end = closingQuote(text, 0, text[0]);
		if (end < 0) {
			throw new YamlError(`unexpected end of the stream within a quoted scalar: ${text}`);
		}
		expectNothingAfter(text, end);
		return unquote(text.substring(0, end));
	}
	if (text[0] === "[" || text[0] === "{") {
		const end = closingBracket(text, 0);
		if (end < 0) {
			throw new YamlError(`unexpected end of the stream within a flow collection: ${text}`);
		}
		expectNothingAfter(text, end);
		return parseFlow(text.substring(0, end));
	}
	// The value is written plain, so a ' #' opens a comment and everything the
	// plain style cannot express is an error rather than a guess.
	const comment = text.indexOf(" #");
	const plain = (comment > -1 ? text.substring(0, comment) : text).trim();
	if (plain === "") { return null; }
	if (/^[&*|>%@`]/.test(plain)) {
		throw new YamlError(`could not read "${plain}" as a plain scalar`);
	}
	if (/:(\s|$)/.test(plain)) {
		throw new YamlError("mapping values are not allowed in this context");
	}
	return plainScalar(plain);
}

function plainScalar(plain: string): unknown {
	if (plain === "~" || plain === "null" || plain === "Null" || plain === "NULL") {
		return null;
	}
	if (plain === "true" || plain === "True" || plain === "TRUE") { return true; }
	if (plain === "false" || plain === "False" || plain === "FALSE") { return false; }
	if (NUMBER_MATCHER.test(plain)) { return Number(plain); }
	if (/^[-+]?0[xX][0-9a-fA-F]+$/.test(plain) || /^[-+]?0[oO][0-7]+$/.test(plain)) {
		return Number(plain.replace(/^([-+]?)0[oO]/, "$10o"));
	}
	// The core schema reads a date as a Date, and the plugin leans on that: a
	// timestamp is not a string, so it is never mistaken for an attachment path.
	if (DATE_MATCHER.test(plain)) { return new Date(`${plain}T00:00:00Z`); }
	if (TIMESTAMP_MATCHER.test(plain)) { return new Date(plain.replace(" ", "T")); }
	return plain;
}

/** The index just past the closing quote, or -1 if there is none. */
function closingQuote(text: string, from: number, quote: string): number {
	for (let at = from + 1; at < text.length; at++) {
		if (quote === '"' && text[at] === "\\") { at++; continue; }
		if (text[at] !== quote) { continue; }
		if (quote === "'" && text[at + 1] === "'") { at++; continue; }
		return at + 1;
	}
	return -1;
}

/** The index just past the matching `]` or `}`, or -1 if there is none. */
function closingBracket(text: string, from: number): number {
	const open = text[from];
	const close = open === "[" ? "]" : "}";
	let depth = 0;
	for (let at = from; at < text.length; at++) {
		const char = text[at];
		if (char === '"' || char === "'") {
			const end = closingQuote(text, at, char);
			if (end < 0) { return -1; }
			at = end - 1;
			continue;
		}
		if (char === open) { depth++; }
		else if (char === close) {
			depth--;
			if (depth === 0) { return at + 1; }
		}
	}
	return -1;
}

function expectNothingAfter(text: string, end: number): void {
	const tail = text.substring(end).trim();
	if (tail !== "" && !tail.startsWith("#")) {
		throw new YamlError(`unexpected content after a scalar: "${tail}"`);
	}
}

function unquote(text: string): string {
	const body = text.substring(1, text.length - 1);
	if (text[0] === "'") {
		return body.replace(/''/g, "'");
	}
	return body.replace(/\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)/g, (_, escape: string) => {
		if (escape[0] === "u" || escape[0] === "x") {
			return String.fromCharCode(parseInt(escape.substring(1), 16));
		}
		return { n: "\n", t: "\t", r: "\r", "0": "\0", b: "\b" }[escape] ?? escape;
	});
}

/** A flow sequence or map, split on the commas that are not inside anything. */
function parseFlow(text: string): unknown {
	const isMap = text[0] === "{";
	const parts = splitFlow(text.substring(1, text.length - 1));
	if (!isMap) {
		return parts.map((part) => parseScalar(part));
	}
	const map: Record<string, unknown> = {};
	parts.forEach((part) => {
		const split = splitKey(part.trim());
		if (!split) {
			throw new YamlError(`could not read "${part.trim()}" as a mapping entry`);
		}
		map[split.key] = parseScalar(split.rest);
	});
	return map;
}

function splitFlow(body: string): Array<string> {
	const parts: Array<string> = [];
	let start = 0;
	for (let at = 0; at < body.length; at++) {
		const char = body[at];
		if (char === '"' || char === "'") {
			const end = closingQuote(body, at, char);
			if (end < 0) {
				throw new YamlError("unexpected end of the stream within a quoted scalar");
			}
			at = end - 1;
		} else if (char === "[" || char === "{") {
			const end = closingBracket(body, at);
			if (end < 0) {
				throw new YamlError("unexpected end of the stream within a flow collection");
			}
			at = end - 1;
		} else if (char === ",") {
			parts.push(body.substring(start, at));
			start = at + 1;
		}
	}
	parts.push(body.substring(start));
	return parts.filter((part) => part.trim() !== "");
}

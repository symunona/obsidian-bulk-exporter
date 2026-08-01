/**
 * Characters that are legal in an Obsidian note title but are NOT portable:
 * they are either reserved on some file system (Windows forbids all of
 * `\ / : * ? " < > |`), or they carry meaning in a URL and so break once a
 * static site generator turns the file name into a path.
 *
 * `%` is the one that actually bit us: it starts a percent escape, so a title
 * like `100% sure` is not a decodable URI component.
 * @see https://github.com/symunona/obsidian-bulk-exporter/issues/17
 *
 * `/` is deliberately absent - it is the vault's own folder separator, so it
 * shows up in every path we check.
 */
export const UNSAFE_CHARACTERS = ["%", "#", "?", ":", "*", '"', "<", ">", "|", "\\"]

const LAST_CONTROL_CHARACTER_CODE = 31
const DELETE_CHARACTER_CODE = 127

function isControlCharacter(character: string): boolean {
	const code = character.charCodeAt(0)
	return code <= LAST_CONTROL_CHARACTER_CODE || code === DELETE_CHARACTER_CODE
}

/**
 * @returns every not-universally-safe character present in `name`, each listed
 * once, in the order it first occurs (control characters as `\\u00xx`).
 * Empty when the name is portable.
 */
export function findUnsafeCharacters(name: string): Array<string> {
	const found: Array<string> = []
	for (const character of name) {
		if (UNSAFE_CHARACTERS.indexOf(character) === -1 && !isControlCharacter(character)) {
			continue
		}
		const readable = isControlCharacter(character)
			? "\\u" + character.charCodeAt(0).toString(16).padStart(4, "0")
			: character
		if (found.indexOf(readable) === -1) {
			found.push(readable)
		}
	}
	return found
}

/**
 * Advisory only - never fatal, never a reason to skip a file. It exists so that
 * a user who gets a surprising export result can see the likely cause in the
 * export log.
 * @returns a human readable warning, or null when there is nothing to say.
 */
export function unsafeCharacterWarning(name: string): string | null {
	const unsafe = findUnsafeCharacters(name)
	if (!unsafe.length) { return null }
	return `"${name}" contains ${unsafe.map((c) => `'${c}'`).join(", ")}. ` +
		"These are not safe in file names and links on every file system and " +
		"static site generator - consider renaming it, for portability."
}

/**
 * Trailing-edge debounce. Replaces the one `underscore` use that had no
 * native equivalent.
 */
export function debounce<A extends unknown[]>(
	fn: (...args: A) => void,
	wait: number
): (...args: A) => void {
	let timer: number | null = null;
	return (...args: A) => {
		if (timer) window.clearTimeout(timer);
		timer = window.setTimeout(() => fn(...args), wait);
	};
}

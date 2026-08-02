/**
 * Trailing-edge debounce. Replaces the one `underscore` use that had no
 * native equivalent.
 */
export function debounce<A extends unknown[]>(
	fn: (...args: A) => void,
	wait: number
): (...args: A) => void {
	let timer: ReturnType<typeof setTimeout> | null = null;
	return (...args: A) => {
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => fn(...args), wait);
	};
}

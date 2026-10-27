/** Inclusive one-based source lines, with LF display separators.
 * Scan only through the requested range; do not allocate a full-file line array
 * or retain another index alongside the worker's journal source strings.
 */
export function sourceExcerpt(
  text: string,
  first: number,
  last: number,
): string {
  if (
    !Number.isSafeInteger(first) ||
    !Number.isSafeInteger(last) ||
    first < 1 ||
    last < first
  )
    return '';
  let start = 0;
  for (let line = 1; line < first; line++) {
    const newline = text.indexOf('\n', start);
    if (newline < 0) return '';
    start = newline + 1;
  }
  let cursor = start;
  for (let line = first; line <= last; line++) {
    const newline = text.indexOf('\n', cursor);
    if (newline < 0) return text.slice(start).replaceAll('\r\n', '\n');
    if (line === last) {
      const end =
        newline > cursor && text[newline - 1] === '\r' ? newline - 1 : newline;
      return text.slice(start, end).replaceAll('\r\n', '\n');
    }
    cursor = newline + 1;
  }
  return '';
}

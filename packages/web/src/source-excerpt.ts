const CHECKPOINT_LINES = 256;

/** Stateless inclusive one-based source lines, with LF display separators. */
export function sourceExcerpt(
  text: string,
  first: number,
  last: number,
): string {
  return extract(text, first, last);
}

/** Worker-owned, lazy UTF-16 offsets every 256 lines. Never persists source data. */
export class SourceExcerptIndex {
  private readonly checkpoints = [0];
  constructor(private readonly text: string) {}

  get checkpointCount() {
    return this.checkpoints.length;
  }

  excerpt(first: number, last: number): string {
    return extract(this.text, first, last, this.checkpoints);
  }
}

function extract(
  text: string,
  first: number,
  last: number,
  checkpoints?: number[],
): string {
  if (
    !Number.isSafeInteger(first) ||
    !Number.isSafeInteger(last) ||
    first < 1 ||
    last < first
  )
    return '';
  const block = checkpoints
    ? Math.min(
        Math.floor((first - 1) / CHECKPOINT_LINES),
        checkpoints.length - 1,
      )
    : 0;
  const remember = (line: number, offset: number) => {
    if (
      checkpoints &&
      (line - 1) % CHECKPOINT_LINES === 0 &&
      (line - 1) / CHECKPOINT_LINES === checkpoints.length
    )
      checkpoints.push(offset);
  };
  let start = checkpoints?.[block] ?? 0;
  for (let line = block * CHECKPOINT_LINES + 1; line < first; line++) {
    const newline = text.indexOf('\n', start);
    if (newline < 0) return '';
    start = newline + 1;
    remember(line + 1, start);
  }
  let cursor = start;
  for (let line = first; line <= last; line++) {
    const newline = text.indexOf('\n', cursor);
    if (newline < 0) return text.slice(start).replaceAll('\r\n', '\n');
    remember(line + 1, newline + 1);
    if (line === last) {
      const end =
        newline > cursor && text[newline - 1] === '\r' ? newline - 1 : newline;
      return text.slice(start, end).replaceAll('\r\n', '\n');
    }
    cursor = newline + 1;
  }
  return '';
}

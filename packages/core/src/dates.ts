import type { Posting } from './index.js';

/** Full calendar date only; no default year, secondary date, or local timezone. */
export function parseFullDate(text: string): string | null {
  const match = text.match(/^(\d{4})([-/.])(\d{1,2})\2(\d{1,2})$/);
  if (!match) return null;
  const [, year, , month, day] = match;
  const iso = `${year}-${month!.padStart(2, '0')}-${day!.padStart(2, '0')}`;
  const date = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) &&
    date.toISOString().slice(0, 10) === iso
    ? iso
    : null;
}

/** Resolve a header date only from an explicit year; never consult the clock. */
export function parseTransactionDate(
  text: string,
  defaultYear?: string,
): string | null {
  if (/^\d{4}[-/.]/.test(text)) return parseFullDate(text);
  const partial = text.match(/^(\d{1,2})([-/.])(\d{1,2})$/);
  return partial && defaultYear
    ? parseFullDate(
        `${defaultYear}${partial[2]}${partial[1]}${partial[2]}${partial[3]}`,
      )
    : null;
}

export function effectivePostingDate(
  posting: Pick<Posting, 'date'>,
  transactionDate: string,
): string {
  return posting.date ?? transactionDate;
}

export function hasPostingDateSyntax(comment: string): boolean {
  return /\bdate2?\s*:|\[(?:\s*=|\d)/i.test(comment);
}

/** Deliberately conservative primary-date comment subset; date-shaped text never vanishes. */
export function parsePostingDateComment(
  comment: string,
  transactionDate: string,
): {
  date?: string;
  error?: string;
} {
  if (!hasPostingDateSyntax(comment)) return {};
  if (/\bdate2\s*:|\[\s*=/i.test(comment))
    return { error: 'Secondary posting dates are not supported yet.' };
  const bracketStarts = [...comment.matchAll(/\[(?=\d)/g)];
  const brackets = [...comment.matchAll(/\[(\d[^\]]*)\]/g)];
  const tagStarts = [...comment.matchAll(/\bdate\s*:/gi)];
  const tags = [...comment.matchAll(/\bdate:\s*([^\s,;]+)/g)];
  if (
    bracketStarts.length !== brackets.length ||
    tagStarts.length !== tags.length
  )
    return {
      error:
        'Use one complete primary posting date: [YYYY-MM-DD], [M/D], or a lowercase date: tag.',
    };
  if (brackets.length + tags.length !== 1)
    return {
      error:
        'Use exactly one primary posting date per posting. Duplicate or combined date markers are not supported.',
    };
  const tag = tags[0];
  if (
    tag &&
    comment.slice(0, tag.index).trimEnd() &&
    !comment.slice(0, tag.index).trimEnd().endsWith(',')
  )
    return {
      error:
        'A date: tag must start the comment or follow a comma. Use a bracket date for other comment notes.',
    };
  const value = (brackets[0] ?? tags[0])![1]!;
  // hledger resolves month/day overrides against the containing transaction,
  // independently of the file default year and without month rollover.
  const date = parseTransactionDate(value, transactionDate.slice(0, 4));
  return date
    ? { date }
    : {
        error:
          'Invalid or unsupported posting date. Use a full calendar date or month/day in the transaction year; combined primary/secondary dates are not supported.',
      };
}

import type { Source } from './index.js';

/** Classification describes source shape, never financial validity or support. */
export type SyntaxKind =
  | 'blank'
  | 'comment'
  | 'block-comment-start'
  | 'block-comment-body'
  | 'block-comment-end'
  | 'transaction'
  | 'posting'
  | 'directive'
  | 'unknown';

/** Half-open UTF-16 offsets into the original Source.text, as used by JS strings. */
export interface SyntaxLine {
  readonly kind: SyntaxKind;
  readonly line: number;
  /** Full line, including its BOM (if any) and original line terminator. */
  readonly start: number;
  readonly end: number;
  /** Line body, excluding an initial BOM and LF/CRLF terminator. */
  readonly bodyStart: number;
  readonly bodyEnd: number;
}

/** A read-only source tree. Nodes reference text rather than copying its contents. */
export interface JournalSyntax {
  readonly source: Readonly<Source>;
  readonly lines: readonly SyntaxLine[];
}

const transactionStart = /^(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})(?:\s|$)/;
const directiveStart =
  /^(?:account|include|commodity|decimal-mark|alias|apply|end|payee|tag|D|P|Y)(?:\s|$)/;

/**
 * Stream source-shaped lines without allocating a retained tree or split-line array.
 * A terminating LF produces a final empty logical line, matching String.split and
 * the accounting parser's existing diagnostic line numbers. Empty input has one line.
 * Lone CR is body text, not a line terminator (LF and CRLF are supported).
 */
export function* scanJournalLines(
  source: Readonly<Source>,
): Generator<SyntaxLine> {
  const text = source.text;
  let start = 0;
  let line = 1;
  let blockComment = false;
  while (start <= text.length) {
    const newline = text.indexOf('\n', start);
    const end = newline < 0 ? text.length : newline + 1;
    const bodyStart = start === 0 && text.charCodeAt(0) === 0xfeff ? 1 : start;
    const bodyEnd =
      newline < 0
        ? end
        : newline > start && text[newline - 1] === '\r'
          ? newline - 1
          : newline;
    const body = text.slice(bodyStart, bodyEnd);
    let kind: SyntaxKind;
    if (blockComment) {
      kind = /^end comment\s*$/.test(body)
        ? 'block-comment-end'
        : 'block-comment-body';
      if (kind === 'block-comment-end') blockComment = false;
    } else if (body === 'comment') {
      kind = 'block-comment-start';
      blockComment = true;
    } else if (!body.trim()) kind = 'blank';
    else if (/^\s*[;#]/.test(body)) kind = 'comment';
    else if (/^\s/.test(body)) kind = 'posting';
    else if (transactionStart.test(body.split(';', 1)[0]!.trimEnd()))
      kind = 'transaction';
    else if (directiveStart.test(body)) kind = 'directive';
    else kind = 'unknown';
    yield { kind, line, start, end, bodyStart, bodyEnd };
    if (newline < 0) return;
    start = end;
    line++;
  }
}

/** Opt in to retaining a source tree for inspection; reports use the streaming API. */
export function parseJournalSyntax(source: Readonly<Source>): JournalSyntax {
  // Snapshot the name/text pair so a caller reassigning its input cannot invalidate spans.
  const snapshot = { name: source.name, text: source.text };
  return { source: snapshot, lines: [...scanJournalLines(snapshot)] };
}

/** Reconstruct the original decoded text, including unknown syntax and all trivia. */
export function printJournalSyntax(syntax: JournalSyntax): string {
  return syntax.lines
    .map((node) => syntax.source.text.slice(node.start, node.end))
    .join('');
}

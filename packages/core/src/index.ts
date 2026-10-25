import { add, isZero, negate } from './decimal.js';
import { scanJournalLines } from './syntax.js';
import { resolveIncludes } from './includes.js';
export {
  resolveIncludes,
  MAX_INCLUDE_DEPTH,
  MAX_JOURNAL_SOURCES,
} from './includes.js';
export type { IncludeEdge, IncludeGraph } from './includes.js';
export {
  scanJournalLines,
  parseJournalSyntax,
  printJournalSyntax,
} from './syntax.js';
export type { SyntaxKind, SyntaxLine, JournalSyntax } from './syntax.js';
export { add, negate, isZero } from './decimal.js';

export interface Source {
  name: string;
  text: string;
}
export interface Location {
  file: string;
  line: number;
}
export interface Diagnostic extends Location {
  code: string;
  message: string;
}
export interface Amount {
  quantity: string;
  commodity: string;
}
export type Status = '' | '*' | '!';
export interface Posting {
  account: string;
  amount: Amount;
  inferred: boolean;
  status: Status;
  source: Location;
}
export interface Transaction {
  date: string;
  status: Status;
  code: string;
  description: string;
  postings: Posting[];
  source: Location;
}
export interface Journal {
  transactions: Transaction[];
  diagnostics: Diagnostic[];
  sources: Source[];
}
export interface Balance {
  account: string;
  amounts: Amount[];
}

/** Deliberately narrow grammar; unsupported syntax must never become a plausible balance. */
export function parseAmount(text: string): Amount | null {
  const number = '[+-]?\\d+(?:\\.\\d+)?';
  const prefix = text.match(new RegExp(`^([+-]?)\\s*([$€£])\\s*(${number})$`));
  if (prefix) {
    if (prefix[1] && /^[+-]/.test(prefix[3]!)) return null;
    return {
      quantity: add('0', `${prefix[1]}${prefix[3]}`),
      commodity: prefix[2]!,
    };
  }
  const suffix = text.match(
    new RegExp(`^(${number})(?:\\s+([\\p{L}][\\p{L}\\p{N}._-]*|[$€£]))?$`, 'u'),
  );
  return suffix
    ? { quantity: add('0', suffix[1]!), commodity: suffix[2] ?? '' }
    : null;
}

function dateValue(text: string): string | null {
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

type PendingPosting = Omit<Posting, 'amount'> & { amount: Amount | null };
type PendingTransaction = Omit<Transaction, 'postings'> & {
  postings: PendingPosting[];
};

export function parseJournal(sources: Source[]): Journal {
  const journal: Journal = { transactions: [], diagnostics: [], sources };
  const error = (where: Location, code: string, message: string) =>
    journal.diagnostics.push({ ...where, code, message });
  const graph = resolveIncludes(sources);
  journal.diagnostics.push(...graph.diagnostics);
  if (journal.diagnostics.length) return journal;
  const byName = new Map(sources.map((source) => [source.name, source]));
  const includes = new Map<string, Map<number, string>>();
  for (const edge of graph.edges) {
    const lines = includes.get(edge.from) ?? new Map<number, string>();
    lines.set(edge.line, edge.to);
    includes.set(edge.from, lines);
  }
  function parseSource(source: Source) {
    let tx: PendingTransaction | null = null;
    let txErrors = 0;
    let blockComment = false;
    const finish = () => {
      if (!tx) return;
      const current = tx;
      tx = null;
      if (journal.diagnostics.length > txErrors) return;
      if (current.postings.length < 2) {
        error(
          current.source,
          'postings',
          'A transaction needs at least two postings.',
        );
        return;
      }
      const missing = current.postings.filter((p) => !p.amount);
      if (missing.length > 1) {
        error(
          current.source,
          'inference',
          'Only one posting amount may be omitted.',
        );
        return;
      }
      const totals = new Map<string, string>();
      for (const { amount } of current.postings) {
        if (amount)
          totals.set(
            amount.commodity,
            add(totals.get(amount.commodity) ?? '0', amount.quantity),
          );
      }
      if (missing.length) {
        if (totals.size !== 1) {
          error(
            current.source,
            'inference',
            'Mixed-commodity amount inference is not supported yet.',
          );
          return;
        }
        const [commodity, quantity] = [...totals][0]!;
        missing[0]!.amount = { commodity, quantity: negate(quantity) };
      } else if ([...totals.values()].some((total) => !isZero(total))) {
        error(
          current.source,
          'unbalanced',
          'Posting amounts must sum to zero in each commodity. Costs and conversions are not supported yet.',
        );
        return;
      }
      journal.transactions.push({
        ...current,
        postings: current.postings as Posting[],
      });
    };
    let lastLine = 1;
    for (const node of scanJournalLines(source)) {
      lastLine = node.line;
      const raw = source.text.slice(node.bodyStart, node.bodyEnd);
      const location = { file: source.name, line: node.line };
      if (node.kind === 'block-comment-body') continue;
      if (node.kind === 'block-comment-end') {
        blockComment = false;
        continue;
      }
      if (node.kind === 'block-comment-start') {
        finish();
        blockComment = true;
        continue;
      }
      // Posting date comments change accounting semantics: reject them until implemented.
      if (tx && /^\s/.test(raw) && /;.*(?:\bdate2?:|\[\d)/i.test(raw)) {
        error(
          location,
          'posting-date',
          'Posting date overrides are not supported yet.',
        );
        continue;
      }
      if (node.kind === 'blank') {
        finish();
        continue;
      }
      if (node.kind === 'comment') continue;
      const content = raw.split(';')[0]!.trimEnd();
      if (!/^\s/.test(raw)) {
        finish();
        const child = includes.get(source.name)?.get(node.line);
        if (child !== undefined) {
          parseSource(byName.get(child)!);
          continue;
        }
        if (/^account\s+\S/.test(content)) continue;
        const header = content.match(
          /^(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})(?:\s+(.*))?$/,
        );
        if (!header) {
          error(
            location,
            'unsupported',
            'Unsupported directive or journal syntax. See docs/compatibility.md. Includes must not be ignored.',
          );
          continue;
        }
        const date = dateValue(header[1]!);
        if (!date) {
          error(location, 'date', 'Invalid calendar date.');
          continue;
        }
        let rest = header[2] ?? '';
        let status: Status = '';
        if (/^[*!](?:\s|$)/.test(rest)) {
          status = rest[0] as Status;
          rest = rest.slice(1).trimStart();
        }
        let code = '';
        if (rest.startsWith('(')) {
          const match = rest.match(/^\(([^)]*)\)(?:\s+|$)/);
          if (!match) {
            error(location, 'code', 'Invalid transaction code.');
            continue;
          }
          code = match[1]!;
          rest = rest.slice(match[0].length);
        }
        txErrors = journal.diagnostics.length;
        tx = {
          date,
          status,
          code,
          description: rest,
          source: location,
          postings: [],
        };
      } else {
        if (!tx) {
          error(
            location,
            'posting',
            'Posting or directive metadata outside a transaction is not supported.',
          );
          continue;
        }
        let body = content.trim();
        let status: Status = '';
        if (/^[*!]\s/.test(body)) {
          status = body[0] as Status;
          body = body.slice(1).trimStart();
        }
        const [account = '', ...amountParts] = body.split(/\t+| {2,}/);
        if (
          !account ||
          /[[\]()=]/.test(account) ||
          account.split(':').some((p) => !p.trim())
        ) {
          error(
            location,
            'account',
            'Invalid or unsupported account name. Virtual postings are not supported yet.',
          );
          continue;
        }
        const amountText = amountParts.join(' ').trim();
        const amount = amountText ? parseAmount(amountText) : null;
        if (amountText && !amount) {
          error(
            location,
            'amount',
            'Unsupported amount. Use dot decimals with an optional currency symbol or suffix commodity; costs, assertions, grouping, and expressions are not supported yet.',
          );
          continue;
        }
        tx.postings.push({
          account,
          amount,
          status,
          inferred: !amount,
          source: location,
        });
      }
    }
    finish();
    if (blockComment)
      error(
        { file: source.name, line: lastLine },
        'comment',
        'Unterminated comment block.',
      );
  }
  for (const name of graph.entryPoints) parseSource(byName.get(name)!);
  return journal;
}

export function assertValid(journal: Journal): void {
  if (journal.diagnostics.length)
    throw new Error(
      'Journal has errors; reports are disabled to avoid incomplete totals.',
    );
}

/** Direct account balances; commodity quantities are never added to other commodities. */
export function balances(journal: Journal): Balance[] {
  assertValid(journal);
  const accounts = new Map<string, Map<string, string>>();
  for (const tx of journal.transactions)
    for (const p of tx.postings) {
      let totals = accounts.get(p.account);
      if (!totals) {
        totals = new Map();
        accounts.set(p.account, totals);
      }
      totals.set(
        p.amount.commodity,
        add(totals.get(p.amount.commodity) ?? '0', p.amount.quantity),
      );
    }
  return [...accounts]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([account, totals]) => ({
      account,
      amounts: [...totals]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([commodity, quantity]) => ({ commodity, quantity })),
    }));
}
export function formatAmount(amount: Amount): string {
  return `${amount.quantity}${amount.commodity ? ` ${amount.commodity}` : ''}`;
}

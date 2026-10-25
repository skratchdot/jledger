import { add, isZero, negate } from './decimal.js';
import { scanJournalLines } from './syntax.js';
import { resolveIncludes } from './includes.js';
import { checkBalanceAssertions } from './assertions.js';
import {
  parseAmount,
  parseCommodityFormat,
  type CommodityFormat,
  type DecimalMark,
} from './amounts.js';
export { parseAmount } from './amounts.js';
export type { AmountContext, CommodityFormat, DecimalMark } from './amounts.js';
import {
  hasPostingDateSyntax,
  parseFullDate,
  parsePostingDateComment,
} from './dates.js';
export { effectivePostingDate } from './dates.js';
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
  /** Explicit primary posting date; absent means the transaction date. */
  date?: string;
  amount: Amount;
  inferred: boolean;
  /** A single-commodity, direct-account plain = assertion; consult diagnostics for validity. */
  balanceAssertion?: Amount;
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
  let hasAssertions = false;
  interface ParsingContext {
    decimalMark?: DecimalMark;
    commodityFormats: Map<string, CommodityFormat>;
  }
  function parseSource(source: Source, inherited: ParsingContext) {
    // Decimal marks are file-scoped; commodity formats flow through expanded includes.
    const context = { ...inherited };
    let commodityBlock: string | undefined;
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
        commodityBlock = undefined;
        finish();
        blockComment = true;
        continue;
      }
      let postingDate: string | undefined;
      const semicolon = raw.indexOf(';');
      if (tx && /^\s/.test(raw) && semicolon >= 0) {
        const comment = raw.slice(semicolon + 1);
        if (hasPostingDateSyntax(comment)) {
          if (node.kind === 'comment') {
            error(
              location,
              'posting-date',
              'Posting dates on continuation comment lines are not supported. Put one full primary date inline on the posting.',
            );
            continue;
          }
          const parsed = parsePostingDateComment(comment);
          if (parsed.error) {
            error(location, 'posting-date', parsed.error);
            continue;
          }
          postingDate = parsed.date;
        }
      }
      if (node.kind === 'blank') {
        commodityBlock = undefined;
        finish();
        continue;
      }
      if (node.kind === 'comment') continue;
      const content = raw.split(';')[0]!.trimEnd();
      if (!/^\s/.test(raw)) {
        commodityBlock = undefined;
        finish();
        const child = includes.get(source.name)?.get(node.line);
        if (child !== undefined) {
          parseSource(byName.get(child)!, context);
          continue;
        }
        if (/^decimal-mark(?:\s|$)/.test(content)) {
          const match = content.match(/^decimal-mark\s+([.,])$/);
          if (!match)
            error(
              location,
              'decimal-mark',
              'Use decimal-mark . or decimal-mark , without other options.',
            );
          else context.decimalMark = match[1] as DecimalMark;
          continue;
        }
        if (/^commodity(?:\s|$)/.test(content)) {
          const declaration = parseCommodityFormat(
            content.slice('commodity'.length).trim(),
            context.decimalMark,
          );
          if (!declaration)
            error(
              location,
              'commodity-format',
              'Use an unquoted commodity or a supported numeric format example. Examples must agree with decimal-mark and use three-digit grouping.',
            );
          else {
            commodityBlock = declaration.commodity;
            if (declaration.format)
              context.commodityFormats.set(
                declaration.commodity,
                declaration.format,
              );
            else context.commodityFormats.delete(declaration.commodity);
          }
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
        const date = parseFullDate(header[1]!);
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
        if (!tx && commodityBlock && /^format(?:\s|$)/.test(content.trim())) {
          const declaration = parseCommodityFormat(
            content.trim().slice('format'.length).trim(),
            context.decimalMark,
          );
          if (!declaration?.format || declaration.commodity !== commodityBlock)
            error(
              location,
              'commodity-format',
              'A format subdirective must contain a supported numeric example of the declared commodity.',
            );
          else context.commodityFormats.set(commodityBlock, declaration.format);
          continue;
        }
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
        let postingAmountText = amountText;
        let balanceAssertion: Amount | null = null;
        if (amountText.includes('=')) {
          const parts = amountText.split('=');
          if (parts.length !== 2 || parts[1]!.trimStart().startsWith('*')) {
            error(
              location,
              'balance-assertion-syntax',
              'Only plain = balance assertions are supported. Total (==) and inclusive (=*) assertions are not supported yet.',
            );
            continue;
          }
          postingAmountText = parts[0]!.trim();
          if (!postingAmountText) {
            error(
              location,
              'balance-assignment',
              'Balance assignments are not supported yet. Supply an explicit posting amount before =.',
            );
            continue;
          }
          balanceAssertion = parseAmount(parts[1]!.trim(), context);
          if (!balanceAssertion) {
            error(
              location,
              'balance-assertion-syntax',
              'Use a supported explicit quantity and commodity after =. Costs, expressions and extra assertion operators are not supported. Grouping and comma decimals require explicit supported directives.',
            );
            continue;
          }
        }
        const amount = postingAmountText
          ? parseAmount(postingAmountText, context)
          : null;
        if (amountText && !amount) {
          error(
            location,
            'amount',
            'Unsupported amount or grouping. Use exact decimals with a supported unquoted prefix/suffix commodity. Grouping and comma decimals require a compatible explicit directive; costs and expressions are not supported.',
          );
          continue;
        }
        if (balanceAssertion) hasAssertions = true;
        tx.postings.push({
          ...(balanceAssertion ? { balanceAssertion } : {}),
          ...(postingDate ? { date: postingDate } : {}),
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
  for (const name of graph.entryPoints)
    parseSource(byName.get(name)!, { commodityFormats: new Map() });
  if (hasAssertions && !journal.diagnostics.length)
    journal.diagnostics.push(...checkBalanceAssertions(journal.transactions));
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

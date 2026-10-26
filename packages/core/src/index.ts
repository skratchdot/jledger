import {
  hasAccountTypeTag,
  parseAccountTypeComment,
  type AccountDeclaration,
} from './account-types.js';
export {
  createAccountTypeResolver,
  matchesAccountType,
  ACCOUNT_TYPE_LABELS,
} from './account-types.js';
export type {
  AccountType,
  AccountDeclaration,
  AccountClassification,
} from './account-types.js';
import { add, isZero, negate } from './decimal.js';
import { scanJournalLines } from './syntax.js';
import { resolveIncludes } from './includes.js';
import { checkBalanceAssertions } from './assertions.js';
import { rollupAccountBalances, type AccountHierarchy } from './accounts.js';
export { MAX_ACCOUNT_DEPTH, MAX_ACCOUNT_NODES } from './accounts.js';
export type { AccountHierarchy, AccountRollup } from './accounts.js';
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
  parseTransactionDate,
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
  /** Present only when a yearless header used an explicit year directive. */
  inferredYear?: { year: string; source: Location };
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
  accountDeclarations: AccountDeclaration[];
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
  const journal: Journal = {
    transactions: [],
    diagnostics: [],
    sources,
    accountDeclarations: [],
  };
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
  const typedDeclarations = new Map<string, AccountDeclaration>();
  const readAccountType = (
    declaration: AccountDeclaration,
    comment: string,
    location: Location,
  ) => {
    const parsed = parseAccountTypeComment(comment);
    if (parsed.error) {
      error(location, 'account-type', parsed.error);
      return;
    }
    if (!parsed.type) return;
    if (declaration.type) {
      error(
        location,
        'account-type',
        'Use one type: tag per account declaration; duplicate tags are not supported.',
      );
      return;
    }
    const previous = typedDeclarations.get(declaration.account);
    if (previous?.type && previous.type !== parsed.type) {
      error(
        location,
        'account-type',
        `Conflicting account types for ${declaration.account}; the earlier type is at ${previous.typeSource!.file}:${previous.typeSource!.line}.`,
      );
      return;
    }
    declaration.type = parsed.type;
    declaration.typeSource = location;
    // Repeating the same type does not change its original provenance.
    if (!previous) typedDeclarations.set(declaration.account, declaration);
  };
  interface ParsingContext {
    defaultYear?: NonNullable<Transaction['inferredYear']>;
    decimalMark?: DecimalMark;
    commodityFormats: Map<string, CommodityFormat>;
  }
  function parseSource(source: Source, inherited: ParsingContext) {
    // Years and decimal marks are file-scoped and inherited by includes; commodity formats flow through them.
    const context = { ...inherited };
    let commodityBlock: string | undefined;
    let accountBlock: AccountDeclaration | undefined;
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
        accountBlock = undefined;
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
          const parsed = parsePostingDateComment(comment, tx.date);
          if (parsed.error) {
            error(location, 'posting-date', parsed.error);
            continue;
          }
          postingDate = parsed.date;
        }
      }
      if (node.kind === 'blank') {
        accountBlock = undefined;
        commodityBlock = undefined;
        finish();
        continue;
      }
      if (node.kind === 'comment') {
        if (accountBlock && /^\s/.test(raw)) {
          if (/^\s+;/.test(raw))
            readAccountType(accountBlock, raw.slice(semicolon + 1), location);
          else {
            if (hasAccountTypeTag(raw))
              error(
                location,
                'account-type',
                'Account type continuation tags require an indented semicolon comment.',
              );
            accountBlock = undefined;
          }
        } else accountBlock = undefined;
        continue;
      }
      const content = raw.split(';')[0]!.trimEnd();
      if (!/^\s/.test(raw)) {
        accountBlock = undefined;
        commodityBlock = undefined;
        finish();
        const child = includes.get(source.name)?.get(node.line);
        if (child !== undefined) {
          parseSource(byName.get(child)!, context);
          continue;
        }
        if (/^(?:Y(?=\s|\d|$)|year(?:\s|$))/.test(content)) {
          const declaration = content.match(/^(?:Y\s*|year\s+)(\d{4})$/);
          if (!declaration || declaration[1] === '0000')
            error(
              location,
              'default-year',
              'Use Y2024, Y 2024, or year 2024 with a four-digit year from 0001 through 9999.',
            );
          else
            context.defaultYear = { year: declaration[1]!, source: location };
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
        if (/^account\s+\S/.test(content)) {
          const account = content.slice('account'.length).trim();
          if (
            /[[\]()=\t]| {2,}/.test(account) ||
            account.split(':').some((part) => !part.trim())
          ) {
            error(
              location,
              'account',
              'Invalid or unsupported declared account name.',
            );
            continue;
          }
          accountBlock = { account, source: location };
          journal.accountDeclarations.push(accountBlock);
          if (semicolon >= 0 && hasAccountTypeTag(raw.slice(semicolon + 1))) {
            if (!/(?: {2,}|\t)\s*$/.test(raw.slice(0, semicolon)))
              error(
                location,
                'account-type',
                'Use two spaces or a tab before an inline account type comment.',
              );
            else
              readAccountType(accountBlock, raw.slice(semicolon + 1), location);
          }
          continue;
        }
        const header = content.match(
          /^((?:\d{4}[-/.])?\d{1,2}[-/.]\d{1,2})(?:\s+(.*))?$/,
        );
        if (!header) {
          error(
            location,
            'unsupported',
            'Unsupported directive or journal syntax. See docs/compatibility.md. Includes must not be ignored.',
          );
          continue;
        }
        const partial = !/^\d{4}[-/.]/.test(header[1]!);
        if (partial && !context.defaultYear) {
          error(
            location,
            'default-year-required',
            'Yearless transaction dates require an earlier explicit Y2024 or year 2024 directive in this file or an including parent. Full dates do not set a default year.',
          );
          continue;
        }
        const date = parseTransactionDate(
          header[1]!,
          context.defaultYear?.year,
        );
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
          ...(partial ? { inferredYear: context.defaultYear! } : {}),
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
/** Full-journal direct balances plus inclusive parent/descendant totals, by commodity. */
export function accountHierarchy(journal: Journal): AccountHierarchy {
  const direct = balances(journal); // Also refuses every journal diagnostic.
  return { direct, inclusive: rollupAccountBalances(direct) };
}

export function formatAmount(amount: Amount): string {
  return `${amount.quantity}${amount.commodity ? ` ${amount.commodity}` : ''}`;
}

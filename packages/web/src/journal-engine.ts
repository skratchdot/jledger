import {
  add,
  balances,
  parseJournal,
  type Balance,
  type Diagnostic,
  type Journal,
  type Source,
  type Transaction,
} from '@jledger/core';

export interface Filters {
  query: string;
  account: string;
  month: string;
  commodity: string;
  status: string;
}
export interface Summary {
  names: string[];
  diagnostics: Diagnostic[];
  diagnosticCount: number;
  transactionCount: number;
  accounts: Balance[];
  commodities: string[];
  months: string[];
}
export interface Report {
  count: number;
  income: string;
  spending: string;
  categories: [string, string][];
  monthly: { month: string; value: string }[];
}
export interface Row extends Transaction {
  id: number;
}
export interface Detail extends Row {
  excerpt: string;
}
export const matchesAccount = (account: string, filter: string) =>
  !filter || account === filter || account.startsWith(`${filter}:`);
const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Lives exclusively in the worker in production; the UI receives summaries and visible rows. */
export class JournalEngine {
  private journal: Journal = { transactions: [], sources: [], diagnostics: [] };
  private index: { id: number; text: string }[] = [];
  private matches: number[] = [];
  summary: Summary = {
    names: [],
    diagnostics: [],
    diagnosticCount: 0,
    transactionCount: 0,
    accounts: [],
    commodities: [],
    months: [],
  };

  load(sources: Source[]): Summary {
    this.journal = parseJournal(sources);
    this.matches = [];
    const valid = !this.journal.diagnostics.length;
    this.index = valid
      ? this.journal.transactions
          .map((t, id) => ({
            id,
            text: `${t.description} ${t.code} ${t.postings.map((p) => p.account).join(' ')}`.toLowerCase(),
          }))
          .sort((a, b) =>
            this.journal.transactions[b.id]!.date.localeCompare(
              this.journal.transactions[a.id]!.date,
            ),
          )
      : [];
    this.summary = {
      names: sources.map((s) => s.name),
      diagnostics: this.journal.diagnostics.slice(0, 200),
      diagnosticCount: this.journal.diagnostics.length,
      transactionCount: this.journal.transactions.length,
      accounts: valid ? balances(this.journal) : [],
      commodities: [
        ...new Set(
          this.journal.transactions.flatMap((t) =>
            t.postings.map((p) => p.amount.commodity),
          ),
        ),
      ].sort(),
      months: [
        ...new Set(this.journal.transactions.map((t) => t.date.slice(0, 7))),
      ].sort(),
    };
    return this.summary;
  }

  async query(
    filters: Filters,
    cancelled = () => false,
  ): Promise<Report | null> {
    const matches: number[] = [],
      categories = new Map<string, string>(),
      monthly = new Map<string, string>();
    let income = '0',
      spending = '0';
    const query = filters.query.toLowerCase();
    for (let i = 0; i < this.index.length; i++) {
      if (i % 8192 === 0) {
        await pause();
        if (cancelled()) return null;
      }
      const entry = this.index[i]!,
        t = this.journal.transactions[entry.id]!;
      if (
        (filters.month && !t.date.startsWith(filters.month)) ||
        (filters.status !== 'all' && t.status !== filters.status) ||
        !entry.text.includes(query)
      )
        continue;
      if (
        !t.postings.some(
          (p) =>
            matchesAccount(p.account, filters.account) &&
            p.amount.commodity === filters.commodity,
        )
      )
        continue;
      matches.push(entry.id);
      for (const p of t.postings) {
        if (
          p.amount.commodity !== filters.commodity ||
          !matchesAccount(p.account, filters.account)
        )
          continue;
        if (/^expenses(?::|$)/i.test(p.account)) {
          spending = add(spending, p.amount.quantity);
          categories.set(
            p.account,
            add(categories.get(p.account) ?? '0', p.amount.quantity),
          );
          const month = t.date.slice(0, 7);
          monthly.set(month, add(monthly.get(month) ?? '0', p.amount.quantity));
        }
        if (/^(?:income|revenue)(?::|$)/i.test(p.account))
          income = add(income, p.amount.quantity);
      }
    }
    if (cancelled()) return null;
    this.matches = matches;
    return {
      count: matches.length,
      income: add('0', income.startsWith('-') ? income.slice(1) : `-${income}`),
      spending,
      categories: [...categories].sort((a, b) => Number(b[1]) - Number(a[1])),
      monthly: this.summary.months.map((month) => ({
        month,
        value: monthly.get(month) ?? '0',
      })),
    };
  }

  rows(start: number, end: number): Row[] {
    return this.matches
      .slice(Math.max(0, start), Math.max(0, end))
      .map((id) => ({ ...this.journal.transactions[id]!, id }));
  }
  detail(id: number): Detail | null {
    const t = this.journal.transactions[id];
    if (!t) return null;
    const source = this.journal.sources.find((s) => s.name === t.source.file);
    return {
      ...t,
      id,
      excerpt:
        source?.text
          .split(/\r?\n/)
          .slice(t.source.line - 1, t.postings.at(-1)?.source.line)
          .join('\n') ?? '',
    };
  }
}

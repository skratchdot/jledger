import {
  AccountExplorer,
  type AccountAction,
  type AccountMode,
} from './account-view';
import {
  add,
  negate,
  effectivePostingDate,
  accountHierarchy,
  createAccountTypeResolver,
  matchesAccountType,
  type AccountClassification,
  parseJournal,
  type Diagnostic,
  type Journal,
  type Source,
  type Transaction,
} from '@jledger/core';

import {
  dateRangeError,
  InvalidDateRangeError,
  matchesPosting,
  previousMonthFilters,
  type Filters,
} from './report-filters';
export type { Filters } from './report-filters';
export interface Summary {
  names: string[];
  diagnostics: Diagnostic[];
  diagnosticCount: number;
  transactionCount: number;
  accountCount: number;
  accountRollupCount: number;
  commodities: string[];
  months: string[];
}
export interface MonthComparison {
  month: string;
  previousMonth: string;
  income: string;
  spending: string;
  count: number;
  incomeChange: string;
  spendingChange: string;
  countChange: number;
}
export interface Report {
  comparison?: MonthComparison;
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
  postingTypes: AccountClassification[];
}
const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Lives exclusively in the worker in production; the UI receives summaries and visible rows. */
export class JournalEngine {
  private journal: Journal = {
    transactions: [],
    sources: [],
    diagnostics: [],
    accountDeclarations: [],
  };
  private accounts = new AccountExplorer({ direct: [], inclusive: [] });
  private classify: ((account: string) => AccountClassification) | undefined;
  private index: { id: number; text: string }[] = [];
  private matches: number[] = [];
  summary: Summary = {
    names: [],
    diagnostics: [],
    diagnosticCount: 0,
    transactionCount: 0,
    accountCount: 0,
    accountRollupCount: 0,
    commodities: [],
    months: [],
  };

  load(sources: Source[]): Summary {
    // Compute before committing: a hierarchy limit must not mix new transactions
    // with the previous journal's summary or result IDs after a failed import.
    const journal = parseJournal(sources);
    const valid = !journal.diagnostics.length;
    const hierarchy = valid
      ? accountHierarchy(journal)
      : { direct: [], inclusive: [] };
    const accounts = new AccountExplorer(hierarchy);
    const classify = valid ? createAccountTypeResolver(journal) : undefined;
    const index = valid
      ? journal.transactions
          .map((t, id) => ({
            id,
            text: `${t.description} ${t.code} ${t.postings.map((p) => (p.accountAlias ? `${p.account} ${p.accountAlias.originalAccount}` : p.account)).join(' ')}`.toLowerCase(),
          }))
          .sort((a, b) =>
            journal.transactions[b.id]!.date.localeCompare(
              journal.transactions[a.id]!.date,
            ),
          )
      : [];
    const commodities = new Set<string>(),
      months = new Set<string>();
    for (const transaction of journal.transactions)
      for (const posting of transaction.postings) {
        commodities.add(posting.amount.commodity);
        months.add(effectivePostingDate(posting, transaction.date).slice(0, 7));
      }
    const summary: Summary = {
      names: sources.map((s) => s.name),
      diagnostics: journal.diagnostics.slice(0, 200),
      diagnosticCount: journal.diagnostics.length,
      transactionCount: journal.transactions.length,
      accountCount: hierarchy.direct.length,
      accountRollupCount: hierarchy.inclusive.length,
      commodities: [...commodities].sort(),
      months: [...months].sort(),
    };
    this.journal = journal;
    this.accounts = accounts;
    this.classify = classify;
    this.index = index;
    this.matches = [];
    this.summary = summary;
    return summary;
  }

  configureAccounts(mode: AccountMode, action?: AccountAction) {
    return this.accounts.configure(mode, action);
  }
  accountRows(start: number, end: number) {
    return this.accounts.rows(start, end);
  }

  async query(
    filters: Filters,
    cancelled = () => false,
  ): Promise<Report | null> {
    const invalidRange = dateRangeError(filters.dateFrom, filters.dateTo);
    if (invalidRange) {
      this.matches = [];
      throw new InvalidDateRangeError(invalidRange);
    }
    const matches: number[] = [],
      categories = new Map<string, string>(),
      monthly = new Map<string, string>();
    let income = '0',
      spending = '0';
    const previous = previousMonthFilters(filters);
    let previousIncome = '0',
      previousSpending = '0',
      previousCount = 0;
    const query = filters.query.toLowerCase();
    for (let i = 0; i < this.index.length; i++) {
      if (i % 8192 === 0) {
        await pause();
        if (cancelled()) return null;
      }
      const entry = this.index[i]!,
        t = this.journal.transactions[entry.id]!;
      if (
        (filters.status !== 'all' && t.status !== filters.status) ||
        !entry.text.includes(query)
      )
        continue;
      const currentMatches = t.postings.some((p) =>
        matchesPosting(p, t.date, filters),
      );
      const previousMatches =
        previous && t.postings.some((p) => matchesPosting(p, t.date, previous));
      if (!currentMatches && !previousMatches) continue;
      if (currentMatches) matches.push(entry.id);
      if (previousMatches) previousCount++;
      for (const p of t.postings) {
        const inCurrent = currentMatches && matchesPosting(p, t.date, filters);
        const inPrevious =
          previousMatches && matchesPosting(p, t.date, previous!);
        if (!inCurrent && !inPrevious) continue;
        const type = this.classify!(p.account).type;
        if (inPrevious) {
          if (type === 'X')
            previousSpending = add(previousSpending, p.amount.quantity);
          if (matchesAccountType(type, 'R'))
            previousIncome = add(previousIncome, p.amount.quantity);
        }
        if (!inCurrent) continue;
        if (type === 'X') {
          spending = add(spending, p.amount.quantity);
          categories.set(
            p.account,
            add(categories.get(p.account) ?? '0', p.amount.quantity),
          );
          const month = effectivePostingDate(p, t.date).slice(0, 7);
          monthly.set(month, add(monthly.get(month) ?? '0', p.amount.quantity));
        }
        if (matchesAccountType(type, 'R'))
          income = add(income, p.amount.quantity);
      }
    }
    if (cancelled()) return null;
    this.matches = matches;
    const shownIncome = negate(income);
    const shownPreviousIncome = negate(previousIncome);
    return {
      ...(previous
        ? {
            comparison: {
              month: filters.month,
              previousMonth: previous.month,
              income: shownPreviousIncome,
              spending: previousSpending,
              count: previousCount,
              incomeChange: add(shownIncome, negate(shownPreviousIncome)),
              spendingChange: add(spending, negate(previousSpending)),
              countChange: matches.length - previousCount,
            },
          }
        : {}),
      count: matches.length,
      income: shownIncome,
      spending,
      categories: [...categories].sort((a, b) => Number(b[1]) - Number(a[1])),
      monthly: this.summary.months
        .filter(
          (month) =>
            (!filters.month || month === filters.month) &&
            (!filters.dateFrom || month >= filters.dateFrom.slice(0, 7)) &&
            (!filters.dateTo || month <= filters.dateTo.slice(0, 7)),
        )
        .map((month) => ({ month, value: monthly.get(month) ?? '0' })),
    };
  }

  rows(start: number, end: number): Row[] {
    return this.matches
      .slice(Math.max(0, start), Math.max(0, end))
      .map((id) => ({ ...this.journal.transactions[id]!, id }));
  }
  detail(id: number): Detail | null {
    const t = this.journal.transactions[id];
    if (!t || !this.classify) return null;
    const source = this.journal.sources.find((s) => s.name === t.source.file);
    return {
      ...t,
      id,
      postingTypes: t.postings.map((posting) =>
        this.classify!(posting.account),
      ),
      excerpt:
        source?.text
          .split(/\r?\n/)
          .slice(t.source.line - 1, t.postings.at(-1)?.source.line)
          .join('\n') ?? '',
    };
  }
}

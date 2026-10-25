import { add, isZero, negate } from './decimal.js';
import { effectivePostingDate } from './dates.js';
import type { Diagnostic, Transaction } from './index.js';

/** hledger plain '=': direct account, one commodity, after this posting, in effective posting-date order. */
export function checkBalanceAssertions(
  transactions: readonly Transaction[],
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const accounts = new Map<string, Map<string, string>>();
  // Stable sorting retains expanded source/posting order for equal effective dates.
  // A date override can reorder postings even within the same transaction.
  const ordered = transactions
    .flatMap((transaction) =>
      transaction.postings.map((posting) => ({
        posting,
        date: effectivePostingDate(posting, transaction.date),
      })),
    )
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  for (const { posting } of ordered) {
    let amounts = accounts.get(posting.account);
    if (!amounts) {
      amounts = new Map();
      accounts.set(posting.account, amounts);
    }
    const amount = posting.amount;
    amounts.set(
      amount.commodity,
      add(amounts.get(amount.commodity) ?? '0', amount.quantity),
    );
    const assertion = posting.balanceAssertion;
    if (!assertion) continue;
    const actual = amounts.get(assertion.commodity) ?? '0';
    if (!isZero(add(actual, negate(assertion.quantity)))) {
      const commodity = assertion.commodity
        ? ` ${assertion.commodity}`
        : ' (no commodity)';
      diagnostics.push({
        ...posting.source,
        code: 'balance-assertion',
        message: `Balance assertion failed for ${posting.account}: expected ${assertion.quantity}${commodity}, calculated ${actual}${commodity}. Checks the direct account after this posting in effective posting-date order.`,
      });
    }
  }
  return diagnostics;
}

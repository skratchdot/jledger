import { add, isZero, negate } from './decimal.js';
import type { Diagnostic, Transaction } from './index.js';

/** hledger plain '=': direct account, one commodity, after this posting, in date order. */
export function checkBalanceAssertions(
  transactions: readonly Transaction[],
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const accounts = new Map<string, Map<string, string>>();
  // Stable sorting retains expanded source order for transactions on the same date.
  // Do not reorder the public parse result or lose the original source provenance.
  const ordered = [...transactions].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
  for (const transaction of ordered) {
    for (const posting of transaction.postings) {
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
          message: `Balance assertion failed for ${posting.account}: expected ${assertion.quantity}${commodity}, calculated ${actual}${commodity}. Checks the direct account after this posting in date order.`,
        });
      }
    }
  }
  return diagnostics;
}

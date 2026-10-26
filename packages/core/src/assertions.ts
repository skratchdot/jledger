import { add, isZero, negate } from './decimal.js';
import { formatCommodityName } from './amounts.js';
import { effectivePostingDate } from './dates.js';
import type { Diagnostic, Transaction } from './index.js';

/** = / == / =* checks after this posting, in effective posting-date order. */
export function checkBalanceAssertions(
  transactions: readonly Transaction[],
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const accounts = new Map<string, Map<string, string>>();
  // Lazily track only accounts that actually use total assertions.
  const nonzeroByAccount = new Map<string, Set<string>>();
  // Stable sorting retains expanded source/posting order for equal effective dates.
  // A date override can reorder postings even within the same transaction.
  // Index only asserted inclusive account/commodity scopes while collecting
  // posting references. Resolve each distinct posting account once below.
  const inclusive = new Map<string, Map<string, string>>();
  const ordered = transactions
    .flatMap((transaction) =>
      transaction.postings.map((posting) => {
        if (posting.balanceAssertionInclusive && posting.balanceAssertion) {
          let amounts = inclusive.get(posting.account);
          if (!amounts) {
            amounts = new Map();
            inclusive.set(posting.account, amounts);
          }
          amounts.set(posting.balanceAssertion.commodity, '0');
        }
        return {
          posting,
          date: effectivePostingDate(posting, transaction.date),
        };
      }),
    )
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const inclusiveTargets = new Map<string, Map<string, string>[]>();
  for (const { posting } of ordered) {
    if (inclusive.size) {
      let targets = inclusiveTargets.get(posting.account);
      if (!targets) {
        targets = [];
        let path = posting.account;
        while (path) {
          const amounts = inclusive.get(path);
          if (amounts) targets.push(amounts);
          const separator = path.lastIndexOf(':');
          if (separator < 0) break;
          path = path.slice(0, separator);
        }
        inclusiveTargets.set(posting.account, targets);
      }
      for (const amounts of targets) {
        const { commodity, quantity } = posting.amount;
        if (amounts.has(commodity))
          amounts.set(commodity, add(amounts.get(commodity)!, quantity));
      }
    }
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
    let nonzero = nonzeroByAccount.get(posting.account);
    if (nonzero) {
      if (isZero(amounts.get(amount.commodity)!))
        nonzero.delete(amount.commodity);
      else nonzero.add(amount.commodity);
    }
    const assertion = posting.balanceAssertion;
    if (!assertion) continue;
    const checkedAmounts = posting.balanceAssertionInclusive
      ? inclusive.get(posting.account)!
      : amounts;
    const actual = checkedAmounts.get(assertion.commodity) ?? '0';
    const otherAmounts: string[] = [];
    let otherCount = 0;
    if (posting.balanceAssertionTotal) {
      if (!nonzero) {
        nonzero = new Set<string>();
        for (const [name, quantity] of amounts)
          if (!isZero(quantity)) nonzero.add(name);
        nonzeroByAccount.set(posting.account, nonzero);
      }
      otherCount = nonzero.size - (nonzero.has(assertion.commodity) ? 1 : 0);
      for (const name of nonzero) {
        if (name === assertion.commodity) continue;
        otherAmounts.push(
          `${amounts.get(name)!}${name ? ` ${formatCommodityName(name)}` : ' (no commodity)'}`,
        );
        if (otherAmounts.length === 5) break;
      }
    }
    if (!isZero(add(actual, negate(assertion.quantity))) || otherCount) {
      const commodity = assertion.commodity
        ? ` ${formatCommodityName(assertion.commodity)}`
        : ' (no commodity)';
      const scope = posting.balanceAssertionInclusive
        ? 'Checks this account and its subaccounts in the asserted commodity after this posting in effective posting-date order.'
        : posting.balanceAssertionTotal
          ? 'Checks every commodity in the direct account after this posting in effective posting-date order.'
          : 'Checks the direct account after this posting in effective posting-date order.';
      const extra = otherCount
        ? ` Other nonzero balances: ${otherAmounts.join(', ')}${otherCount > otherAmounts.length ? `; ${otherCount - otherAmounts.length} more` : ''}.`
        : '';
      diagnostics.push({
        ...posting.source,
        code: 'balance-assertion',
        message: `Balance assertion failed for ${posting.account}: expected ${assertion.quantity}${commodity}, calculated ${actual}${commodity}.${extra} ${scope}`,
      });
    }
  }
  return diagnostics;
}

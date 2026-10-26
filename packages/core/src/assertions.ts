import { add, isZero, negate } from './decimal.js';
import { formatCommodityName } from './amounts.js';
import { effectivePostingDate } from './dates.js';
import type { Diagnostic, Transaction } from './index.js';

/** Exact direct/inclusive checks after each posting, in effective date order. */
export function checkBalanceAssertions(
  transactions: readonly Transaction[],
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const accounts = new Map<string, Map<string, string>>();
  // Lazily track only accounts that actually use total assertions.
  const nonzeroByAccount = new Map<string, Set<string>>();
  // Stable sorting retains expanded source/posting order for equal effective dates.
  // A date override can reorder postings even within the same transaction.
  // Index asserted inclusive scopes (all commodities for total scopes) while collecting
  // posting references. Resolve each distinct posting account once below.
  interface InclusiveScope {
    amounts: Map<string, string>;
    total: boolean;
    nonzero?: Set<string>;
  }
  const inclusive = new Map<string, InclusiveScope>();
  const ordered = transactions
    .flatMap((transaction) =>
      transaction.postings.map((posting) => {
        if (posting.balanceAssertionInclusive && posting.balanceAssertion) {
          let scope = inclusive.get(posting.account);
          if (!scope) {
            scope = { amounts: new Map(), total: false };
            inclusive.set(posting.account, scope);
          }
          scope.total ||= Boolean(posting.balanceAssertionTotal);
          scope.amounts.set(posting.balanceAssertion.commodity, '0');
        }
        return {
          posting,
          date: effectivePostingDate(posting, transaction.date),
        };
      }),
    )
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const inclusiveTargets = new Map<string, InclusiveScope[]>();
  for (const { posting } of ordered) {
    if (inclusive.size) {
      let targets = inclusiveTargets.get(posting.account);
      if (!targets) {
        targets = [];
        let path = posting.account;
        while (path) {
          const scope = inclusive.get(path);
          if (scope) targets.push(scope);
          const separator = path.lastIndexOf(':');
          if (separator < 0) break;
          path = path.slice(0, separator);
        }
        inclusiveTargets.set(posting.account, targets);
      }
      for (const scope of targets) {
        const { amounts } = scope;
        const { commodity, quantity } = posting.amount;
        if (scope.total || amounts.has(commodity)) {
          const next = add(amounts.get(commodity) ?? '0', quantity);
          amounts.set(commodity, next);
          if (scope.nonzero) {
            if (isZero(next)) scope.nonzero.delete(commodity);
            else scope.nonzero.add(commodity);
          }
        }
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
    const scope = posting.balanceAssertionInclusive
      ? inclusive.get(posting.account)!
      : undefined;
    const checkedAmounts = scope?.amounts ?? amounts;
    if (scope) nonzero = scope.nonzero;
    const actual = checkedAmounts.get(assertion.commodity) ?? '0';
    const otherAmounts: string[] = [];
    let otherCount = 0;
    if (posting.balanceAssertionTotal) {
      if (!nonzero) {
        nonzero = new Set<string>();
        for (const [name, quantity] of checkedAmounts)
          if (!isZero(quantity)) nonzero.add(name);
        if (scope) scope.nonzero = nonzero;
        else nonzeroByAccount.set(posting.account, nonzero);
      }
      otherCount = nonzero.size - (nonzero.has(assertion.commodity) ? 1 : 0);
      for (const name of nonzero) {
        if (name === assertion.commodity) continue;
        otherAmounts.push(
          `${checkedAmounts.get(name)!}${name ? ` ${formatCommodityName(name)}` : ' (no commodity)'}`,
        );
        if (otherAmounts.length === 5) break;
      }
    }
    if (!isZero(add(actual, negate(assertion.quantity))) || otherCount) {
      const commodity = assertion.commodity
        ? ` ${formatCommodityName(assertion.commodity)}`
        : ' (no commodity)';
      const scope =
        posting.balanceAssertionInclusive && posting.balanceAssertionTotal
          ? 'Checks every commodity in this account and its subaccounts after this posting in effective posting-date order.'
          : posting.balanceAssertionInclusive
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

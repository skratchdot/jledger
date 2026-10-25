import { add } from './decimal.js';
import type { Amount, Balance } from './index.js';

export const MAX_ACCOUNT_DEPTH = 64;
export const MAX_ACCOUNT_NODES = 100_000;
export interface AccountRollup extends Balance {
  depth: number;
  hasChildren: boolean;
  directAmounts: Amount[];
}
export interface AccountHierarchy {
  direct: Balance[];
  inclusive: AccountRollup[];
}
interface Node {
  account: string;
  depth: number;
  children: Map<string, Node>;
  totals: Map<string, string>;
  directAmounts: Amount[];
}
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Build from direct balances only: an inclusive subtotal must never be rolled up again. */
export function rollupAccountBalances(
  direct: readonly Balance[],
): AccountRollup[] {
  if (direct.length > MAX_ACCOUNT_NODES)
    throw new Error(
      `Account hierarchy exceeds ${MAX_ACCOUNT_NODES} nodes, including implicit parents.`,
    );
  const roots = new Map<string, Node>();
  let count = 0;
  for (const balance of direct) {
    const segments = balance.account.split(':');
    if (segments.length > MAX_ACCOUNT_DEPTH)
      throw new Error(
        `Account hierarchy supports at most ${MAX_ACCOUNT_DEPTH} colon-separated segments per account.`,
      );
    let children = roots;
    let path = '';
    for (let depth = 0; depth < segments.length; depth++) {
      const segment = segments[depth]!;
      path = depth ? `${path}:${segment}` : segment;
      let node = children.get(segment);
      if (!node) {
        if (++count > MAX_ACCOUNT_NODES)
          throw new Error(
            `Account hierarchy exceeds ${MAX_ACCOUNT_NODES} nodes, including implicit parents.`,
          );
        node = {
          account: path,
          depth,
          children: new Map(),
          totals: new Map(),
          directAmounts: [],
        };
        children.set(segment, node);
      }
      for (const amount of balance.amounts)
        node.totals.set(
          amount.commodity,
          add(node.totals.get(amount.commodity) ?? '0', amount.quantity),
        );
      if (depth === segments.length - 1)
        node.directAmounts = balance.amounts.map((a) => ({ ...a }));
      children = node.children;
    }
  }
  const ordered = (nodes: Map<string, Node>) =>
    [...nodes].sort(([a], [b]) => compare(a, b)).map(([, node]) => node);
  const stack = ordered(roots).reverse();
  const result: AccountRollup[] = [];
  while (stack.length) {
    const node = stack.pop()!;
    result.push({
      account: node.account,
      depth: node.depth,
      hasChildren: node.children.size > 0,
      directAmounts: node.directAmounts,
      amounts: [...node.totals]
        .sort(([a], [b]) => compare(a, b))
        .map(([commodity, quantity]) => ({ commodity, quantity })),
    });
    // Push children one at a time; do not spread an unbounded list into a call.
    const children = ordered(node.children);
    for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]!);
  }
  return result;
}

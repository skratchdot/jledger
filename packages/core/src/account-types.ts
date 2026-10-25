import { assertValid, type Journal, type Location } from './index.js';

export type AccountType = 'A' | 'L' | 'E' | 'R' | 'X' | 'C' | 'V' | 'G';
export interface AccountDeclaration {
  account: string;
  source: Location;
  type?: AccountType;
  typeSource?: Location;
}
export interface AccountClassification {
  type: AccountType | null;
  origin: 'declared' | 'inferred' | 'unknown';
  /** Account where the declaration or English-name inference originated. */
  account: string;
  source?: Location;
}
export const ACCOUNT_TYPE_LABELS: Readonly<Record<AccountType, string>> = {
  A: 'Asset',
  L: 'Liability',
  E: 'Equity',
  R: 'Income',
  X: 'Expense',
  C: 'Cash',
  V: 'Conversion',
  G: 'Gain',
};
const typeNames = new Map<string, AccountType>([
  ['a', 'A'],
  ['asset', 'A'],
  ['l', 'L'],
  ['liability', 'L'],
  ['e', 'E'],
  ['equity', 'E'],
  ['r', 'R'],
  ['revenue', 'R'],
  ['x', 'X'],
  ['expense', 'X'],
  ['c', 'C'],
  ['cash', 'C'],
  ['v', 'V'],
  ['conversion', 'V'],
  ['g', 'G'],
  ['gains', 'G'],
]);
export function hasAccountTypeTag(comment: string): boolean {
  return /(?:^|[\s,])type\s*:/i.test(comment);
}
/** A deliberately narrow tag subset: one lowercase type: key, comma-delimited value. */
export function parseAccountTypeComment(comment: string): {
  type?: AccountType;
  error?: string;
} {
  const tags = [...comment.matchAll(/(?:^|[\s,])(type\s*):([^,]*)/gi)];
  if (!tags.length) return {};
  if (tags.length !== 1 || tags[0]![1] !== 'type')
    return {
      error:
        'Use one lowercase type: tag per account declaration; duplicate or alternate tag keys are not supported.',
    };
  const type = typeNames.get(tags[0]![2]!.trim().toLowerCase());
  return type
    ? { type }
    : {
        error:
          'Unknown account type. Use A, L, E, R, X, C, V, G or asset, liability, equity, revenue, expense, cash, conversion, gains.',
      };
}

/** hledger English-name defaults; explicit types take precedence over every default. */
function inferType(account: string): AccountType | null {
  const parts = account.toLowerCase().split(':');
  const root = parts[0]!;
  if (root === 'asset' || root === 'assets') {
    if (
      parts
        .slice(1)
        .some((part) =>
          /^(?:cash|bank|che(?:ck|que?)(?:ing)?|savings?|current)$/.test(part),
        )
    )
      return 'C';
    return 'A';
  }
  if (/^(?:debts?|liabilit(?:y|ies))$/.test(root)) return 'L';
  if (root === 'equity')
    return /^(?:trades?|trading|conversion)$/.test(parts[1] ?? '') ? 'V' : 'E';
  if (/^(?:income|revenue)s?$/.test(root))
    return /^(?:capital[- ]?)?(?:gains?|loss(?:es)?)$/.test(parts[1] ?? '')
      ? 'G'
      : 'R';
  if (/^expenses?$/.test(root)) return 'X';
  return null;
}
/** Cash, conversion and gain also belong to their respective parent types. */
export function matchesAccountType(
  type: AccountType | null,
  query: AccountType,
): boolean {
  return (
    type === query ||
    (query === 'A' && type === 'C') ||
    (query === 'E' && type === 'V') ||
    (query === 'R' && type === 'G')
  );
}

/** Build once per valid journal. Cached paths avoid scanning declarations per posting. */
export function createAccountTypeResolver(
  journal: Journal,
): (account: string) => AccountClassification {
  assertValid(journal);
  const declarations = new Map<string, AccountDeclaration>();
  const declaredTypes = new Set<AccountType>();
  for (const declaration of journal.accountDeclarations) {
    if (declaration.type) {
      if (!declarations.has(declaration.account))
        declarations.set(declaration.account, declaration);
      declaredTypes.add(declaration.type);
    }
  }
  // Cache inherited state before the final name fallback. A suppressed subtype
  // must not propagate to a child in place of its inferred parent type.
  const paths = new Map<string, AccountClassification>();
  return (account) => {
    const known = paths.get(account);
    if (known?.type) return known;
    let parent: AccountClassification | undefined;
    let path = '';
    for (const segment of account.split(':')) {
      path = path ? `${path}:${segment}` : segment;
      const cached = paths.get(path);
      if (cached) {
        parent = cached;
        continue;
      }
      const declaration = declarations.get(path);
      let next: AccountClassification;
      if (declaration?.type) {
        next = {
          type: declaration.type,
          origin: 'declared',
          account: path,
          source: declaration.typeSource ?? declaration.source,
        };
      } else if (parent?.origin === 'declared') next = parent;
      else {
        const inferred = inferType(path);
        next =
          inferred && !declaredTypes.has(inferred)
            ? { type: inferred, origin: 'inferred', account: path }
            : (parent ?? { type: null, origin: 'unknown', account: path });
      }
      paths.set(path, next);
      parent = next;
    }
    if (parent?.type) return parent;
    const type = inferType(account);
    return { type, origin: type ? 'inferred' : 'unknown', account };
  };
}

import type { Location } from './index.js';

export interface AccountAliasInfo {
  originalAccount: string;
  sources: Location[];
}
interface Rule {
  from: string;
  to: string;
  source: Location;
}
export const MAX_ACCOUNT_ALIASES = 128;
const MAX_ALIAS_NAME = 4096;
function validName(name: string): boolean {
  return (
    Boolean(name) &&
    name.length <= MAX_ALIAS_NAME &&
    !/[[\]()=;"\\\p{C}]| {2,}/u.test(name) &&
    !name.includes('/') &&
    name.split(':').every((part) => Boolean(part.trim()))
  );
}
export function parseAccountAlias(text: string, source: Location): Rule | null {
  const match = text.match(/^alias\s+([^=]+)=([^=]+)$/);
  if (!match) return null;
  const from = match[1]!.trim(),
    to = match[2]!.trim();
  return validName(from) && validName(to) ? { from, to, source } : null;
}

/** Immutable file context; repeated account paths share cached resolution/provenance. */
export class AccountAliases {
  private readonly cache = new Map<
    string,
    { account: string; accountAlias?: AccountAliasInfo }
  >();
  constructor(private readonly rules: readonly Rule[] = []) {}
  with(rule: Rule): AccountAliases {
    if (this.rules.length >= MAX_ACCOUNT_ALIASES)
      throw new RangeError(
        `At most ${MAX_ACCOUNT_ALIASES} active account aliases are supported.`,
      );
    return new AccountAliases([rule, ...this.rules]);
  }
  resolve(originalAccount: string) {
    const cached = this.cache.get(originalAccount);
    if (cached) return cached;
    let account = originalAccount;
    const sources: Location[] = [];
    for (const rule of this.rules) {
      if (account !== rule.from && !account.startsWith(rule.from + ':'))
        continue;
      account = rule.to + account.slice(rule.from.length);
      if (account.length > MAX_ALIAS_NAME)
        throw new RangeError(
          `An aliased account exceeds ${MAX_ALIAS_NAME} characters.`,
        );
      sources.push(rule.source);
    }
    const result = {
      account,
      ...(sources.length ? { accountAlias: { originalAccount, sources } } : {}),
    };
    this.cache.set(originalAccount, result);
    return result;
  }
}

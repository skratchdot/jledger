import type { AccountHierarchy, Balance } from '@jledger/core';

export type AccountMode = 'inclusive' | 'direct';
export type AccountAction =
  | { type: 'toggle'; account: string }
  | { type: 'expand-all' }
  | { type: 'collapse-all' }
  | { type: 'search'; query: string };
export interface AccountRow extends Balance {
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
  directAmounts?: Balance['amounts'];
  searchMatch?: boolean;
}
export interface AccountView {
  mode: AccountMode;
  count: number;
  total: number;
  query: string;
  matchCount: number;
  canExpand: boolean;
  canCollapse: boolean;
  resetScroll: boolean;
  anchor?: { account: string; index: number };
}
export interface AccountWindow {
  start: number;
  rows: AccountRow[];
}
export const MAX_ACCOUNT_WINDOW = 200;

/** Worker-owned presentation index. Hiding rows never changes the underlying balances. */
export class AccountExplorer {
  private mode: AccountMode = 'inclusive';
  private branches = new Map<string, number>();
  private ends: Int32Array;
  private parents: Int32Array;
  private directIndices: Int32Array;
  private normalized: string[];
  private matches: Uint8Array;
  private query = '';
  private matchCount = 0;
  private collapsed = new Set<number>();
  private visible: number[] = [];
  constructor(private hierarchy: AccountHierarchy) {
    const rows = hierarchy.inclusive;
    this.ends = new Int32Array(rows.length);
    this.parents = new Int32Array(rows.length);
    this.matches = new Uint8Array(rows.length);
    this.normalized = rows.map((row) => row.account.toLowerCase());
    const indices = new Map<string, number>();
    const ancestors: number[] = [];
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index]!;
      while (ancestors.length && rows[ancestors.at(-1)!]!.depth >= row.depth)
        this.ends[ancestors.pop()!] = index;
      this.parents[index] = ancestors.at(-1) ?? -1;
      indices.set(row.account, index);
      if (row.hasChildren) {
        this.branches.set(row.account, index);
        ancestors.push(index);
      }
    }
    for (const index of ancestors) this.ends[index] = rows.length;
    this.directIndices = Int32Array.from(hierarchy.direct, (row) =>
      indices.get(row.account)!,
    );
    this.rebuild();
  }
  private rebuild() {
    const visible: number[] = [];
    const needle = this.query.toLowerCase();
    this.matches.fill(0);
    this.matchCount = 0;
    if (this.mode === 'direct') {
      for (let index = 0; index < this.hierarchy.direct.length; index++) {
        const sourceIndex = this.directIndices[index]!;
        if (!needle || this.normalized[sourceIndex]!.includes(needle)) {
          visible.push(index);
          if (needle) {
            this.matches[sourceIndex] = 1;
            this.matchCount++;
          }
        }
      }
    } else if (needle) {
      const keep = new Uint8Array(this.hierarchy.inclusive.length);
      // Preorder guarantees parents precede children. One reverse pass carries
      // context to every ancestor without walking each match's whole path.
      for (let index = keep.length - 1; index >= 0; index--) {
        if (this.normalized[index]!.includes(needle)) {
          this.matches[index] = 1;
          keep[index] = 1;
          this.matchCount++;
        }
        const parent = this.parents[index]!;
        if (keep[index] && parent >= 0) keep[parent] = 1;
      }
      for (let index = 0; index < keep.length; index++)
        if (keep[index]) visible.push(index);
    } else {
      for (let index = 0; index < this.hierarchy.inclusive.length;) {
        visible.push(index);
        index = this.collapsed.has(index) ? this.ends[index]! : index + 1;
      }
    }
    this.visible = visible;
  }
  configure(mode: AccountMode, action?: AccountAction): AccountView {
    let changed = mode !== this.mode;
    this.mode = mode;
    let target: number | undefined;
    let resetScroll = false;
    if (action?.type === 'search') {
      const next = action.query.trim();
      resetScroll = next !== this.query;
      changed ||= resetScroll;
      this.query = next;
    } else if (mode === 'inclusive' && !this.query && action) {
      if (action.type === 'expand-all') this.collapsed.clear();
      else if (action.type === 'collapse-all')
        this.collapsed = new Set(this.branches.values());
      else {
        target = this.branches.get(action.account);
        if (target !== undefined) {
          if (this.collapsed.has(target)) this.collapsed.delete(target);
          else this.collapsed.add(target);
        }
      }
      resetScroll = action.type !== 'toggle';
      changed = true;
    }
    if (changed) this.rebuild();
    const index = target === undefined ? -1 : this.visible.indexOf(target);
    return {
      mode,
      count: this.visible.length,
      total:
        mode === 'inclusive'
          ? this.hierarchy.inclusive.length
          : this.hierarchy.direct.length,
      query: this.query,
      matchCount: this.matchCount,
      resetScroll,
      canExpand: mode === 'inclusive' && !this.query && this.collapsed.size > 0,
      canCollapse:
        mode === 'inclusive' &&
        !this.query &&
        this.collapsed.size < this.branches.size,
      ...(index >= 0
        ? {
            anchor: {
              account: this.hierarchy.inclusive[target!]!.account,
              index,
            },
          }
        : {}),
    };
  }
  rows(start: number, end: number): AccountWindow {
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 0 ||
      end < start
    )
      throw new Error('Invalid account window.');
    const count = this.visible.length;
    start = Math.min(start, count);
    end = Math.min(end, count, start + MAX_ACCOUNT_WINDOW);
    const rows: AccountRow[] = [];
    for (let index = start; index < end; index++) {
      if (this.mode === 'inclusive') {
        const sourceIndex = this.visible[index]!;
        const row = this.hierarchy.inclusive[sourceIndex]!;
        rows.push({
          ...row,
          expanded:
            row.hasChildren &&
            (Boolean(this.query) || !this.collapsed.has(sourceIndex)),
          ...(this.query
            ? { searchMatch: Boolean(this.matches[sourceIndex]) }
            : {}),
        });
      } else
        rows.push({
          ...this.hierarchy.direct[this.visible[index]!]!,
          depth: 0,
          hasChildren: false,
          expanded: false,
          ...(this.query ? { searchMatch: true } : {}),
        });
    }
    return { start, rows };
  }
}

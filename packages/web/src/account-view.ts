import type { AccountHierarchy, Balance } from '@jledger/core';

export type AccountMode = 'inclusive' | 'direct';
export type AccountAction =
  | { type: 'toggle'; account: string }
  | { type: 'expand-all' }
  | { type: 'collapse-all' };
export interface AccountRow extends Balance {
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
  directAmounts?: Balance['amounts'];
}
export interface AccountView {
  mode: AccountMode;
  count: number;
  total: number;
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
  private collapsed = new Set<number>();
  private visible: number[] = [];
  constructor(private hierarchy: AccountHierarchy) {
    const rows = hierarchy.inclusive;
    this.ends = new Int32Array(rows.length);
    const ancestors: number[] = [];
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index]!;
      while (ancestors.length && rows[ancestors.at(-1)!]!.depth >= row.depth)
        this.ends[ancestors.pop()!] = index;
      if (row.hasChildren) {
        this.branches.set(row.account, index);
        ancestors.push(index);
      }
    }
    for (const index of ancestors) this.ends[index] = rows.length;
    this.rebuild();
  }
  private rebuild() {
    const visible: number[] = [];
    for (let index = 0; index < this.hierarchy.inclusive.length;) {
      visible.push(index);
      index = this.collapsed.has(index) ? this.ends[index]! : index + 1;
    }
    this.visible = visible;
  }
  configure(mode: AccountMode, action?: AccountAction): AccountView {
    this.mode = mode;
    let target: number | undefined;
    if (mode === 'inclusive' && action) {
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
      this.rebuild();
    }
    const index = target === undefined ? -1 : this.visible.indexOf(target);
    return {
      mode,
      count:
        mode === 'inclusive'
          ? this.visible.length
          : this.hierarchy.direct.length,
      total:
        mode === 'inclusive'
          ? this.hierarchy.inclusive.length
          : this.hierarchy.direct.length,
      resetScroll:
        action?.type === 'expand-all' || action?.type === 'collapse-all',
      canExpand: mode === 'inclusive' && this.collapsed.size > 0,
      canCollapse:
        mode === 'inclusive' && this.collapsed.size < this.branches.size,
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
    const count =
      this.mode === 'inclusive'
        ? this.visible.length
        : this.hierarchy.direct.length;
    start = Math.min(start, count);
    end = Math.min(end, count, start + MAX_ACCOUNT_WINDOW);
    const rows: AccountRow[] = [];
    for (let index = start; index < end; index++) {
      if (this.mode === 'inclusive') {
        const sourceIndex = this.visible[index]!;
        const row = this.hierarchy.inclusive[sourceIndex]!;
        rows.push({
          ...row,
          expanded: row.hasChildren && !this.collapsed.has(sourceIndex),
        });
      } else
        rows.push({
          ...this.hierarchy.direct[index]!,
          depth: 0,
          hasChildren: false,
          expanded: false,
        });
    }
    return { start, rows };
  }
}

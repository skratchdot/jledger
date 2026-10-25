import { useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { formatAmount } from '@jledger/core';
import type { AccountView, AccountWindow } from '../account-view';
import { Button } from './ui/button';

export function VirtualAccounts({
  view,
  window,
  onRangeChange,
  onToggle,
  onSelect,
  busy,
}: {
  view: AccountView & { id: number };
  window: AccountWindow;
  onRangeChange: (range: { start: number; end: number }) => void;
  onToggle: (account: string) => void;
  onSelect: (name: string) => void;
  busy: boolean;
}) {
  const scroll = useRef<HTMLDivElement>(null);
  const focusedView = useRef(0);
  const virtualizer = useVirtualizer({
    count: view.count,
    getScrollElement: () => scroll.current,
    estimateSize: () => 49,
    overscan: 6,
  });
  const items = virtualizer.getVirtualItems();
  const start = items[0]?.index ?? 0;
  const end = (items.at(-1)?.index ?? -1) + 1;
  useEffect(() => {
    onRangeChange({ start, end });
  }, [start, end, onRangeChange]);
  useEffect(() => {
    if (view.anchor)
      virtualizer.scrollToIndex(view.anchor.index, { align: 'auto' });
    else if (view.resetScroll) virtualizer.scrollToOffset(0);
  }, [view.id]);
  useEffect(() => {
    if (!view.anchor || !scroll.current || focusedView.current === view.id)
      return;
    const active = document.activeElement;
    if (
      active &&
      active !== document.body &&
      !scroll.current.contains(active)
    ) {
      focusedView.current = view.id;
      return;
    }
    const button = [
      ...scroll.current.querySelectorAll<HTMLButtonElement>(
        'button[data-account-toggle]',
      ),
    ].find((node) => node.dataset.accountToggle === view.anchor!.account);
    if (button) {
      button.focus({ preventScroll: true });
      focusedView.current = view.id;
    }
  }, [view.id, window]);
  return (
    <div
      ref={scroll}
      className="account-list virtual-accounts"
      role="list"
      aria-label="Account balances"
      aria-busy={busy}
      tabIndex={0}
    >
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {items.map((item) => {
          const balance = window.rows[item.index - window.start];
          return (
            <div
              key={balance?.account ?? item.key}
              data-index={item.index}
              ref={virtualizer.measureElement}
              role="listitem"
              aria-posinset={item.index + 1}
              aria-setsize={view.count}
              className="account-row"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                transform: `translateY(${item.start}px)`,
              }}
            >
              {balance ? (
                <>
                  <span
                    className="account-disclosure"
                    style={{
                      paddingInlineStart: Math.min(balance.depth, 8) * 12,
                    }}
                  >
                    {balance.hasChildren ? (
                      <Button
                        variant="ghost"
                        className="account-expand"
                        data-account-toggle={balance.account}
                        aria-label={`${balance.expanded ? 'Collapse' : 'Expand'} ${balance.account}`}
                        aria-expanded={balance.expanded}
                        disabled={busy || Boolean(view.query)}
                        onClick={() => onToggle(balance.account)}
                      >
                        <span aria-hidden="true">
                          {balance.expanded ? '▾' : '▸'}
                        </span>
                      </Button>
                    ) : (
                      <span
                        className="account-leaf-spacer"
                        aria-hidden="true"
                      />
                    )}
                  </span>
                  <button
                    className="account-select"
                    title={
                      balance.directAmounts
                        ? `${balance.account} · direct postings: ${balance.directAmounts.length ? balance.directAmounts.map(formatAmount).join(' · ') : 'none'}`
                        : balance.account
                    }
                    onClick={() => onSelect(balance.account)}
                  >
                    <span
                      className={
                        balance.hasChildren || balance.searchMatch
                          ? 'account-parent'
                          : undefined
                      }
                    >
                      {balance.account}
                      {view.query && !balance.searchMatch && (
                        <small className="account-context"> · ancestor</small>
                      )}
                    </span>
                    <strong>
                      {balance.amounts.map(formatAmount).join(' · ')}
                    </strong>
                  </button>
                </>
              ) : (
                <span className="muted">Loading…</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

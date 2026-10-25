import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { formatAmount, type Balance, type AccountRollup } from '@jledger/core';
export function VirtualAccounts({
  accounts,
  onSelect,
}: {
  accounts: (Balance | AccountRollup)[];
  onSelect: (name: string) => void;
}) {
  const scroll = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: accounts.length,
    getScrollElement: () => scroll.current,
    estimateSize: () => 49,
    overscan: 6,
  });
  return (
    <div
      ref={scroll}
      className="account-list virtual-accounts"
      aria-label="Account balances"
      tabIndex={0}
    >
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((item) => {
          const balance = accounts[item.index]!;
          return (
            <button
              key={item.key}
              data-index={item.index}
              ref={virtualizer.measureElement}
              className="account-row"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                transform: `translateY(${item.start}px)`,
              }}
              title={
                'directAmounts' in balance
                  ? `${balance.account} · direct postings: ${balance.directAmounts.length ? balance.directAmounts.map(formatAmount).join(' · ') : 'none'}`
                  : balance.account
              }
              onClick={() => onSelect(balance.account)}
            >
              <span
                className={
                  'hasChildren' in balance && balance.hasChildren
                    ? 'account-parent'
                    : undefined
                }
                style={{
                  paddingInlineStart:
                    'depth' in balance ? Math.min(balance.depth, 8) * 12 : 0,
                }}
              >
                {balance.account}
              </span>
              <strong>{balance.amounts.map(formatAmount).join(' · ')}</strong>
            </button>
          );
        })}
      </div>
    </div>
  );
}

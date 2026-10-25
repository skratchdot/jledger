import { useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { formatAmount } from '@jledger/core';
import type { Row } from '../journal-engine';
import { matchesPosting } from '../report-filters';

export function VirtualRegister({
  count,
  window,
  filterKey,
  currency,
  account,
  month,
  dateFrom,
  dateTo,
  onRange,
  onAccount,
  onInspect,
}: {
  count: number;
  window: { start: number; rows: Row[] };
  filterKey: string;
  currency: string;
  account: string;
  month: string;
  dateFrom: string;
  dateTo: string;
  onRange: (range: { start: number; end: number }) => void;
  onAccount: (name: string) => void;
  onInspect: (id: number) => void;
}) {
  const filters = { commodity: currency, account, month, dateFrom, dateTo };
  const scroll = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => scroll.current,
    estimateSize: () => 100,
    overscan: 6,
  });
  const items = virtualizer.getVirtualItems();
  const start = items[0]?.index ?? 0,
    end = (items.at(-1)?.index ?? 39) + 1;
  useEffect(() => onRange({ start, end }), [start, end, onRange]);
  useEffect(() => {
    virtualizer.scrollToOffset(0);
  }, [filterKey]);
  return (
    <div
      ref={scroll}
      className="table-scroll virtual-register"
      aria-label="Scrollable transaction register"
      tabIndex={0}
    >
      <table aria-rowcount={count + 1}>
        <thead>
          <tr>
            <th>Transaction date</th>
            <th>Description</th>
            <th>Accounts</th>
            <th className="align-right">Posting amounts</th>
          </tr>
        </thead>
        <tbody>
          {items.length > 0 && (
            <tr aria-hidden="true">
              <td colSpan={4} style={{ height: items[0]!.start, padding: 0 }} />
            </tr>
          )}
          {items.map((item) => {
            const tx = window.rows[item.index - window.start];
            if (!tx)
              return (
                <tr
                  key={item.key}
                  aria-rowindex={item.index + 2}
                  data-index={item.index}
                >
                  <td colSpan={4} style={{ height: 100 }} className="muted">
                    Loading…
                  </td>
                </tr>
              );
            const postings = tx.postings.filter((p) =>
              matchesPosting(p, tx.date, filters),
            );
            return (
              <tr
                key={item.key}
                data-index={item.index}
                ref={virtualizer.measureElement}
                aria-rowindex={item.index + 2}
              >
                <td className="date-cell">{tx.date}</td>
                <td>
                  <button
                    className="transaction-link"
                    onClick={() => onInspect(tx.id)}
                  >
                    <span
                      className={`status status-${tx.status === '*' ? 'cleared' : tx.status === '!' ? 'pending' : 'unmarked'}`}
                      title={
                        tx.status === '*'
                          ? 'Cleared'
                          : tx.status === '!'
                            ? 'Pending'
                            : 'Unmarked'
                      }
                    >
                      {tx.status || '·'}
                    </span>
                    {tx.description || '(no description)'}
                  </button>
                  <small className="source-ref">
                    {tx.source.file}:{tx.source.line}
                  </small>
                </td>
                <td>
                  {postings.slice(0, 3).map((p, i) => (
                    <button
                      key={i}
                      className="account-chip"
                      onClick={() => onAccount(p.account)}
                    >
                      {p.account}
                    </button>
                  ))}
                  {postings.length > 3 && (
                    <small className="muted">
                      +{postings.length - 3} more in details
                    </small>
                  )}
                </td>
                <td className="posting-amounts">
                  {postings.slice(0, 3).map((p, i) => (
                    <div key={i}>
                      {formatAmount(p.amount)}
                      {p.date && <small> posted {p.date}</small>}
                    </div>
                  ))}
                </td>
              </tr>
            );
          })}
          {items.length > 0 && (
            <tr aria-hidden="true">
              <td
                colSpan={4}
                style={{
                  height: Math.max(
                    0,
                    virtualizer.getTotalSize() - items.at(-1)!.end,
                  ),
                  padding: 0,
                }}
              />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

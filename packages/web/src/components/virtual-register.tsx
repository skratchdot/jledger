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
  status,
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
  status: string;
  onRange: (range: { start: number; end: number }) => void;
  onAccount: (name: string) => void;
  onInspect: (id: number) => void;
}) {
  const filters = {
    commodity: currency,
    account,
    month,
    dateFrom,
    dateTo,
    status,
  };
  const scroll = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => scroll.current,
    estimateSize: () => 100,
    // Keep the end visible as estimated row sizes become measured sizes.
    anchorTo: 'end',
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
      <table
        role="table"
        aria-colcount={4}
        aria-label="Transaction register"
        aria-rowcount={count + 1}
      >
        <thead role="rowgroup">
          <tr role="row">
            <th role="columnheader">Transaction date</th>
            <th role="columnheader">Description</th>
            <th role="columnheader">Accounts</th>
            <th role="columnheader" className="align-right">
              Posting amounts
            </th>
          </tr>
        </thead>
        <tbody
          role="rowgroup"
          style={{ height: virtualizer.getTotalSize(), position: 'relative' }}
        >
          {items.map((item) => {
            const tx = window.rows[item.index - window.start];
            if (!tx)
              return (
                <tr
                  role="row"
                  key={item.key}
                  aria-rowindex={item.index + 2}
                  data-index={item.index}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    transform: `translateY(${item.start}px)`,
                    height: item.size,
                  }}
                >
                  <td
                    role="cell"
                    colSpan={4}
                    style={{ gridColumn: '1 / -1' }}
                    className="muted"
                  >
                    Loading…
                  </td>
                </tr>
              );
            const postings = tx.postings.filter((p) =>
              matchesPosting(p, tx.date, filters, tx.status),
            );
            return (
              <tr
                role="row"
                key={item.key}
                data-index={item.index}
                ref={virtualizer.measureElement}
                aria-rowindex={item.index + 2}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  transform: `translateY(${item.start}px)`,
                }}
              >
                <td role="cell" className="date-cell">
                  {tx.date}
                </td>
                <td role="cell">
                  <button
                    className="transaction-link"
                    onClick={() => onInspect(tx.id)}
                  >
                    <span
                      className={`status status-${tx.status === '*' ? 'cleared' : tx.status === '!' ? 'pending' : 'unmarked'}`}
                      title={
                        tx.status === '*'
                          ? 'Cleared transaction'
                          : tx.status === '!'
                            ? 'Pending transaction'
                            : 'Unmarked transaction'
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
                <td role="cell">
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
                <td role="cell" className="posting-amounts">
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
        </tbody>
      </table>
    </div>
  );
}

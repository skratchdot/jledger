import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { formatAmount } from '@jledger/core';
import { chartPercentages } from '../chart-scale';
import { Button } from './ui/button';

const PAGE_SIZE = 12;

/** Bounded chart DOM over existing worker aggregates; no financial calculations. */
export function MonthlySpendingChart({
  rows,
  commodity,
  selected,
  busy,
  onSelect,
}: {
  rows: { month: string; value: string }[];
  commodity: string;
  selected: string;
  busy: boolean;
  onSelect: (month: string) => void;
}) {
  const heights = useMemo(
    () => chartPercentages(rows.map((row) => row.value)),
    [rows],
  );
  const region = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef(false);
  const [pagination, setPagination] = useState({ rows, page: 0 });
  if (pagination.rows !== rows) setPagination({ rows, page: 0 });
  const page = pagination.rows === rows ? pagination.page : 0;
  const lastPage = Math.max(0, Math.ceil(rows.length / PAGE_SIZE) - 1);
  const currentPage = Math.min(page, lastPage);
  const start = currentPage * PAGE_SIZE;
  const visible = rows.slice(start, start + PAGE_SIZE);
  useLayoutEffect(() => {
    scroller.current?.scrollTo({ left: 0 });
  }, [rows, currentPage]);
  useLayoutEffect(() => {
    if (restoreFocus.current && document.activeElement === document.body)
      region.current?.focus();
    restoreFocus.current = false;
  }, [rows]);
  return (
    <div
      ref={region}
      role="region"
      aria-label="Monthly spending chart"
      aria-busy={busy}
      tabIndex={-1}
    >
      <div className="monthly-chart" ref={scroller}>
        {visible.map((row, i) => (
          <Button
            key={row.month}
            className={`month-column ${selected === row.month ? 'chosen' : ''}`}
            aria-label={`Filter month ${row.month}`}
            aria-pressed={selected === row.month}
            disabled={busy}
            focusableWhenDisabled
            onClick={() => {
              restoreFocus.current = true;
              onSelect(row.month);
            }}
          >
            <span className="month-value">
              {formatAmount({ quantity: row.value, commodity })}
            </span>
            <div className="column-track">
              <div style={{ height: `${heights[start + i]}%` }} />
            </div>
            <span>{row.month}</span>
          </Button>
        ))}
      </div>
      {!rows.length && <p className="empty">No matching months.</p>}
      <div className="report-data-pages">
        <Button
          variant="outline"
          disabled={busy || currentPage === 0}
          focusableWhenDisabled
          aria-label="Previous monthly chart page"
          onClick={() => setPagination({ rows, page: currentPage - 1 })}
        >
          Previous
        </Button>
        <span role="status">
          {rows.length
            ? `${start + 1}–${start + visible.length} of ${rows.length} months`
            : '0 months'}
        </span>
        <Button
          variant="outline"
          disabled={busy || currentPage === lastPage}
          focusableWhenDisabled
          aria-label="Next monthly chart page"
          onClick={() => setPagination({ rows, page: currentPage + 1 })}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

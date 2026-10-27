import { useLayoutEffect, useRef, useState } from 'react';
import { formatAmount } from '@jledger/core';
import { Button } from './ui/button';

const PAGE_SIZE = 25;

/** Displays existing worker aggregates; never recalculates financial values. */
export function ReportDataTable<T>({
  rows,
  caption,
  column,
  valueColumn = 'Net spending',
  commodity,
  label,
  value,
  selected,
  toggleSelection = false,
  onSelect,
  busy,
}: {
  rows: readonly T[];
  caption: string;
  column: string;
  valueColumn?: string;
  commodity: string;
  label: (row: T) => string;
  value: (row: T) => string;
  selected: string;
  toggleSelection?: boolean;
  onSelect: (label: string) => void;
  busy: boolean;
}) {
  const captionRef = useRef<HTMLTableCaptionElement>(null);
  const restoreFocus = useRef(false);
  useLayoutEffect(() => {
    // A filter may remove its own row (for example, clearing a selected month
    // beyond page one). Keep keyboard users at this table without stealing focus
    // from someone who moved to another control while the worker was running.
    if (restoreFocus.current && document.activeElement === document.body)
      captionRef.current?.focus();
    restoreFocus.current = false;
  }, [rows]);
  const [pagination, setPagination] = useState({ rows, page: 0 });
  // Reset only when a new worker report arrives, keeping the current page and
  // its focused row mounted while a drill-down query is pending.
  if (pagination.rows !== rows) setPagination({ rows, page: 0 });
  const page = pagination.rows === rows ? pagination.page : 0;
  const lastPage = Math.max(0, Math.ceil(rows.length / PAGE_SIZE) - 1);
  const currentPage = Math.min(page, lastPage);
  const start = currentPage * PAGE_SIZE;
  const visible = rows.slice(start, start + PAGE_SIZE);
  return (
    <div className="report-data" aria-busy={busy}>
      <table>
        <caption ref={captionRef} tabIndex={-1}>
          {caption} · {commodity || 'No commodity'}
        </caption>
        <thead>
          <tr>
            <th scope="col">{column}</th>
            <th scope="col">{valueColumn}</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((row) => {
            const name = label(row);
            return (
              <tr key={name}>
                <th scope="row">
                  <Button
                    variant="ghost"
                    className="report-data-filter"
                    aria-label={`Filter ${column.toLowerCase()} ${name}`}
                    aria-pressed={
                      toggleSelection ? selected === name : undefined
                    }
                    aria-current={
                      !toggleSelection && selected === name ? 'true' : undefined
                    }
                    disabled={busy}
                    focusableWhenDisabled
                    onClick={() => {
                      restoreFocus.current = true;
                      onSelect(name);
                    }}
                  >
                    {name}
                  </Button>
                </th>
                <td>{formatAmount({ quantity: value(row), commodity })}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!rows.length && (
        <p className="empty">No matching {caption.toLowerCase()}.</p>
      )}
      <div className="report-data-pages">
        <Button
          variant="outline"
          disabled={busy || currentPage === 0}
          focusableWhenDisabled
          aria-label={`Previous ${caption.toLowerCase()} page`}
          onClick={() => setPagination({ rows, page: currentPage - 1 })}
        >
          Previous
        </Button>
        <span role="status">
          {rows.length
            ? `${start + 1}–${start + visible.length} of ${rows.length}`
            : '0 results'}
        </span>
        <Button
          variant="outline"
          disabled={busy || currentPage === lastPage}
          focusableWhenDisabled
          aria-label={`Next ${caption.toLowerCase()} page`}
          onClick={() => setPagination({ rows, page: currentPage + 1 })}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { ReportDataTable } from './report-data-table';

/** Financial values arrive from the worker; closed disclosures mount no table. */
export function MonthlyIncome({
  rows,
  commodity,
  month,
  busy,
  onSelect,
}: {
  rows: readonly { month: string; value: string }[];
  commodity: string;
  month: string;
  busy: boolean;
  onSelect: (month: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="panel monthly-income"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>Income over time</summary>
      {open && (
        <>
          <p className="muted">
            Net income by effective posting month under your current filters.
            Credits are positive; reversals reduce income. Zero months remain
            visible where the journal has postings. Boundary months may be
            partial. Select a month to explore its transactions; select it again
            to clear the month scope.
          </p>
          <ReportDataTable
            rows={rows}
            caption="Monthly income"
            column="Month"
            valueColumn="Net income"
            commodity={commodity}
            label={(row) => row.month}
            value={(row) => row.value}
            selected={month}
            toggleSelection
            busy={busy}
            onSelect={onSelect}
          />
        </>
      )}
    </details>
  );
}

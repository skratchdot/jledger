import { useState } from 'react';
import { ReportDataTable } from './report-data-table';

/** Financial values arrive from the worker; closed disclosures mount no table. */
export function MonthlySurplus({
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
      className="panel monthly-surplus"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>Income less spending</summary>
      {open && (
        <>
          <p className="muted">
            Income minus spending by effective posting month under your current
            filters. Positive amounts mean income exceeded spending; negative
            amounts mean spending exceeded income. Refunds and income reversals
            retain their signs. This is not cash movement, an account balance or
            net worth: transfers and unclassified accounts do not contribute.
            Account filters can exclude either side. Boundary months may be
            partial; zero months remain visible where the journal has postings.
            Select a month to explore its transactions; select it again to clear
            the month scope.
          </p>
          <ReportDataTable
            rows={rows}
            caption="Monthly income less spending"
            column="Month"
            valueColumn="Income less spending"
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

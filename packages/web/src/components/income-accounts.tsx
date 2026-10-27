import { useState } from 'react';
import { ReportDataTable } from './report-data-table';

/** Disclosure mounts only a bounded table page; amounts/order already come from the worker. */
export function IncomeAccounts({
  rows,
  commodity,
  account,
  busy,
  onSelect,
}: {
  rows: readonly [string, string][];
  commodity: string;
  account: string;
  busy: boolean;
  onSelect: (account: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="panel income-accounts"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>Income by account</summary>
      {open && (
        <>
          <p className="muted">
            Income postings matching your filters. Credits are positive;
            reversals reduce income. Choose an account to explore its
            transactions.
          </p>
          <ReportDataTable
            rows={rows}
            caption="Income accounts"
            column="Account"
            valueColumn="Net income"
            commodity={commodity}
            label={(row) => row[0]}
            value={(row) => row[1]}
            selected={account}
            busy={busy}
            onSelect={onSelect}
          />
        </>
      )}
    </details>
  );
}

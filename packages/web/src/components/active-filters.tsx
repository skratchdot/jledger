import type { Filters } from '../report-filters';
import { Button } from './ui/button';

export type FilterChip = 'query' | 'account' | 'dates' | 'status';
const statusNames: Record<string, string> = {
  '*': 'Cleared',
  '!': 'Pending',
  '': 'Unmarked',
};

/** A small scope description; financial matching and totals remain in the worker. */
export function ActiveFilters({
  filters,
  onClear,
}: {
  filters: Filters;
  onClear: (filter: FilterChip) => void;
}) {
  const chips: { key: FilterChip; label: string; action: string }[] = [];
  if (filters.query)
    chips.push({
      key: 'query',
      label: `Search: ${filters.query}`,
      action: 'Clear search filter',
    });
  if (filters.account)
    chips.push({
      key: 'account',
      label: `Account: ${filters.account} (and subaccounts)`,
      action: 'Clear account filter',
    });
  if (filters.month || filters.dateFrom || filters.dateTo)
    chips.push({
      key: 'dates',
      label: filters.month
        ? `Month: ${filters.month}`
        : `Dates: ${filters.dateFrom || 'beginning'} through ${filters.dateTo || 'end'}`,
      action: 'Clear date filter',
    });
  if (filters.status !== 'all')
    chips.push({
      key: 'status',
      label: `Status: ${statusNames[filters.status] ?? filters.status}`,
      action: 'Clear status filter',
    });
  return (
    <ul className="filter-chips" aria-label="Active filters">
      <li>
        <span
          className="commodity-chip"
          title={`Commodity: ${filters.commodity || 'No commodity'}`}
        >
          <span className="chip-label">
            Commodity: {filters.commodity || 'No commodity'}
          </span>
        </span>
      </li>
      {chips.map((chip) => (
        <li key={chip.key}>
          <Button
            variant="ghost"
            className="filter-chip"
            aria-label={chip.action}
            title={chip.label}
            onClick={() => onClear(chip.key)}
          >
            <span className="chip-label">{chip.label}</span>
            <span aria-hidden="true">×</span>
          </Button>
        </li>
      ))}
    </ul>
  );
}

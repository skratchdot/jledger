import { useRef, useState, type FormEvent } from 'react';
import type { Filters } from '../report-filters';
import { Button } from './ui/button';

const MAX_SAVED_FILTERS = 20;
const MAX_NAME_LENGTH = 80;
interface SavedFilter {
  id: number;
  name: string;
  filters: Filters;
}

/** Mounted once per loaded journal. No source data, URLs or browser storage. */
export function SavedFilters({
  filters,
  busy,
  invalidRange,
  onApply,
}: {
  filters: Filters;
  busy: boolean;
  invalidRange: boolean;
  onApply: (filters: Filters) => void;
}) {
  const [saved, setSaved] = useState<SavedFilter[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const nextId = useRef(0);
  const nameInput = useRef<HTMLInputElement>(null);
  const atLimit = saved.length >= MAX_SAVED_FILTERS;
  function save(event: FormEvent) {
    event.preventDefault();
    if (busy || invalidRange || atLimit) return;
    const label = name.trim();
    if (!label) {
      setError('Enter a name for this filter.');
      nameInput.current?.focus();
      return;
    }
    if (
      saved.some((entry) => entry.name.toLowerCase() === label.toLowerCase())
    ) {
      setError(
        'That name is already saved. Choose another name or remove the existing filter.',
      );
      nameInput.current?.focus();
      return;
    }
    const entry = {
      id: ++nextId.current,
      name: label,
      filters: { ...filters },
    };
    setSaved((previous) => [...previous, entry]);
    setName('');
    setError('');
    setNotice(`Saved ${label}.`);
  }
  return (
    <details className="saved-filters">
      <summary>Saved filters ({saved.length})</summary>
      <p id="saved-filter-help" className="muted">
        For this open journal only. Replacing, closing, reloading files, or
        refreshing the page clears saved filters.
      </p>
      <form className="save-filter-form" onSubmit={save}>
        <label htmlFor="saved-filter-name">Filter name</label>
        <input
          ref={nameInput}
          id="saved-filter-name"
          value={name}
          required
          maxLength={MAX_NAME_LENGTH}
          autoComplete="off"
          aria-invalid={Boolean(error)}
          aria-describedby={
            error ? 'saved-filter-help saved-filter-error' : 'saved-filter-help'
          }
          onChange={(event) => {
            setName(event.target.value);
            setError('');
          }}
        />
        <Button
          type="submit"
          variant="outline"
          disabled={busy || invalidRange || atLimit}
        >
          Save current filters
        </Button>
      </form>
      {error && (
        <p id="saved-filter-error" role="alert">
          {error}
        </p>
      )}
      {invalidRange && (
        <p className="muted">
          Correct the date range before saving. You can still apply a saved
          filter.
        </p>
      )}
      {atLimit && (
        <p className="muted">
          Limit of {MAX_SAVED_FILTERS} saved filters reached. Remove one to save
          another.
        </p>
      )}
      {saved.length > 0 && (
        <ul className="saved-filter-list" aria-label="Saved filter presets">
          {saved.map((entry) => {
            const active = (
              Object.keys(entry.filters) as (keyof Filters)[]
            ).every((key) => entry.filters[key] === filters[key]);
            return (
              <li key={entry.id}>
                <Button
                  variant="ghost"
                  className="saved-filter-apply"
                  title={entry.name}
                  aria-label={`Apply saved filter ${entry.name}`}
                  aria-pressed={active}
                  disabled={busy}
                  onClick={() => {
                    onApply({ ...entry.filters });
                    setNotice(`Applied ${entry.name}.`);
                  }}
                >
                  <span className="chip-label">{entry.name}</span>
                </Button>
                <Button
                  variant="ghost"
                  aria-label={`Remove saved filter ${entry.name}`}
                  onClick={() => {
                    setSaved((previous) =>
                      previous.filter((item) => item.id !== entry.id),
                    );
                    setNotice(`Removed ${entry.name}.`);
                    setError('');
                    nameInput.current?.focus();
                  }}
                >
                  ×
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="saved-filter-notice" role="status">
        {notice}
      </p>
    </details>
  );
}

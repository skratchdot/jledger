import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ACCOUNT_TYPE_LABELS,
  effectivePostingStatus,
  formatAmount,
  type Source,
} from '@jledger/core';
import demo from '@jledger/examples/demo.journal?raw';
import { useJournal } from './use-journal';
import { useFilterHistory } from './filter-history';
import { dateRangeError, monthBounds, type Filters } from './report-filters';
import { ActiveFilters, type FilterChip } from './components/active-filters';
import { SavedFilters } from './components/saved-filters';
import { IncomeAccounts } from './components/income-accounts';
import { ReportDataTable } from './components/report-data-table';
import { VirtualRegister } from './components/virtual-register';
import { VirtualAccounts } from './components/virtual-accounts';
import { Button } from './components/ui/button';

const LIMIT = 256 * 1024 * 1024;
const BASE = import.meta.env.BASE_URL;
const palette = ['#c58a4b', '#758b64', '#a0798e', '#6f929e', '#c1ab66'];
function metric(value: string, commodity: string) {
  return formatAmount({ quantity: value, commodity });
}

export function Explorer() {
  const history = useFilterHistory();
  const filters = history.filters;
  const { query, account, month, dateFrom, dateTo, commodity, status } =
    filters;
  const setQuery = (value: string) => history.change({ query: value }, 'query');
  const setAccount = (value: string) => history.change({ account: value });
  const setCommodity = (value: string) => history.change({ commodity: value });
  const setStatus = (value: string) => history.change({ status: value });
  const [view, setView] = useState<'overview' | 'accounts'>('overview');
  const [spendingDisplay, setSpendingDisplay] = useState<'charts' | 'tables'>(
    'charts',
  );
  const [includeSubaccounts, setIncludeSubaccounts] = useState(true);
  const [offline, setOffline] = useState(false),
    [local, setLocal] = useState(false);
  const [accountRange, updateAccountRange] = useState({ start: 0, end: 40 });
  const setAccountRange = useCallback(
    (next: { start: number; end: number }) =>
      updateAccountRange((previous) =>
        previous.start === next.start && previous.end === next.end
          ? previous
          : next,
      ),
    [],
  );
  const [range, updateRange] = useState({ start: 0, end: 40 });
  const setRange = useCallback(
    (next: { start: number; end: number }) =>
      updateRange((previous) =>
        previous.start === next.start && previous.end === next.end
          ? previous
          : next,
      ),
    [],
  );
  const invalidDateRange = dateRangeError(dateFrom, dateTo);
  const engine = useJournal(filters, range, accountRange, includeSubaccounts);
  const {
    summary,
    journalRevision,
    report,
    busy,
    message,
    setMessage,
    load,
    detail: selected,
    setDetail: setSelected,
  } = engine;
  const sources = summary.names.map((name) => ({ name }));
  const valid = !summary.diagnosticCount;
  const accountCount = includeSubaccounts
    ? summary.accountRollupCount
    : summary.accountCount;
  const commodities = summary.commodities,
    months = summary.months;
  const currency = commodities.includes(commodity)
    ? commodity
    : (commodities[0] ?? '');
  const accountMatches = engine.accountView.matchCount;
  const accountAncestors = engine.accountView.count - accountMatches;
  const categories = report.categories.slice(0, 30);
  const comparison =
    !busy &&
    report.comparison?.month === month &&
    report.comparison.dateFrom === dateFrom &&
    report.comparison.dateTo === dateTo
      ? report.comparison
      : undefined;
  const previousLabel =
    comparison?.previousMonth ||
    (comparison
      ? `${comparison.previousDateFrom} through ${comparison.previousDateTo}`
      : '');
  const signedAmount = (value: string) =>
    `${value.startsWith('-') ? '' : '+'}${metric(value, currency)}`;
  const biggest = Math.max(
    1,
    ...categories.map(([, value]) => Math.abs(Number(value))),
  );
  const accountSearchInput = useRef<HTMLInputElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const fromDateInput = useRef<HTMLInputElement>(null);
  const statusInput = useRef<HTMLSelectElement>(null);
  const monthInput = useRef<HTMLSelectElement>(null);
  const nextLocal = useRef(false);
  const importFilters = useRef(filters);
  const importTrigger = useRef<HTMLButtonElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  function resetFilters() {
    history.change({
      query: '',
      account: '',
      month: '',
      dateFrom: '',
      dateTo: '',
      status: 'all',
    });
    setSelected(null);
  }
  function applyFilters(next: Filters) {
    history.change(next);
    setSelected(null);
  }
  function clearFilter(filter: FilterChip) {
    if (filter === 'query' || filter === 'account') {
      if (filter === 'query') history.change({ query: '' });
      else setAccount('');
      searchInput.current?.focus();
    } else if (filter === 'status') {
      setStatus('all');
      statusInput.current?.focus();
    } else {
      selectMonth('');
      fromDateInput.current?.focus();
    }
    setSelected(null);
  }
  function selectMonth(next: string) {
    const bounds = next ? monthBounds(next) : { dateFrom: '', dateTo: '' };
    history.change({ month: next, ...bounds });
    setSelected(null);
  }
  function changeDate(which: 'from' | 'through', value: string) {
    history.change(
      {
        month: '',
        ...(which === 'from' ? { dateFrom: value } : { dateTo: value }),
      },
      which,
    );
    setSelected(null);
  }
  function replaceSources(next: Source[]) {
    nextLocal.current = false;
    importFilters.current = filters;
    load({ sources: next });
  }
  function importFiles(files: File[]) {
    if (!files.length) return;
    if (files.reduce((sum, file) => sum + file.size, 0) > LIMIT) {
      setMessage('Choose files totaling 256 MiB or less.');
      return;
    }
    nextLocal.current = false;
    importFilters.current = filters;
    load({ files });
  }
  function loadLocal() {
    nextLocal.current = true;
    importFilters.current = filters;
    load({ localUrl: `${BASE}api/journals` });
  }
  useEffect(() => {
    if (journalRevision) {
      // Clear the previous scope without erasing input entered during parsing.
      const before = importFilters.current;
      const nextFilters = {
        ...filters,
        query: query === before.query ? '' : query,
        account: account === before.account ? '' : account,
        month: month === before.month ? '' : month,
        dateFrom: dateFrom === before.dateFrom ? '' : dateFrom,
        dateTo: dateTo === before.dateTo ? '' : dateTo,
        status: status === before.status ? 'all' : status,
      };
      history.reset(nextFilters);
      importFilters.current = nextFilters;
      setSelected(null);
      setLocal(nextLocal.current);
    }
  }, [journalRevision]);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('local') === '1') {
      setLocal(true);
      void loadLocal();
    }
    if (import.meta.env.PROD && 'serviceWorker' in navigator) {
      void navigator.serviceWorker
        .register(`${BASE}sw.js`, { scope: BASE })
        .then(async (registration) => {
          if (registration.active) setOffline(true);
          else {
            const worker = registration.installing || registration.waiting;
            worker?.addEventListener('statechange', () => {
              if (worker.state === 'activated') setOffline(true);
            });
          }
        })
        .catch(() => setOffline(false));
    }
  }, []);

  return (
    <div
      className="app"
      onDragOver={(e) => {
        e.preventDefault();
      }}
      onDrop={(e) => {
        e.preventDefault();
        void importFiles(Array.from(e.dataTransfer.files));
      }}
    >
      <aside className="sidebar">
        <a className="brand" href={BASE}>
          <span className="brand-mark">j.</span> jledger{' '}
          <span className="alpha">alpha</span>
        </a>
        <p className="nav-label">YOUR WORKSPACE</p>
        <Button
          className={`nav-item ${view === 'overview' ? 'active' : ''}`}
          onClick={() => setView('overview')}
        >
          <span>◫</span> Overview
        </Button>
        <Button
          className={`nav-item ${view === 'accounts' ? 'active' : ''}`}
          onClick={() => setView('accounts')}
        >
          <span>≡</span> Accounts <small>{accountCount}</small>
        </Button>
        <div className="sidebar-divider" />
        <p className="nav-label">
          OPEN JOURNALS <span>{sources.length}</span>
        </p>
        <div className="source-list">
          {sources.length ? (
            sources.map((s, i) => (
              <div key={`${s.name}-${i}`} className="source">
                <span>▤</span>
                <span title={s.name}>{s.name}</span>
              </div>
            ))
          ) : (
            <p className="muted">No journals open yet</p>
          )}
        </div>
        <Button
          ref={importTrigger}
          className="sidebar-import"
          onClick={() => fileInput.current?.click()}
        >
          ＋ Import journals
        </Button>
        <Button
          className="sidebar-import"
          disabled={busy}
          onClick={() => folderInput.current?.click()}
        >
          ＋ Import journal folder
        </Button>
        {local && (
          <Button
            className="sidebar-import"
            disabled={busy}
            onClick={() => void loadLocal()}
          >
            ↻ Reload files
          </Button>
        )}
        <div className="privacy-card">
          <span className="privacy-dot" /> Private by design
          <p>Files are read in memory. No uploads, accounts, or analytics.</p>
          <small>
            {offline
              ? '✓ App available offline'
              : 'Local-first journal explorer'}
          </small>
        </div>
        <div className="sidebar-bottom">Plain text. Clear perspective.</div>
      </aside>
      <main>
        <header className="topbar">
          <span>
            Workspace <span className="crumb">/</span>{' '}
            {view === 'overview' ? 'Overview' : 'Accounts'}
          </span>
          <span className="private-badge">
            <span className="privacy-dot" />{' '}
            {local ? 'Local server' : 'On your device'}
          </span>
        </header>
        <div className="content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">A LITTLE CLARITY FOR YOUR FINANCES</div>
              <h1>
                {view === 'overview'
                  ? 'Your money, in focus.'
                  : 'Every account, accounted for.'}
              </h1>
              <p className="muted">
                Explore the story in your journals. It stays yours.
              </p>
            </div>
            <Button
              className="primary"
              disabled={busy}
              onClick={() => fileInput.current?.click()}
            >
              ＋ {busy ? 'Reading…' : 'Import journals'}
            </Button>
          </div>
          <input
            ref={fileInput}
            aria-label="Import journal files"
            className="file-input"
            type="file"
            multiple
            accept=".journal,.ledger,.hledger,.j,.txt"
            onChange={(e) => {
              void importFiles(Array.from(e.target.files ?? []));
              e.target.value = '';
            }}
          />
          <input
            ref={folderInput}
            aria-label="Import journal folder"
            className="file-input"
            type="file"
            multiple
            {...{ webkitdirectory: '' }}
            onChange={(e) => {
              void importFiles(Array.from(e.target.files ?? []));
              e.target.value = '';
            }}
          />
          {engine.importing ? (
            <div className="work-status import-status">
              <span role="status" aria-label="Import progress">
                {engine.importProgress?.phase === 'reading'
                  ? `Reading journal files: ${engine.importProgress.completed} of ${engine.importProgress.total}.`
                  : engine.importProgress?.phase === 'fetching'
                    ? 'Reading selected local journals…'
                    : 'Parsing journals and building indexes…'}{' '}
                The open journal is replaced only when this import finishes.
              </span>
              <Button
                variant="outline"
                onClick={() => {
                  engine.cancelImport();
                  importTrigger.current?.focus();
                }}
              >
                Cancel import
              </Button>
            </div>
          ) : (
            busy && (
              <div className="work-status" role="status">
                Updating reports in the background…
              </div>
            )
          )}
          {message && !invalidDateRange && (
            <div className="notice" role="alert">
              {message}
            </div>
          )}
          {!sources.length ? (
            <section className="welcome panel">
              <div className="welcome-symbol">▤</div>
              <div className="eyebrow">YOUR FILES. YOUR RULES.</div>
              <h2>Meet your journal’s better half.</h2>
              <p>
                Drop your plain text journals here, or choose files to start
                exploring.
                <br />
                Your financial data never needs to leave this device.
              </p>
              <div className="welcome-actions">
                <Button
                  className="primary"
                  onClick={() => fileInput.current?.click()}
                >
                  Choose journal files
                </Button>
                <Button
                  className="secondary"
                  onClick={() => {
                    replaceSources([{ name: 'demo.journal', text: demo }]);
                  }}
                >
                  Explore sample journal
                </Button>
              </div>
              <small>
                Ledger-style journals · Multiple files · Read-only · 256 MiB
                total limit
              </small>
              <p className="compat-note">
                Early preview: a strict journal subset is supported. Unsupported
                syntax produces a diagnostic and disables reports.
              </p>
            </section>
          ) : (
            <>
              <div className="journal-strip">
                <span>
                  <span className="privacy-dot" /> {sources.length}{' '}
                  {sources.length === 1 ? 'journal' : 'journals'} open ·{' '}
                  {valid
                    ? `${summary.transactionCount} transactions`
                    : 'Import needs attention'}
                </span>
                <Button
                  className="text-button"
                  onClick={() => {
                    replaceSources([]);
                  }}
                >
                  Close journals
                </Button>
              </div>
              {!valid ? (
                <section className="panel diagnostics" role="alert">
                  <div className="eyebrow">LET’S CHECK A FEW THINGS</div>
                  <h2>Reports paused to keep your totals honest.</h2>
                  <p>
                    These files contain invalid or unsupported syntax. No
                    partial balances are shown. Your original files have not
                    been changed.
                  </p>
                  <ul>
                    {summary.diagnostics.map((d, i) => (
                      <li key={i}>
                        <code>
                          {d.file}:{d.line}
                        </code>
                        <strong>{d.code}</strong>
                        <span>{d.message}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : (
                <>
                  <section className="filters" aria-label="Report filters">
                    <label className="search">
                      <span>⌕</span>
                      <input
                        ref={searchInput}
                        aria-label="Search transactions"
                        placeholder="Search payees, notes, accounts…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </label>
                    <label>
                      <span className="sr-only">Month</span>
                      <select
                        ref={monthInput}
                        aria-label="Month"
                        value={month}
                        onChange={(e) => selectMonth(e.target.value)}
                      >
                        <option value="">All dates / custom range</option>
                        {month && !months.includes(month) && (
                          <option value={month}>
                            {month} (no journal postings)
                          </option>
                        )}
                        {months.map((m) => (
                          <option key={m}>{m}</option>
                        ))}
                      </select>
                    </label>
                    <fieldset className="date-range">
                      <legend className="sr-only">Posting date range</legend>
                      <label>
                        <span>From</span>
                        <input
                          type="date"
                          autoComplete="off"
                          ref={fromDateInput}
                          aria-label="From date"
                          value={dateFrom}
                          min="0001-01-01"
                          max="9999-12-31"
                          aria-invalid={Boolean(invalidDateRange)}
                          aria-describedby={
                            invalidDateRange
                              ? 'date-range-help date-range-error'
                              : 'date-range-help'
                          }
                          onChange={(e) => changeDate('from', e.target.value)}
                        />
                      </label>
                      <label>
                        <span>Through</span>
                        <input
                          type="date"
                          autoComplete="off"
                          aria-label="Through date"
                          value={dateTo}
                          min="0001-01-01"
                          max="9999-12-31"
                          aria-invalid={Boolean(invalidDateRange)}
                          aria-describedby={
                            invalidDateRange
                              ? 'date-range-help date-range-error'
                              : 'date-range-help'
                          }
                          onChange={(e) =>
                            changeDate('through', e.target.value)
                          }
                        />
                      </label>
                    </fieldset>
                    {(dateFrom || dateTo) && (
                      <Button
                        className="text-button"
                        onClick={() => selectMonth('')}
                      >
                        Clear dates
                      </Button>
                    )}
                    <label>
                      <span className="sr-only">Commodity</span>
                      <select
                        aria-label="Commodity"
                        value={currency}
                        onChange={(e) => setCommodity(e.target.value)}
                      >
                        {commodities.map((c) => (
                          <option key={c} value={c}>
                            {c || 'No commodity'}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span className="sr-only">Status</span>
                      <select
                        ref={statusInput}
                        aria-label="Status"
                        aria-describedby="date-range-help"
                        value={status}
                        onChange={(e) => setStatus(e.target.value)}
                      >
                        <option value="all">All statuses</option>
                        <option value="*">Cleared</option>
                        <option value="!">Pending</option>
                        <option value="">Unmarked</option>
                      </select>
                    </label>
                    {(query ||
                      month ||
                      dateFrom ||
                      dateTo ||
                      account ||
                      status !== 'all') && (
                      <Button className="text-button" onClick={resetFilters}>
                        Clear filters
                      </Button>
                    )}
                  </section>
                  <p id="date-range-help" className="date-range-help">
                    From and Through include both boundary dates. Filters use
                    posting dates. Choose a month shortcut to compare with the
                    previous calendar month. Status uses posting markers, then
                    transaction status. Register icons show transaction status.
                  </p>
                  <ActiveFilters
                    filters={{ ...filters, commodity: currency }}
                    onClear={clearFilter}
                  />
                  <div
                    className="filter-history"
                    role="group"
                    aria-label="Filter history"
                  >
                    <Button
                      variant="outline"
                      disabled={!history.canUndo}
                      focusableWhenDisabled
                      aria-label="Undo filter change"
                      onClick={() => {
                        history.undo();
                        setSelected(null);
                      }}
                    >
                      Undo
                    </Button>
                    <Button
                      variant="outline"
                      disabled={!history.canRedo}
                      focusableWhenDisabled
                      aria-label="Redo filter change"
                      onClick={() => {
                        history.redo();
                        setSelected(null);
                      }}
                    >
                      Redo
                    </Button>
                    <span className="muted">
                      Recent changes for this journal
                    </span>
                  </div>
                  <SavedFilters
                    key={journalRevision}
                    filters={{ ...filters, commodity: currency }}
                    busy={busy}
                    invalidRange={Boolean(invalidDateRange)}
                    onApply={applyFilters}
                  />
                  {invalidDateRange ? (
                    <section
                      className="panel date-range-error"
                      id="date-range-error"
                      role="alert"
                    >
                      {invalidDateRange}
                    </section>
                  ) : (
                    <>
                      {view === 'overview' ? (
                        <>
                          <section
                            className="metrics"
                            aria-label="Filtered totals"
                          >
                            <div className="metric panel">
                              <span>INCOME</span>
                              <strong>{metric(report.income, currency)}</strong>
                              <small>Credits shown as positive</small>
                            </div>
                            <div className="metric panel">
                              <span>SPENDING</span>
                              <strong>
                                {metric(report.spending, currency)}
                              </strong>
                              <small>Net expense postings</small>
                            </div>
                            <div className="metric panel">
                              <span>TRANSACTIONS</span>
                              <strong>{report.count.toLocaleString()}</strong>
                              <small>Matching your filters</small>
                            </div>
                          </section>
                          <IncomeAccounts
                            key={journalRevision}
                            rows={report.incomeAccounts}
                            commodity={report.commodity}
                            account={account}
                            busy={busy}
                            onSelect={(next) => {
                              setAccount(next);
                              setSelected(null);
                            }}
                          />
                          {comparison && (
                            <section
                              className="panel comparison-panel"
                              aria-label={
                                comparison.previousMonth
                                  ? 'Previous month comparison'
                                  : 'Previous period comparison'
                              }
                            >
                              <h2>Compared with {previousLabel}</h2>
                              <p className="muted">
                                {comparison.previousMonth
                                  ? 'Full calendar months'
                                  : 'Equal-length inclusive date ranges'}{' '}
                                with the same search, account, commodity and
                                status filters. Totals reflect the imported
                                journals.
                              </p>
                              <dl className="comparison-summary">
                                <div>
                                  <dt>Previous income</dt>
                                  <dd>
                                    {metric(comparison.income, currency)}
                                    <span>
                                      Change:{' '}
                                      {signedAmount(comparison.incomeChange)}
                                    </span>
                                  </dd>
                                </div>
                                <div>
                                  <dt>Previous spending</dt>
                                  <dd>
                                    {metric(comparison.spending, currency)}
                                    <span>
                                      Change:{' '}
                                      {signedAmount(comparison.spendingChange)}
                                    </span>
                                  </dd>
                                </div>
                                <div>
                                  <dt>Previous transactions</dt>
                                  <dd>
                                    {comparison.count.toLocaleString()}
                                    <span>
                                      Change:{' '}
                                      {comparison.countChange >= 0 ? '+' : ''}
                                      {comparison.countChange.toLocaleString()}
                                    </span>
                                  </dd>
                                </div>
                              </dl>
                              {comparison.count === 0 && (
                                <p className="muted">
                                  No transactions match in the previous{' '}
                                  {comparison.previousMonth
                                    ? 'month'
                                    : 'period'}
                                  . This does not establish whether the imported
                                  journals cover that period.
                                </p>
                              )}
                              <Button
                                variant="outline"
                                className="max-w-full whitespace-normal"
                                onClick={() => {
                                  if (comparison.previousMonth) {
                                    selectMonth(comparison.previousMonth);
                                    monthInput.current?.focus();
                                  } else {
                                    applyFilters({
                                      ...filters,
                                      month: '',
                                      dateFrom: comparison.previousDateFrom,
                                      dateTo: comparison.previousDateTo,
                                    });
                                    fromDateInput.current?.focus();
                                  }
                                }}
                              >
                                Explore {previousLabel}
                              </Button>
                            </section>
                          )}
                          <div
                            className="spending-display"
                            role="group"
                            aria-label="Spending display"
                          >
                            <Button
                              variant="outline"
                              aria-pressed={spendingDisplay === 'charts'}
                              aria-controls="spending-panels"
                              onClick={() => setSpendingDisplay('charts')}
                            >
                              Charts
                            </Button>
                            <Button
                              variant="outline"
                              aria-pressed={spendingDisplay === 'tables'}
                              aria-controls="spending-panels"
                              onClick={() => setSpendingDisplay('tables')}
                            >
                              Tables
                            </Button>
                          </div>
                          <section className="chart-grid" id="spending-panels">
                            <div className="panel chart-panel">
                              <div className="section-title">
                                <h2>Where it goes</h2>
                                <span>By expense account</span>
                              </div>
                              {spendingDisplay === 'tables' ? (
                                <ReportDataTable
                                  rows={report.categories}
                                  caption="Expense categories"
                                  column="Account"
                                  commodity={currency}
                                  label={(row) => row[0]}
                                  value={(row) => row[1]}
                                  selected={account}
                                  onSelect={setAccount}
                                  busy={busy}
                                />
                              ) : categories.length ? (
                                <div className="bars">
                                  {categories.map(([name, value], i) => (
                                    <Button
                                      className="bar-row"
                                      key={name}
                                      onClick={() => setAccount(name)}
                                      aria-label={`Filter ${name}`}
                                      aria-current={
                                        account === name ? 'true' : undefined
                                      }
                                    >
                                      <div className="bar-label">
                                        <span>
                                          <i
                                            style={{
                                              background:
                                                palette[i % palette.length],
                                            }}
                                          />
                                          {name
                                            .replace(/^expenses?:/i, '')
                                            .replaceAll(':', ' / ')}
                                        </span>
                                        <strong>
                                          {metric(value, currency)}
                                        </strong>
                                      </div>
                                      <div className="bar-track">
                                        <div
                                          style={{
                                            width: `${Math.max(1, (Math.abs(Number(value)) / biggest) * 100)}%`,
                                            background:
                                              palette[i % palette.length],
                                          }}
                                        />
                                      </div>
                                    </Button>
                                  ))}
                                </div>
                              ) : (
                                <p className="empty">
                                  No expense postings match these filters.
                                </p>
                              )}
                              <p className="chart-hint">
                                {spendingDisplay === 'tables'
                                  ? 'All matching expense accounts, 25 per page. Select an account to explore it and its descendants.'
                                  : 'Top 30 categories. Select one to explore its transactions. Bar lengths use absolute values.'}{' '}
                                Net values include refunds.
                              </p>
                            </div>
                            <div className="panel chart-panel">
                              <div className="section-title">
                                <h2>Spending over time</h2>
                                <span>Monthly</span>
                              </div>
                              {spendingDisplay === 'tables' ? (
                                <ReportDataTable
                                  rows={report.monthly}
                                  caption="Monthly spending"
                                  column="Month"
                                  commodity={currency}
                                  label={(row) => row.month}
                                  value={(row) => row.value}
                                  selected={month}
                                  toggleSelection
                                  onSelect={(next) =>
                                    selectMonth(month === next ? '' : next)
                                  }
                                  busy={busy}
                                />
                              ) : (
                                <div className="monthly-chart">
                                  {(() => {
                                    const data = report.monthly;
                                    const max = Math.max(
                                      1,
                                      ...data.map((d) =>
                                        Math.abs(Number(d.value)),
                                      ),
                                    );
                                    return data.map((d) => (
                                      <Button
                                        key={d.month}
                                        className={`month-column ${month === d.month ? 'chosen' : ''}`}
                                        onClick={() =>
                                          selectMonth(
                                            month === d.month ? '' : d.month,
                                          )
                                        }
                                        aria-label={`Filter month ${d.month}`}
                                        aria-pressed={month === d.month}
                                      >
                                        <span className="month-value">
                                          {metric(d.value, currency)}
                                        </span>
                                        <div className="column-track">
                                          <div
                                            style={{
                                              height: `${(Math.abs(Number(d.value)) / max) * 100}%`,
                                            }}
                                          />
                                        </div>
                                        <span>{d.month}</span>
                                      </Button>
                                    ));
                                  })()}
                                </div>
                              )}
                              <p className="chart-hint">
                                Select a month to focus the explorer. No
                                currency conversion is applied. Values follow
                                the current filters; boundary months may be
                                partial.
                              </p>
                            </div>
                          </section>
                        </>
                      ) : (
                        <section className="panel accounts-panel">
                          <div className="section-title">
                            <h2>Account balances</h2>
                            <span>
                              All dates ·{' '}
                              {includeSubaccounts
                                ? 'includes subaccounts'
                                : 'direct postings only'}{' '}
                              · click to filter the register
                            </span>
                          </div>
                          <p className="muted">
                            Balances use the entire journal, independent of
                            register filters. Account clicks filter the account
                            and all descendants in either view.
                            {includeSubaccounts &&
                              ' Parent totals include their descendants and overlap child rows; do not add the rows together.'}
                          </p>
                          <label className="account-rollup-toggle">
                            <input
                              type="checkbox"
                              checked={includeSubaccounts}
                              onChange={(e) =>
                                setIncludeSubaccounts(e.target.checked)
                              }
                            />{' '}
                            Include subaccounts
                          </label>
                          <div className="account-search-controls">
                            <label>
                              <span>Find an account</span>
                              <input
                                ref={accountSearchInput}
                                type="search"
                                autoComplete="off"
                                aria-label="Search accounts"
                                aria-describedby="account-search-help"
                                placeholder="Account name…"
                                value={engine.accountSearch}
                                onChange={(event) =>
                                  engine.setAccountSearch(event.target.value)
                                }
                              />
                            </label>
                            {engine.accountSearch && (
                              <Button
                                variant="ghost"
                                onClick={() => {
                                  engine.setAccountSearch('');
                                  accountSearchInput.current?.focus();
                                }}
                              >
                                Clear account search
                              </Button>
                            )}
                          </div>
                          <p id="account-search-help" className="muted">
                            Search account names without changing balances or
                            register filters.
                            {includeSubaccounts
                              ? ' Matches reveal their ancestors; clear search to restore and change folds.'
                              : ' Only directly posted accounts are searched in this mode.'}
                          </p>
                          {includeSubaccounts && (
                            <div className="account-tree-controls">
                              <Button
                                variant="outline"
                                disabled={
                                  busy ||
                                  engine.accountBusy ||
                                  !engine.accountView.canExpand
                                }
                                onClick={() =>
                                  engine.changeAccounts({ type: 'expand-all' })
                                }
                              >
                                Expand all accounts
                              </Button>
                              <Button
                                variant="outline"
                                disabled={
                                  busy ||
                                  engine.accountBusy ||
                                  !engine.accountView.canCollapse
                                }
                                onClick={() =>
                                  engine.changeAccounts({
                                    type: 'collapse-all',
                                  })
                                }
                              >
                                Collapse all accounts
                              </Button>
                            </div>
                          )}
                          <p
                            className="account-view-count"
                            role="status"
                            aria-label="Account search results"
                          >
                            {engine.accountBusy
                              ? 'Searching accounts…'
                              : engine.accountView.query
                                ? `${accountMatches} matching ${accountMatches === 1 ? 'account' : 'accounts'} · ${accountAncestors} ancestor ${accountAncestors === 1 ? 'row' : 'rows'}`
                                : `${engine.accountView.count} of ${accountCount} account rows shown`}
                          </p>
                          {!engine.accountBusy &&
                            engine.accountView.query &&
                            !engine.accountView.count && (
                              <p className="muted">
                                No accounts match this search.
                              </p>
                            )}
                          <VirtualAccounts
                            key={`${journalRevision}-${includeSubaccounts ? 'inclusive' : 'direct'}`}
                            view={
                              engine.accountView.mode ===
                              (includeSubaccounts ? 'inclusive' : 'direct')
                                ? engine.accountView
                                : { ...engine.accountView, count: 0 }
                            }
                            window={engine.accountWindow}
                            busy={engine.accountBusy}
                            onRangeChange={setAccountRange}
                            onToggle={(account) =>
                              engine.changeAccounts({ type: 'toggle', account })
                            }
                            onSelect={setAccount}
                          />
                        </section>
                      )}
                      <section className="panel register" aria-busy={busy}>
                        <div className="section-title">
                          <h2>
                            Transaction register{' '}
                            <span className="count">{report.count}</span>
                          </h2>
                          <span>Newest first · select to inspect</span>
                        </div>
                        <VirtualRegister
                          status={status}
                          count={report.count}
                          window={engine.window}
                          filterKey={JSON.stringify(filters)}
                          currency={currency}
                          month={month}
                          dateFrom={dateFrom}
                          dateTo={dateTo}
                          account={account}
                          onRange={setRange}
                          onAccount={setAccount}
                          onInspect={engine.inspect}
                        />
                        {!report.count && !busy && (
                          <p className="empty">
                            No transactions match your filters.
                          </p>
                        )}
                        <p className="chart-hint">
                          Grouped by transaction · date filters use posting
                          dates · all {report.count.toLocaleString()} matches
                          are browsable. Totals include every match. Income and
                          spending use journal account types or English-name
                          defaults.
                        </p>
                      </section>
                    </>
                  )}
                </>
              )}
            </>
          )}
          <footer>
            <span>Built around your journals, never around your data.</span>
            <span>jledger / early preview</span>
          </footer>
        </div>
      </main>
      {selected && !invalidDateRange && (
        <dialog
          className="detail panel"
          aria-label="Transaction details"
          ref={(node) => {
            if (node && !node.open) node.showModal();
          }}
          onCancel={() => setSelected(null)}
        >
          <Button
            className="close-dialog secondary"
            autoFocus
            onClick={() => setSelected(null)}
          >
            Close
          </Button>
          <div className="eyebrow">TRANSACTION DETAILS</div>
          <h2>{selected.description || '(no description)'}</h2>
          <p>
            Transaction date {selected.date} · {selected.source.file}:
            {selected.source.line}
          </p>
          {selected.inferredYear && (
            <p className="muted">
              Year {selected.inferredYear.year} supplied by{' '}
              {selected.inferredYear.source.file}:
              {selected.inferredYear.source.line}.
            </p>
          )}
          {selected.postings.some((p) => p.date) && (
            <p className="muted">
              Postings without their own date use the transaction date.
            </p>
          )}
          <dl>
            {selected.postings.map((p, i) => {
              const classification = selected.postingTypes[i]!;
              const postingStatus = effectivePostingStatus(p, selected.status);
              return (
                <div key={i}>
                  <dt>{p.account}</dt>
                  <dd>
                    {formatAmount(p.amount)}
                    {p.inferred && <small> inferred</small>}
                    <small>
                      {' '}
                      ·{' '}
                      {postingStatus === '*'
                        ? 'Cleared'
                        : postingStatus === '!'
                          ? 'Pending'
                          : 'Unmarked'}
                      {p.status ? ' (posting status)' : ' (transaction status)'}
                    </small>
                    {p.accountAlias && (
                      <small>
                        {' '}
                        · original account {p.accountAlias.originalAccount};
                        aliases from{' '}
                        {p.accountAlias.sources
                          .map((source) => `${source.file}:${source.line}`)
                          .join(', ')}
                      </small>
                    )}
                    <small>
                      {' '}
                      ·{' '}
                      {classification.type
                        ? ACCOUNT_TYPE_LABELS[classification.type]
                        : 'Unclassified'}
                      {classification.origin === 'declared'
                        ? ` · declared on ${classification.account} at ${classification.source!.file}:${classification.source!.line}`
                        : classification.origin === 'inferred'
                          ? ' · English-name default'
                          : ''}
                    </small>
                    {p.amount.commoditySource && (
                      <small>
                        {' '}
                        · commodity from D at {p.amount.commoditySource.file}:
                        {p.amount.commoditySource.line}
                      </small>
                    )}
                    {p.date && <small> · posted {p.date}</small>}
                    {p.dateSource && (
                      <small>
                        {' '}
                        · date from continuation at {p.dateSource.file}:
                        {p.dateSource.line}
                      </small>
                    )}
                    {p.balanceAssertion?.commoditySource && (
                      <small>
                        {' '}
                        · assertion commodity from D at{' '}
                        {p.balanceAssertion.commoditySource.file}:
                        {p.balanceAssertion.commoditySource.line}
                      </small>
                    )}
                    {p.balanceAssertion && (
                      <small>
                        {' '}
                        · balance checked
                        {p.balanceAssertionInclusive
                          ? p.balanceAssertionTotal
                            ? ' (including subaccounts, all commodities)'
                            : ' (including subaccounts, one commodity)'
                          : p.balanceAssertionTotal
                            ? ' (direct account, all commodities)'
                            : ''}
                        : {formatAmount(p.balanceAssertion)}
                      </small>
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
          <h3>Original source</h3>
          <pre>{selected.excerpt}</pre>
        </dialog>
      )}
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { formatAmount, type Source } from '@jledger/core';
import demo from '@jledger/examples/demo.journal?raw';
import { useJournal } from './use-journal';
import { dateRangeError, monthBounds } from './report-filters';
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
  const [query, setQuery] = useState(''),
    [account, setAccount] = useState(''),
    [month, setMonth] = useState(''),
    [dateFrom, setDateFrom] = useState(''),
    [dateTo, setDateTo] = useState(''),
    [commodity, setCommodity] = useState(''),
    [status, setStatus] = useState('all');
  const [view, setView] = useState<'overview' | 'accounts'>('overview');
  const [offline, setOffline] = useState(false),
    [local, setLocal] = useState(false);
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
  const filters = {
    query,
    account,
    month,
    dateFrom,
    dateTo,
    commodity,
    status,
  };
  const invalidDateRange = dateRangeError(dateFrom, dateTo);
  const engine = useJournal(filters, range);
  const {
    summary,
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
  const allBalances = summary.accounts,
    commodities = summary.commodities,
    months = summary.months;
  const currency = commodities.includes(commodity)
    ? commodity
    : (commodities[0] ?? '');
  const categories = report.categories.slice(0, 30);
  const biggest = Math.max(
    1,
    ...categories.map(([, value]) => Math.abs(Number(value))),
  );
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  function resetFilters() {
    setQuery('');
    setAccount('');
    setMonth('');
    setDateFrom('');
    setDateTo('');
    setStatus('all');
    setSelected(null);
  }
  function selectMonth(next: string) {
    setMonth(next);
    const bounds = next ? monthBounds(next) : { dateFrom: '', dateTo: '' };
    setDateFrom(bounds.dateFrom);
    setDateTo(bounds.dateTo);
    setSelected(null);
  }
  function changeDate(which: 'from' | 'through', value: string) {
    setMonth('');
    if (which === 'from') setDateFrom(value);
    else setDateTo(value);
    setSelected(null);
  }
  function replaceSources(next: Source[]) {
    resetFilters();
    load({ sources: next });
  }
  function importFiles(files: File[]) {
    if (!files.length) return;
    if (files.reduce((sum, file) => sum + file.size, 0) > LIMIT) {
      setMessage('Choose files totaling 256 MiB or less.');
      return;
    }
    resetFilters();
    setLocal(false);
    load({ files });
  }
  function loadLocal() {
    resetFilters();
    setLocal(true);
    load({ localUrl: `${BASE}api/journals` });
  }
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
          <span>≡</span> Accounts <small>{allBalances.length}</small>
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
          {busy && (
            <div className="work-status" role="status">
              Processing journals in the background… You can keep using the
              explorer.
            </div>
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
                    setLocal(false);
                  }}
                >
                  Explore sample journal
                </Button>
              </div>
              <small>
                Ledger-style journals · Multiple files · Read-only · 10 MiB
                limit
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
                    setLocal(false);
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
                        aria-label="Search transactions"
                        placeholder="Search payees, notes, accounts…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </label>
                    <label>
                      <span className="sr-only">Month</span>
                      <select
                        aria-label="Month"
                        value={month}
                        onChange={(e) => selectMonth(e.target.value)}
                      >
                        <option value="">All dates / custom range</option>
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
                        aria-label="Status"
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
                    posting dates.
                  </p>
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
                      {account && (
                        <div className="account-filter">
                          Filtering account: <strong>{account}</strong>{' '}
                          <Button
                            className="text-button"
                            aria-label="Clear account filter"
                            onClick={() => setAccount('')}
                          >
                            ×
                          </Button>
                        </div>
                      )}
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
                          <section className="chart-grid">
                            <div className="panel chart-panel">
                              <div className="section-title">
                                <h2>Where it goes</h2>
                                <span>By expense account</span>
                              </div>
                              {categories.length ? (
                                <div className="bars">
                                  {categories.map(([name, value], i) => (
                                    <Button
                                      className="bar-row"
                                      key={name}
                                      onClick={() => setAccount(name)}
                                      aria-label={`Filter ${name}`}
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
                                            .replace(/^expenses:/i, '')
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
                                Top 30 categories. Select one to explore its
                                transactions. Bar lengths use absolute values.
                              </p>
                            </div>
                            <div className="panel chart-panel">
                              <div className="section-title">
                                <h2>Spending over time</h2>
                                <span>Monthly</span>
                              </div>
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
                              <p className="chart-hint">
                                Select a month to focus the explorer. No
                                currency conversion is applied.
                              </p>
                            </div>
                          </section>
                        </>
                      ) : (
                        <section className="panel accounts-panel">
                          <div className="section-title">
                            <h2>Account balances</h2>
                            <span>
                              All dates · direct balances · click to filter the
                              register
                            </span>
                          </div>
                          <p className="muted">
                            Balances here use the entire journal, independent of
                            register filters. Parent accounts do not include
                            subaccounts yet.
                          </p>
                          <VirtualAccounts
                            accounts={allBalances}
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
                          are browsable. Totals include every match.
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
          {selected.postings.some((p) => p.date) && (
            <p className="muted">
              Postings without their own date use the transaction date.
            </p>
          )}
          <dl>
            {selected.postings.map((p, i) => (
              <div key={i}>
                <dt>{p.account}</dt>
                <dd>
                  {formatAmount(p.amount)}
                  {p.inferred && <small> inferred</small>}
                  {p.date && <small> · posted {p.date}</small>}
                  {p.balanceAssertion && (
                    <small>
                      {' '}
                      · balance checked: {formatAmount(p.balanceAssertion)}
                    </small>
                  )}
                </dd>
              </div>
            ))}
          </dl>
          <h3>Original source</h3>
          <pre>{selected.excerpt}</pre>
        </dialog>
      )}
    </div>
  );
}

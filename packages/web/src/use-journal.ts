import type { AccountAction, AccountView, AccountWindow } from './account-view';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Detail, Filters, Report, Row, Summary } from './journal-engine';
import type { ImportProgress, Request } from './journal.worker';
import { JournalWorkers } from './journal-workers';

const emptySummary: Summary = {
  names: [],
  diagnostics: [],
  diagnosticCount: 0,
  transactionCount: 0,
  accountCount: 0,
  accountRollupCount: 0,
  commodities: [],
  months: [],
};
const emptyReport: Report = {
  commodity: '',
  count: 0,
  income: '0',
  spending: '0',
  categories: [],
  incomeAccounts: [],
  monthly: [],
};
const emptyAccountView: AccountView & { id: number } = {
  id: 0,
  mode: 'inclusive',
  count: 0,
  total: 0,
  query: '',
  matchCount: 0,
  canExpand: false,
  canCollapse: false,
  resetScroll: false,
};
export function useJournal(
  filters: Filters,
  range: { start: number; end: number },
  accountRange: { start: number; end: number },
  includeSubaccounts: boolean,
) {
  const worker = useRef<JournalWorkers | null>(null),
    sequence = useRef(0),
    latestLoad = useRef(0),
    latestQuery = useRef(0),
    committedLoad = useRef(0),
    latestAccountView = useRef(0),
    latestAccountRows = useRef(0);
  const [accountSearch, setAccountSearch] = useState('');
  const [accountView, setAccountView] = useState(emptyAccountView);
  const [accountWindow, setAccountWindow] = useState<AccountWindow>({
    start: 0,
    rows: [],
  });
  const [accountBusy, setAccountBusy] = useState(false);
  const [summary, setSummary] = useState(emptySummary),
    [report, setReport] = useState(emptyReport);
  const [window, setWindow] = useState<{ start: number; rows: Row[] }>({
    start: 0,
    rows: [],
  });
  const [detail, setDetail] = useState<Detail | null>(null),
    [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(
    null,
  );
  const [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0),
    [reportId, setReportId] = useState(0);
  const post = useCallback(
    (request: Request) => worker.current?.postMessage(request),
    [],
  );
  useEffect(() => {
    const instance = new JournalWorkers(
      () =>
        new Worker(new URL('./journal.worker.ts', import.meta.url), {
          type: 'module',
        }),
      ({ data }) => {
        if (data.type === 'progress' && data.id === latestLoad.current) {
          setImportProgress(data.progress);
        } else if (data.type === 'loaded' && data.id === latestLoad.current) {
          committedLoad.current = data.id;
          setAccountSearch('');
          setAccountView(emptyAccountView);
          setAccountWindow({ start: 0, rows: [] });
          setLoading(false);
          setImportProgress(null);
          setSummary(data.summary);
          setReport(emptyReport);
          setWindow({ start: 0, rows: [] });
          setDetail(null);
          setMessage('');
          setRevision((r) => r + 1);
        } else if (data.type === 'report' && data.id === latestQuery.current) {
          setReport(data.report);
          setReportId(data.id);
          setWindow({ start: 0, rows: [] });
          setBusy(false);
        } else if (data.type === 'rows' && data.id === latestQuery.current)
          setWindow({ start: data.start, rows: data.rows });
        else if (
          data.type === 'account-view' &&
          data.id === latestAccountView.current &&
          data.loadId === committedLoad.current
        ) {
          setAccountView({ ...data.view, id: data.id });
          setAccountBusy(false);
        } else if (
          data.type === 'account-rows' &&
          data.id === latestAccountRows.current &&
          data.viewId === latestAccountView.current &&
          data.loadId === committedLoad.current
        )
          setAccountWindow(data.window);
        else if (
          data.type === 'error' &&
          (data.id === latestAccountView.current ||
            data.id === latestAccountRows.current)
        ) {
          setAccountBusy(false);
          setAccountWindow({ start: 0, rows: [] });
          setMessage(data.message);
        } else if (data.type === 'detail') setDetail(data.detail);
        else if (
          data.type === 'error' &&
          (data.id === latestLoad.current || data.id === latestQuery.current)
        ) {
          setLoading(false);
          setImportProgress(null);
          if (data.id === latestLoad.current) setAccountBusy(false);
          if (data.code !== 'date-range') setMessage(data.message);
          setReport(emptyReport);
          setWindow({ start: 0, rows: [] });
          setDetail(null);
          setBusy(false);
        }
      },
      () => {
        setMessage(
          'The journal worker failed. Reload the application and try again.',
        );
        setBusy(false);
        setAccountBusy(false);
        setLoading(false);
        setImportProgress(null);
      },
    );
    worker.current = instance;
    return () => {
      instance.dispose();
      worker.current = null;
    };
  }, []);
  const requestAccounts = useCallback(
    (action?: AccountAction, delay = 0) => {
      if (!committedLoad.current || loading) return;
      const id = ++sequence.current;
      latestAccountView.current = id;
      latestAccountRows.current = 0;
      setAccountBusy(true);
      setAccountWindow({ start: 0, rows: [] });
      const request: Request = {
        type: 'account-view',
        id,
        loadId: committedLoad.current,
        mode: includeSubaccounts ? 'inclusive' : 'direct',
        ...(action ? { action } : {}),
      };
      const send = () => {
        if (latestAccountView.current === id) post(request);
      };
      if (delay) {
        const timer = setTimeout(send, delay);
        return () => clearTimeout(timer);
      }
      send();
    },
    [post, loading, includeSubaccounts],
  );
  const changeAccounts = useCallback(
    (action?: AccountAction) => {
      requestAccounts(action);
    },
    [requestAccounts],
  );
  useEffect(() => {
    if (revision && !loading)
      return requestAccounts({ type: 'search', query: accountSearch }, 100);
  }, [revision, loading, accountSearch, requestAccounts]);
  useEffect(() => {
    if (
      loading ||
      !accountView.id ||
      accountView.id !== latestAccountView.current
    )
      return;
    const id = ++sequence.current;
    latestAccountRows.current = id;
    post({
      type: 'account-rows',
      id,
      loadId: committedLoad.current,
      viewId: accountView.id,
      start: accountRange.start,
      end: accountRange.end,
    });
  }, [accountView.id, accountRange.start, accountRange.end, loading, post]);
  const { query, month, dateFrom, dateTo, account, commodity, status } =
    filters;
  useEffect(() => {
    if (!revision || loading) return;
    const id = ++sequence.current;
    latestQuery.current = id;
    setBusy(true);
    const timer = setTimeout(
      () =>
        post({
          type: 'query',
          id,
          filters: {
            query,
            month,
            dateFrom,
            dateTo,
            account,
            commodity: summary.commodities.includes(commodity)
              ? commodity
              : (summary.commodities[0] ?? ''),
            status,
          },
        }),
      100,
    );
    return () => clearTimeout(timer);
  }, [
    revision,
    loading,
    query,
    month,
    dateFrom,
    dateTo,
    account,
    commodity,
    status,
    post,
    summary.commodities,
  ]);
  useEffect(() => {
    if (reportId && reportId === latestQuery.current)
      post({ type: 'rows', id: reportId, start: range.start, end: range.end });
  }, [reportId, range.start, range.end, post]);
  const load = useCallback(
    (input: Omit<Extract<Request, { type: 'load' }>, 'type' | 'id'>) => {
      const id = ++sequence.current;
      latestLoad.current = id;
      latestQuery.current = id;
      latestAccountView.current = 0;
      latestAccountRows.current = 0;
      setAccountBusy(true);
      setLoading(true);
      setBusy(true);
      setMessage('');
      setDetail(null);
      setImportProgress(
        input.files
          ? { phase: 'reading', completed: 0, total: input.files.length }
          : { phase: input.localUrl ? 'fetching' : 'processing' },
      );
      worker.current?.load({ type: 'load', id, ...input });
    },
    [post],
  );
  const cancelImport = useCallback(() => {
    if (!worker.current?.cancel()) return;
    const id = ++sequence.current;
    latestLoad.current = id;
    latestQuery.current = id;
    latestAccountView.current = 0;
    latestAccountRows.current = 0;
    setLoading(false);
    setImportProgress(null);
    setBusy(false);
    setAccountBusy(false);
    setMessage('Import cancelled. The previous journal, if any, remains open.');
  }, []);
  return {
    summary,
    journalRevision: revision,
    accountSearch,
    setAccountSearch,
    accountView,
    accountWindow,
    accountBusy,
    changeAccounts,
    report,
    window,
    detail,
    busy,
    importing: loading,
    importProgress,
    cancelImport,
    message,
    load,
    setDetail,
    setMessage,
    inspect: (id: number) => post({ type: 'detail', id }),
  };
}

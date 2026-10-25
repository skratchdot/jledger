import { useCallback, useEffect, useRef, useState } from 'react';
import type { Detail, Filters, Report, Row, Summary } from './journal-engine';
import type { Request } from './journal.worker';

const emptySummary: Summary = {
  names: [],
  diagnostics: [],
  diagnosticCount: 0,
  transactionCount: 0,
  accounts: [],
  accountRollups: [],
  commodities: [],
  months: [],
};
const emptyReport: Report = {
  count: 0,
  income: '0',
  spending: '0',
  categories: [],
  monthly: [],
};
export function useJournal(
  filters: Filters,
  range: { start: number; end: number },
) {
  const worker = useRef<Worker | null>(null),
    sequence = useRef(0),
    latestLoad = useRef(0),
    latestQuery = useRef(0);
  const [summary, setSummary] = useState(emptySummary),
    [report, setReport] = useState(emptyReport);
  const [window, setWindow] = useState<{ start: number; rows: Row[] }>({
    start: 0,
    rows: [],
  });
  const [detail, setDetail] = useState<Detail | null>(null),
    [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0),
    [reportId, setReportId] = useState(0);
  const post = useCallback(
    (request: Request) => worker.current?.postMessage(request),
    [],
  );
  useEffect(() => {
    const instance = new Worker(
      new URL('./journal.worker.ts', import.meta.url),
      { type: 'module' },
    );
    worker.current = instance;
    instance.onmessage = ({ data }) => {
      if (data.type === 'loaded' && data.id === latestLoad.current) {
        setLoading(false);
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
      else if (data.type === 'detail') setDetail(data.detail);
      else if (
        data.type === 'error' &&
        (data.id === latestLoad.current || data.id === latestQuery.current)
      ) {
        setLoading(false);
        if (data.code !== 'date-range') setMessage(data.message);
        setReport(emptyReport);
        setWindow({ start: 0, rows: [] });
        setDetail(null);
        setBusy(false);
      }
    };
    instance.onerror = () => {
      setMessage(
        'The journal worker failed. Reload the application and try again.',
      );
      setBusy(false);
    };
    return () => {
      instance.terminate();
      worker.current = null;
    };
  }, []);
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
      setLoading(true);
      setBusy(true);
      setMessage('');
      setDetail(null);
      post({ type: 'load', id, ...input });
    },
    [post],
  );
  return {
    summary,
    report,
    window,
    detail,
    busy,
    message,
    load,
    setDetail,
    setMessage,
    inspect: (id: number) => post({ type: 'detail', id }),
  };
}

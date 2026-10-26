import type { AccountAction, AccountMode } from './account-view';
import { JournalEngine, type Filters } from './journal-engine';
import { InvalidDateRangeError } from './report-filters';
import { MAX_JOURNAL_SOURCES, type Source } from '@jledger/core';

export type ImportProgress =
  | { phase: 'reading'; completed: number; total: number }
  | { phase: 'fetching' | 'processing' };

export type Request =
  | {
      type: 'load';
      id: number;
      sources?: Source[];
      files?: File[];
      localUrl?: string;
    }
  | { type: 'query'; id: number; filters: Filters }
  | { type: 'rows'; id: number; start: number; end: number }
  | { type: 'detail'; id: number }
  | {
      type: 'account-view';
      id: number;
      loadId: number;
      mode: AccountMode;
      action?: AccountAction;
    }
  | {
      type: 'account-rows';
      id: number;
      loadId: number;
      viewId: number;
      start: number;
      end: number;
    };
const engine = new JournalEngine();
let generation = 0,
  activeQuery = 0,
  activeLoad = 0,
  activeAccountView = 0;
const MAX_BYTES = 256 * 1024 * 1024;
self.onmessage = async (event: MessageEvent<Request>) => {
  const request = event.data;
  try {
    if (request.type === 'load') {
      const current = ++generation;
      const progress = (value: ImportProgress) =>
        self.postMessage({ type: 'progress', id: request.id, progress: value });
      let sources = request.sources ?? [];
      if (request.files) {
        if (request.files.length > MAX_JOURNAL_SOURCES)
          throw new Error(
            `Select at most ${MAX_JOURNAL_SOURCES} journal files.`,
          );
        if (request.files.reduce((sum, file) => sum + file.size, 0) > MAX_BYTES)
          throw new Error('Choose files totaling 256 MiB or less.');
        const decoder = new TextDecoder('utf-8', { fatal: true });
        sources = [];
        progress({
          phase: 'reading',
          completed: 0,
          total: request.files.length,
        });
        for (const file of request.files) {
          const text = decoder.decode(await file.arrayBuffer());
          if (current !== generation) return;
          sources.push({ name: file.webkitRelativePath || file.name, text });
          // Bound progress traffic for large selected folders.
          if (
            sources.length % 32 === 0 ||
            sources.length === request.files.length
          )
            progress({
              phase: 'reading',
              completed: sources.length,
              total: request.files.length,
            });
        }
      }
      if (request.localUrl) {
        progress({ phase: 'fetching' });
        const response = await fetch(request.localUrl, {
          cache: 'no-store',
          credentials: 'same-origin',
        });
        if (!response.ok)
          throw new Error(
            'Could not read the selected local journals. Check the server, then Reload files.',
          );
        const data: unknown = await response.json();
        if (
          !Array.isArray(data) ||
          !data.every(
            (s) =>
              s && typeof s.name === 'string' && typeof s.text === 'string',
          )
        )
          throw new Error('Invalid journal response.');
        sources = data as Source[];
      }
      if (current !== generation) return;
      progress({ phase: 'processing' });
      const summary = engine.load(sources);
      activeLoad = request.id;
      activeAccountView = 0;
      self.postMessage({ type: 'loaded', id: request.id, summary });
    } else if (request.type === 'account-view') {
      if (request.loadId !== activeLoad) return;
      const view = engine.configureAccounts(request.mode, request.action);
      activeAccountView = request.id;
      self.postMessage({
        type: 'account-view',
        id: request.id,
        loadId: activeLoad,
        view,
      });
    } else if (request.type === 'account-rows') {
      if (request.loadId !== activeLoad || request.viewId !== activeAccountView)
        return;
      self.postMessage({
        type: 'account-rows',
        id: request.id,
        loadId: activeLoad,
        viewId: activeAccountView,
        window: engine.accountRows(request.start, request.end),
      });
    } else if (request.type === 'query') {
      const current = ++generation;
      const report = await engine.query(
        request.filters,
        () => current !== generation,
      );
      if (report) {
        activeQuery = request.id;
        self.postMessage({ type: 'report', id: request.id, report });
      }
    } else if (request.type === 'rows') {
      if (request.id === activeQuery)
        self.postMessage({
          type: 'rows',
          id: request.id,
          start: request.start,
          rows: engine.rows(request.start, request.end),
        });
    } else if (request.type === 'detail')
      self.postMessage({ type: 'detail', detail: engine.detail(request.id) });
  } catch (error) {
    self.postMessage({
      type: 'error',
      code:
        error instanceof InvalidDateRangeError ? 'date-range' : 'processing',
      id: 'id' in request ? request.id : 0,
      message:
        error instanceof Error
          ? error.message
          : 'Could not process this journal.',
    });
  }
};

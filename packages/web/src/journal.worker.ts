import { JournalEngine, type Filters } from './journal-engine';
import type { Source } from '@jledger/core';

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
  | { type: 'detail'; id: number };
const engine = new JournalEngine();
let generation = 0,
  activeQuery = 0;
const MAX_BYTES = 256 * 1024 * 1024;
self.onmessage = async (event: MessageEvent<Request>) => {
  const request = event.data;
  try {
    if (request.type === 'load') {
      const current = ++generation;
      let sources = request.sources ?? [];
      if (request.files) {
        if (request.files.reduce((sum, file) => sum + file.size, 0) > MAX_BYTES)
          throw new Error('Choose files totaling 256 MiB or less.');
        const decoder = new TextDecoder('utf-8', { fatal: true });
        sources = await Promise.all(
          request.files.map(async (file) => ({
            name: file.name,
            text: decoder.decode(await file.arrayBuffer()),
          })),
        );
      }
      if (request.localUrl) {
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
      self.postMessage({
        type: 'loaded',
        id: request.id,
        summary: engine.load(sources),
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
      id: 'id' in request ? request.id : 0,
      message:
        error instanceof Error
          ? error.message
          : 'Could not process this journal.',
    });
  }
};

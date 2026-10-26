import { describe, expect, it } from 'vitest';
import {
  createFilterHistory,
  filterHistoryReducer as reduce,
  FILTER_EDIT_GROUP_MS,
  FILTER_HISTORY_LIMIT,
  type FilterHistory,
} from './filter-history';
import type { Filters } from './report-filters';
const initial: Filters = {
  query: '',
  account: '',
  month: '',
  dateFrom: '',
  dateTo: '',
  commodity: 'USD',
  status: 'all',
};
const edit = (
  state: FilterHistory,
  patch: Partial<Filters>,
  at = 0,
  group?: string,
) => reduce(state, { type: 'edit', patch, at, ...(group ? { group } : {}) });

describe('bounded report filter history', () => {
  it('restores all seven fields atomically through undo and redo', () => {
    const start = createFilterHistory(initial);
    const scope = {
      query: 'Coffee',
      account: 'expenses:food',
      month: '2024-03',
      dateFrom: '2024-03-01',
      dateTo: '2024-03-31',
      commodity: 'EUR',
      status: '!',
    };
    const applied = edit(start, scope);
    const undone = reduce(applied, { type: 'undo' });
    expect(undone.present).toEqual(initial);
    expect(reduce(undone, { type: 'redo' }).present).toEqual(scope);
    expect(start.present).toEqual(initial);
    expect(start.past).toEqual([]);
  });
  it('groups consecutive typing without losing the starting scope', () => {
    let state = createFilterHistory(initial);
    state = edit(state, { query: 'c' }, 0, 'query');
    state = edit(state, { query: 'co' }, 100, 'query');
    state = edit(state, { query: 'coffee' }, 200, 'query');
    expect(state.past).toHaveLength(1);
    expect(reduce(state, { type: 'undo' }).present.query).toBe('');
    expect(
      reduce(reduce(state, { type: 'undo' }), { type: 'redo' }).present.query,
    ).toBe('coffee');
  });
  it.each([FILTER_EDIT_GROUP_MS + 1, -1])(
    'starts a new group after an elapsed or invalid interval: %s',
    (at) => {
      let state = edit(
        createFilterHistory(initial),
        { query: 'a' },
        0,
        'query',
      );
      state = edit(state, { query: 'ab' }, at, 'query');
      expect(state.past).toHaveLength(2);
      expect(reduce(state, { type: 'undo' }).present.query).toBe('a');
    },
  );
  it('separates other controls and explicit clear actions from typing', () => {
    let state = edit(createFilterHistory(initial), { query: 'a' }, 0, 'query');
    state = edit(state, { account: 'expenses' }, 10);
    state = edit(state, { query: 'ab' }, 20, 'query');
    state = edit(state, { query: '' }, 30);
    expect(state.past).toHaveLength(4);
    state = reduce(state, { type: 'undo' });
    expect(state.present).toMatchObject({ query: 'ab', account: 'expenses' });
    state = reduce(state, { type: 'undo' });
    expect(state.present).toMatchObject({ query: 'a', account: 'expenses' });
  });
  it('discards redo after a new edit and never merges across navigation', () => {
    let state = edit(createFilterHistory(initial), { query: 'a' }, 0, 'query');
    state = edit(state, { status: '!' }, 10);
    state = reduce(state, { type: 'undo' });
    state = edit(state, { query: 'ab' }, 20, 'query');
    expect(state.future).toEqual([]);
    expect(state.past).toHaveLength(2);
    expect(reduce(state, { type: 'undo' }).present.query).toBe('a');
    state = reduce(reduce(state, { type: 'undo' }), { type: 'redo' });
    state = edit(state, { query: 'abc' }, 30, 'query');
    expect(state.past).toHaveLength(3);
  });
  it('removes a typing group that returns to its starting scope', () => {
    let state = edit(createFilterHistory(initial), { account: 'expenses' });
    state = edit(state, { query: 'typed' }, 10, 'query');
    state = edit(state, { query: '' }, 20, 'query');
    expect(state.past).toHaveLength(1);
    expect(reduce(state, { type: 'undo' }).present).toEqual(initial);
  });
  it('ignores no-op changes without losing redo or adding snapshots', () => {
    const state = reduce(edit(createFilterHistory(initial), { query: 'x' }), {
      type: 'undo',
    });
    expect(edit(state, { query: '' })).toBe(state);
    expect(reduce(state, { type: 'undo' })).toBe(state);
    const redone = reduce(state, { type: 'redo' });
    expect(reduce(redone, { type: 'redo' })).toBe(redone);
  });
  it('keeps invalid date edits reversible without silently changing the scope', () => {
    const full = {
      ...initial,
      month: '2024-03',
      dateFrom: '2024-03-01',
      dateTo: '2024-03-31',
    };
    const invalid = edit(
      createFilterHistory(full),
      { month: '', dateFrom: '2024-04-01' },
      0,
      'from',
    );
    expect(invalid.present).toMatchObject({
      month: '',
      dateFrom: '2024-04-01',
      dateTo: '2024-03-31',
    });
    expect(reduce(invalid, { type: 'undo' }).present).toEqual(full);
    expect(
      reduce(reduce(invalid, { type: 'undo' }), { type: 'redo' }).present,
    ).toEqual(invalid.present);
  });
  it('bounds history across long edit, undo and redo sequences', () => {
    let state = createFilterHistory(initial);
    for (let i = 1; i <= FILTER_HISTORY_LIMIT + 10; i++)
      state = edit(state, { query: String(i) });
    expect(state.past).toHaveLength(FILTER_HISTORY_LIMIT);
    for (let i = 0; i < FILTER_HISTORY_LIMIT; i++)
      state = reduce(state, { type: 'undo' });
    expect(state.present.query).toBe('10');
    expect(state.past).toEqual([]);
    expect(state.future).toHaveLength(FILTER_HISTORY_LIMIT);
    for (let i = 0; i < FILTER_HISTORY_LIMIT; i++)
      state = reduce(state, { type: 'redo' });
    expect(state.present.query).toBe(String(FILTER_HISTORY_LIMIT + 10));
    expect(state.future).toEqual([]);
    expect(state.past).toHaveLength(FILTER_HISTORY_LIMIT);
  });
  it('resets both directions and the typing group even for a same-name session replacement', () => {
    let state = edit(
      createFilterHistory(initial),
      { query: 'private' },
      0,
      'query',
    );
    state = reduce(state, { type: 'undo' });
    state = reduce(state, {
      type: 'reset',
      filters: { ...initial, query: 'typed during import' },
    });
    expect(state).toEqual(
      createFilterHistory({ ...initial, query: 'typed during import' }),
    );
    expect(reduce(state, { type: 'undo' })).toBe(state);
    expect(reduce(state, { type: 'redo' })).toBe(state);
  });
});

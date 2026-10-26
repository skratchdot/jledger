import { useCallback, useReducer } from 'react';
import type { Filters } from './report-filters';

export const FILTER_HISTORY_LIMIT = 50;
export const FILTER_EDIT_GROUP_MS = 750;
const keys: (keyof Filters)[] = [
  'query',
  'account',
  'month',
  'dateFrom',
  'dateTo',
  'commodity',
  'status',
];
export interface FilterHistory {
  present: Filters;
  past: Filters[];
  future: Filters[];
  last: { group: string; at: number } | null;
}
type Action =
  | { type: 'edit'; patch: Partial<Filters>; at: number; group?: string }
  | { type: 'undo' | 'redo' }
  | { type: 'reset'; filters: Filters };
export function createFilterHistory(filters: Filters): FilterHistory {
  return { present: { ...filters }, past: [], future: [], last: null };
}
export function filterHistoryReducer(
  state: FilterHistory,
  action: Action,
): FilterHistory {
  if (action.type === 'reset') return createFilterHistory(action.filters);
  if (action.type === 'undo') {
    const previous = state.past.at(-1);
    return previous
      ? {
          present: previous,
          past: state.past.slice(0, -1),
          future: [state.present, ...state.future],
          last: null,
        }
      : state;
  }
  if (action.type === 'redo') {
    const next = state.future[0];
    return next
      ? {
          present: next,
          past: [...state.past, state.present].slice(-FILTER_HISTORY_LIMIT),
          future: state.future.slice(1),
          last: null,
        }
      : state;
  }
  if (action.type !== 'edit') return state;
  const next = { ...state.present, ...action.patch };
  if (keys.every((key) => next[key] === state.present[key])) return state;
  const grouped = Boolean(
    action.group &&
    state.last?.group === action.group &&
    action.at >= state.last.at &&
    action.at - state.last.at <= FILTER_EDIT_GROUP_MS &&
    state.past.length &&
    !state.future.length,
  );
  if (grouped && keys.every((key) => next[key] === state.past.at(-1)![key])) {
    return {
      present: next,
      past: state.past.slice(0, -1),
      future: [],
      last: null,
    };
  }
  return {
    present: next,
    past: grouped
      ? state.past
      : [...state.past, state.present].slice(-FILTER_HISTORY_LIMIT),
    future: [],
    last: action.group ? { group: action.group, at: action.at } : null,
  };
}

/** History contains seven-field configurations only; reports still run in the worker. */
export function useFilterHistory() {
  const [state, dispatch] = useReducer(
    filterHistoryReducer,
    {
      query: '',
      account: '',
      month: '',
      dateFrom: '',
      dateTo: '',
      commodity: '',
      status: 'all',
    },
    createFilterHistory,
  );
  const change = useCallback((patch: Partial<Filters>, group?: string) => {
    dispatch({
      type: 'edit',
      patch,
      at: performance.now(),
      ...(group ? { group } : {}),
    });
  }, []);
  const undo = useCallback(() => dispatch({ type: 'undo' }), []);
  const redo = useCallback(() => dispatch({ type: 'redo' }), []);
  const reset = useCallback(
    (filters: Filters) => dispatch({ type: 'reset', filters }),
    [],
  );
  return {
    filters: state.present,
    canUndo: Boolean(state.past.length),
    canRedo: Boolean(state.future.length),
    change,
    undo,
    redo,
    reset,
  };
}

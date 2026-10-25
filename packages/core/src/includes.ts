import type { Diagnostic, Source } from './index.js';
import { scanJournalLines } from './syntax.js';

export const MAX_JOURNAL_SOURCES = 4096;
export const MAX_INCLUDE_DEPTH = 32;
const MAX_INCLUDE_EDGES = 8192;
export interface IncludeEdge {
  from: string;
  to: string;
  line: number;
  start: number;
  end: number;
}
export interface IncludeGraph {
  entryPoints: string[];
  edges: IncludeEdge[];
  diagnostics: Diagnostic[];
}

/** Portable, case-sensitive virtual paths. No OS access, URL decoding or basename guessing. */
function virtualPath(base: string[], path: string): string | null {
  if (
    !path ||
    /^(?:\/|~)|[\\:]/.test(path) ||
    [...path].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
  )
    return null;
  const parts = [...base];
  for (const part of path.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (!parts.length) return null;
      parts.pop();
    } else parts.push(part);
  }
  return parts.length ? parts.join('/') : null;
}

/**
 * Resolve only explicitly supplied sources. Unreferenced sources are entry points;
 * referenced children are expanded once in directive order, never counted again
 * merely because they were selected. Invalid graphs disable interpretation.
 */
export function resolveIncludes(sources: readonly Source[]): IncludeGraph {
  const graph: IncludeGraph = { entryPoints: [], edges: [], diagnostics: [] };
  const error = (file: string, line: number, code: string, message: string) =>
    graph.diagnostics.push({ file, line, code, message });
  if (sources.length > MAX_JOURNAL_SOURCES) {
    error(
      sources[0]?.name ?? '',
      1,
      'include-limit',
      `Select at most ${MAX_JOURNAL_SOURCES} journal files.`,
    );
    return graph;
  }
  const paths = new Map<string, Source>();
  for (const source of sources) {
    const key = virtualPath([], source.name);
    if (!key)
      error(
        source.name,
        1,
        'source-path',
        'Source names must be relative portable paths within the selected bundle.',
      );
    else if (paths.has(key))
      error(
        source.name,
        1,
        'duplicate-source',
        'Ambiguous source path; select each file once with a distinct relative path.',
      );
    else paths.set(key, source);
  }
  if (graph.diagnostics.length) return graph;
  const directories = new Set(['']);
  for (const key of paths.keys()) {
    const parts = key.split('/');
    for (let i = 1; i < parts.length; i++)
      directories.add(parts.slice(0, i).join('/'));
  }
  for (const [key, source] of paths) {
    if (directories.has(key))
      error(
        source.name,
        1,
        'source-path',
        'A selected path is both a file and a directory.',
      );
  }
  if (graph.diagnostics.length) return graph;
  let directiveCount = 0;
  const incoming = new Set<string>();
  const outgoing = new Map<string, IncludeEdge[]>();
  for (const source of sources) {
    // Ordinary large single-file journals need no second scan or retained syntax tree.
    if (!source.text.includes('include')) continue;
    for (const node of scanJournalLines(source)) {
      if (node.kind !== 'directive') continue;
      const body = source.text.slice(node.bodyStart, node.bodyEnd);
      const content = body.split(';', 1)[0]!.trimEnd();
      if (!/^include(?:\s|$)/.test(content)) continue;
      if (++directiveCount > MAX_INCLUDE_EDGES) {
        error(
          source.name,
          node.line,
          'include-limit',
          'Too many include directives.',
        );
        return graph;
      }
      const target = content.slice('include'.length).trim();
      const comment = body.indexOf(';');
      if (
        !/^[\p{L}\p{N}._/-]+$/u.test(target) ||
        (comment >= 0 && !/\s/.test(body[comment - 1] ?? ''))
      ) {
        error(
          source.name,
          node.line,
          'include-path',
          'Use an unquoted relative path with letters, numbers, dots, slashes, underscores or hyphens. Globs, quoted paths and expansions are not supported yet.',
        );
        continue;
      }
      const base = virtualPath([], source.name)!.split('/').slice(0, -1);
      const key = virtualPath(base, target);
      if (!key) {
        error(
          source.name,
          node.line,
          'include-path',
          'Include path must stay within the selected bundle; absolute, URL and platform-specific paths are not supported.',
        );
        continue;
      }
      const segments = [...base];
      const targetParts = target.split('/');
      let missingDirectory = false;
      for (const [i, part] of targetParts.entries()) {
        if (part === '..') segments.pop();
        else if (part && part !== '.') segments.push(part);
        if (i < targetParts.length - 1 && !directories.has(segments.join('/')))
          missingDirectory = true;
      }
      const child = missingDirectory ? undefined : paths.get(key);
      if (!child) {
        error(
          source.name,
          node.line,
          'include-missing',
          `Include target is not selected: ${target}. Select all referenced files together, preserving relative paths.`,
        );
        continue;
      }
      const edge: IncludeEdge = {
        from: source.name,
        to: child.name,
        line: node.line,
        start: node.start,
        end: node.end,
      };
      graph.edges.push(edge);
      incoming.add(child.name);
      const edges = outgoing.get(source.name) ?? [];
      edges.push(edge);
      outgoing.set(source.name, edges);
    }
  }
  graph.entryPoints = sources
    .filter((s) => !incoming.has(s.name))
    .map((s) => s.name);
  const active = new Set<string>(),
    visited = new Set<string>();
  function visit(name: string, depth: number, edge?: IncludeEdge) {
    const location = { file: edge?.from ?? name, line: edge?.line ?? 1 };
    if (depth > MAX_INCLUDE_DEPTH) {
      error(
        location.file,
        location.line,
        'include-limit',
        `Include nesting exceeds ${MAX_INCLUDE_DEPTH} files.`,
      );
      return;
    }
    if (active.has(name)) {
      error(
        location.file,
        location.line,
        'include-cycle',
        'Include cycle detected.',
      );
      return;
    }
    if (visited.has(name)) {
      error(
        location.file,
        location.line,
        'include-repeat',
        'Repeated includes are not supported; the same selected file must not contribute twice.',
      );
      return;
    }
    visited.add(name);
    active.add(name);
    for (const child of outgoing.get(name) ?? [])
      visit(child.to, depth + 1, child);
    active.delete(name);
  }
  for (const name of graph.entryPoints) visit(name, 1);
  // A component containing only a cycle has no inferred entry point. Inspect it too.
  for (const source of sources)
    if (!visited.has(source.name)) visit(source.name, 1);
  return graph;
}

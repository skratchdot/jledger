import { glob, open, realpath, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { homedir } from 'node:os';
import { MAX_JOURNAL_SOURCES, type Source } from '@jledger/core';

export const MAX_BYTES = 256 * 1024 * 1024;

/** Explicit files replace (rather than append to) the environment/default selection. */
export function selectFiles(
  explicit: string[] | undefined,
  environment: string | undefined,
  home = homedir(),
): string[] {
  if (explicit?.length) return explicit;
  return [environment?.trim() ? environment : join(home, '.hledger.journal')];
}

export async function resolveFiles(
  explicit: string[] | undefined,
  environment = process.env.LEDGER_FILE,
): Promise<string[]> {
  const chosen = selectFiles(explicit, environment);
  const result: string[] = [];
  for (const file of chosen) {
    const expanded = file.startsWith('~/')
      ? join(homedir(), file.slice(2))
      : file;
    // Match hledger's env-only glob behavior: use the alphabetically first match.
    if (
      !explicit?.length &&
      environment?.trim() &&
      /[*?[\]{}]/.test(expanded)
    ) {
      const matches: string[] = [];
      for await (const match of glob(expanded))
        if ((await stat(match)).isFile()) matches.push(match);
      matches.sort();
      if (!matches.length)
        throw new Error('LEDGER_FILE pattern matched no files.');
      result.push(resolve(matches[0]!));
    } else result.push(resolve(expanded));
  }
  const canonical = await Promise.all(result.map((file) => realpath(file)));
  if (new Set(canonical).size !== canonical.length)
    throw new Error('The same journal was selected more than once.');
  return canonical;
}

export async function readSources(files: string[]): Promise<Source[]> {
  if (files.length > MAX_JOURNAL_SOURCES)
    throw new Error(`Select at most ${MAX_JOURNAL_SOURCES} journal files.`);
  if (!files.length) return [];
  const canonical = await Promise.all(files.map((file) => realpath(file)));
  if (canonical.some((file, i) => file !== resolve(files[i]!)))
    throw new Error(
      'A selected journal path changed or is a symbolic link. Reselect the journals.',
    );
  if (new Set(canonical).size !== canonical.length)
    throw new Error('The same journal was selected more than once.');
  // Virtual paths share only the selected files' common directory. This grants
  // no authority to open other files there: includes resolve against this allowlist.
  let directory = dirname(canonical[0]!);
  for (const file of canonical) {
    while (true) {
      const path = relative(directory, file);
      if (!isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`))
        break;
      const parent = dirname(directory);
      if (parent === directory)
        throw new Error('Selected journals must share a filesystem root.');
      directory = parent;
    }
  }
  let total = 0;
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const sources: Source[] = [];
  for (const file of canonical) {
    const handle = await open(
      file,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    try {
      const info = await handle.stat();
      if (!info.isFile())
        throw new Error('Each journal must be a regular file.');
      if (total + info.size > MAX_BYTES)
        throw new Error('Selected journals exceed the 256 MiB total limit.');
      // Bound allocation even if a selected file grows between stat and read.
      const chunks: Buffer[] = [];
      let size = 0;
      while (true) {
        const buffer = Buffer.alloc(
          Math.min(64 * 1024, MAX_BYTES - total - size + 1),
        );
        const { bytesRead } = await handle.read(buffer);
        if (!bytesRead) break;
        size += bytesRead;
        if (total + size > MAX_BYTES)
          throw new Error('Selected journals exceed the 256 MiB total limit.');
        chunks.push(buffer.subarray(0, bytesRead));
      }
      total += size;
      sources.push({
        name: relative(directory, file).split(sep).join('/'),
        text: decoder.decode(Buffer.concat(chunks, size)),
      });
    } finally {
      await handle.close();
    }
  }
  return sources;
}

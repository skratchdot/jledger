import { glob, readFile, realpath, stat } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import type { Source } from '@jledger/core';

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
  const sizes = await Promise.all(
    files.map(async (file) => {
      const info = await stat(file);
      if (!info.isFile())
        throw new Error('Each journal must be a regular file.');
      return info.size;
    }),
  );
  if (sizes.reduce((sum, size) => sum + size, 0) > MAX_BYTES)
    throw new Error('Selected journals exceed the 256 MiB total limit.');
  const buffers = await Promise.all(files.map((file) => readFile(file)));
  if (buffers.reduce((sum, buffer) => sum + buffer.length, 0) > MAX_BYTES)
    throw new Error('Selected journals exceed the 256 MiB total limit.');
  const names = files.map((file) => basename(file));
  const decoder = new TextDecoder('utf-8', { fatal: true });
  return buffers.map((buffer, i) => ({
    name:
      names.filter((n) => n === names[i]).length > 1
        ? `${i + 1}/${names[i]}`
        : names[i]!,
    text: decoder.decode(buffer),
  }));
}

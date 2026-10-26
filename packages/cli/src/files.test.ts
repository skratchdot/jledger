import {
  mkdtemp,
  mkdir,
  rm,
  writeFile,
  symlink,
  unlink,
  truncate,
} from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseJournal, balances } from '@jledger/core';
import { MAX_BYTES, readSources, resolveFiles, selectFiles } from './files.js';
let root = '';
afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
  root = '';
});

describe('journal file selection', () => {
  it('explicit files win over LEDGER_FILE and home fallback', () => {
    expect(selectFiles(['one', 'two'], 'env', '/home/test')).toEqual([
      'one',
      'two',
    ]);
    expect(selectFiles([], 'env', '/home/test')).toEqual(['env']);
    expect(selectFiles(undefined, undefined, '/home/test')).toEqual([
      '/home/test/.hledger.journal',
    ]);
    expect(selectFiles([], '  ', '/home/test')).toEqual([
      '/home/test/.hledger.journal',
    ]);
  });
  it('expands LEDGER_FILE glob to the first alphabetical file, but not explicit paths', async () => {
    root = await mkdtemp(join(tmpdir(), 'jledger-files-'));
    await writeFile(join(root, 'b.journal'), 'second');
    await writeFile(join(root, 'a.journal'), 'first');
    expect(await resolveFiles([], `${root}/*.journal`)).toEqual([
      join(root, 'a.journal'),
    ]);
    await expect(
      resolveFiles([`${root}/*.journal`], 'ignored'),
    ).rejects.toThrow();
    await expect(resolveFiles([], `${root}/*.missing`)).rejects.toThrow(
      'matched no files',
    );
  });
  it('rejects duplicates, distinguishes basename collisions and rejects invalid UTF-8', async () => {
    root = await mkdtemp(join(tmpdir(), 'jledger-files-'));
    await mkdir(join(root, 'nested'));
    const a = join(root, 'a.journal');
    const b = join(root, 'nested/a.journal');
    await writeFile(a, 'one');
    await writeFile(b, 'two');
    await expect(resolveFiles([a, a])).rejects.toThrow('more than once');
    expect((await readSources([a, b])).map((s) => s.name)).toEqual([
      'a.journal',
      'nested/a.journal',
    ]);
    await writeFile(a, Buffer.from([0xff]));
    await expect(readSources([a])).rejects.toThrow();
  });
  it('maps selected nested paths without discovering unselected include targets', async () => {
    root = await mkdtemp(join(tmpdir(), 'jledger-includes-'));
    await mkdir(join(root, 'monthly exports'));
    const main = join(root, 'main.journal');
    const child = join(root, 'monthly exports/child journal.journal');
    await writeFile(main, 'include monthly exports/child journal.journal\n');
    await writeFile(
      child,
      '2026-01-01 Included\n  expenses:food  1.23 USD\n  assets:cash\n',
    );
    const selected = await resolveFiles([main, child], 'ignored');
    const sources = await readSources(selected);
    expect(sources.map((s) => s.name)).toEqual([
      'main.journal',
      'monthly exports/child journal.journal',
    ]);
    const journal = parseJournal(sources);
    expect(journal.diagnostics).toEqual([]);
    expect(journal.transactions).toHaveLength(1);
    expect(journal.transactions[0]!.source.file).toBe(
      'monthly exports/child journal.journal',
    );
    const missing = parseJournal(await readSources(await resolveFiles([main])));
    expect(missing.diagnostics[0]!.code).toBe('include-missing');
    expect(() => balances(missing)).toThrow('reports are disabled');
  });

  it('rejects selected-path symlink substitution on reread and symlink aliases on selection', async () => {
    root = await mkdtemp(join(tmpdir(), 'jledger-includes-'));
    const main = join(root, 'main.journal');
    const secret = join(root, 'unselected.journal');
    await writeFile(main, 'selected');
    await writeFile(secret, 'unselected');
    const selected = await resolveFiles([main]);
    await unlink(main);
    await symlink(secret, main);
    await expect(readSources(selected)).rejects.toThrow('path changed');
    await expect(resolveFiles([main, secret])).rejects.toThrow(
      'more than once',
    );
  });

  it('rejects directories and oversized files before decoding', async () => {
    root = await mkdtemp(join(tmpdir(), 'jledger-includes-'));
    await expect(readSources([root])).rejects.toThrow();
    const oversized = join(root, 'oversized.journal');
    await writeFile(oversized, '');
    await truncate(oversized, MAX_BYTES + 1);
    await expect(readSources([oversized])).rejects.toThrow('256 MiB');
  });
  it.skipIf(process.platform === 'win32')(
    'rejects a named pipe without waiting for a writer',
    async () => {
      root = await mkdtemp(join(tmpdir(), 'jledger-includes-'));
      const pipe = join(root, 'pipe.journal');
      execFileSync('mkfifo', [pipe]);
      await expect(readSources([pipe])).rejects.toThrow('regular file');
    },
  );
});

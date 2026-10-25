import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readSources, resolveFiles, selectFiles } from './files.js';
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
      '1/a.journal',
      '2/a.journal',
    ]);
    await writeFile(a, Buffer.from([0xff]));
    await expect(readSources([a])).rejects.toThrow();
  });
});

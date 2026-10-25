import { mkdtemp, mkdir, rm, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request, type Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createJournalServer } from './server.js';
let root: string, base: string, server: Server;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'jledger-server-'));
  await mkdir(join(root, 'public'));
  await writeFile(join(root, 'public/index.html'), '<h1>Explorer</h1>');
  await writeFile(join(root, 'private.journal'), '2024-01-01\n  a  1\n  b\n');
  server = await createJournalServer(
    [join(root, 'private.journal')],
    join(root, 'public'),
  );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
});
afterEach(async () => {
  server?.closeAllConnections();
  if (server)
    await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(root, { recursive: true, force: true });
});
describe('private read-only server', () => {
  it('serves the explorer and only selected journals, uncached', async () => {
    expect(await (await fetch(base)).text()).toContain('Explorer');
    const response = await fetch(`${base}/api/journals`);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    expect(await response.json()).toEqual([
      { name: 'private.journal', text: '2024-01-01\n  a  1\n  b\n' },
    ]);
    await writeFile(join(root, 'private.journal'), 'updated');
    expect(await (await fetch(`${base}/api/journals`)).json()).toEqual([
      { name: 'private.journal', text: 'updated' },
    ]);
  });
  it('rejects writes, arbitrary path requests, cross-origin requests and rebinding hosts', async () => {
    expect(
      (await fetch(`${base}/api/journals`, { method: 'POST' })).status,
    ).toBe(405);
    expect((await fetch(`${base}/api/journals?file=/etc/passwd`)).status).toBe(
      400,
    );
    expect((await fetch(`${base}/private.journal`)).status).toBe(404);
    expect(
      (
        await fetch(`${base}/api/journals`, {
          headers: { Origin: 'https://evil.example' },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await fetch(`${base}/api/journals`, {
          headers: { 'Sec-Fetch-Site': 'cross-site' },
        })
      ).status,
    ).toBe(403);
    const status = await new Promise<number | undefined>((resolve, reject) => {
      const req = request(
        base + '/api/journals',
        { headers: { Host: 'evil.example' } },
        (res) => {
          res.resume();
          resolve(res.statusCode);
        },
      );
      req.on('error', reject);
      req.end();
    });
    expect(status).toBe(403);
  });
  it('does not follow static symlinks outside the asset directory', async () => {
    await symlink(join(root, 'private.journal'), join(root, 'public/leak.js'));
    expect((await fetch(`${base}/leak.js`)).status).toBe(404);
  });
});

// Test-only static host: verifies the published artifact under a GitHub Pages subpath.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const base = process.env.JLEDGER_TEST_BASE_PATH || '/';
const root = resolve('packages/web/dist/client');
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
};
createServer(async (req, res) => {
  const path = new URL(req.url, 'http://127.0.0.1').pathname;
  if (!path.startsWith(base)) {
    res.writeHead(404).end();
    return;
  }
  const file = resolve(root, path.slice(base.length) || 'index.html');
  if (!file.startsWith(root + sep)) {
    res.writeHead(404).end();
    return;
  }
  try {
    const data = await readFile(file);
    res.setHeader(
      'Content-Type',
      types[extname(file)] || 'application/octet-stream',
    );
    res.end(data);
  } catch {
    res.writeHead(404).end();
  }
}).listen(4317, '127.0.0.1');

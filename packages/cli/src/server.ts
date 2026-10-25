import { createServer } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { readSources } from './files.js';

const mime: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};
const policy =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'none'";

/** Loopback-only, read-only server. No arbitrary file-path endpoint or write API. */
export async function createJournalServer(files: string[], directory: string) {
  const root = await realpath(directory);
  await readFile(resolve(root, 'index.html'));
  await readSources(files);
  const server = createServer(async (req, res) => {
    const send = (
      status: number,
      body: string,
      type = 'text/plain; charset=utf-8',
    ) => {
      res.writeHead(status, { 'Content-Type': type });
      res.end(body);
    };
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', policy);
    res.setHeader('Cache-Control', 'no-store');
    const address = server.address();
    const port = address && typeof address !== 'string' ? address.port : 0;
    const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
    if (!hosts.includes(req.headers.host ?? '')) {
      send(403, 'Invalid host.');
      return;
    }
    if (
      req.headers.origin &&
      req.headers.origin !== `http://${req.headers.host}`
    ) {
      send(403, 'Cross-origin access denied.');
      return;
    }
    if (
      req.headers['sec-fetch-site'] &&
      !['same-origin', 'none'].includes(String(req.headers['sec-fetch-site']))
    ) {
      send(403, 'Cross-site access denied.');
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      send(405, 'Read-only server.');
      return;
    }
    let url: URL;
    try {
      url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    } catch {
      send(400, 'Invalid URL.');
      return;
    }
    if (url.pathname === '/api/journals') {
      if (url.search) {
        send(400, 'The journal endpoint accepts no parameters.');
        return;
      }
      try {
        const sources = await readSources(files);
        send(
          200,
          req.method === 'HEAD' ? '' : JSON.stringify(sources),
          'application/json; charset=utf-8',
        );
      } catch {
        send(
          500,
          'Could not read selected journals. Check file access and the 256 MiB limit.',
        );
      }
      return;
    }
    try {
      const decoded = decodeURIComponent(url.pathname);
      if (
        decoded.includes('\0') ||
        decoded.split('/').some((segment) => segment.startsWith('.'))
      ) {
        send(404, 'Not found.');
        return;
      }
      const file = await realpath(
        resolve(root, `.${decoded === '/' ? '/index.html' : decoded}`),
      );
      if (!file.startsWith(root + sep) || !mime[extname(file)]) {
        send(404, 'Not found.');
        return;
      }
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': mime[extname(file)]! });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch {
      if (!res.headersSent) send(404, 'Not found.');
      else res.end();
    }
  });
  return server;
}

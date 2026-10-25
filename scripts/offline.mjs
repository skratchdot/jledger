import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../packages/web/dist/client');
async function files(dir, prefix = '') {
  const result = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = `${prefix}${item.name}`;
    if (item.isDirectory())
      result.push(...(await files(`${dir}/${item.name}`, `${path}/`)));
    else if (item.name !== 'sw.js' && !item.name.endsWith('.map'))
      result.push(path);
  }
  return result;
}
const assets = (await files(root)).sort();
const hash = createHash('sha256');
for (const file of assets) hash.update(await readFile(`${root}/${file}`));
const version = hash.digest('hex').slice(0, 16);
// Only build-time public assets are cached. Never journal responses or arbitrary requests.
await writeFile(
  `${root}/sw.js`,
  `
const PREFIX = 'jledger-shell-' + self.registration.scope + '::';
const CACHE = PREFIX + ${JSON.stringify(version)};
const ASSETS = ${JSON.stringify(assets)}.map(path => new URL(path, self.registration.scope).href);
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.includes('/api/')) return;
  const clean = new URL(url); clean.search = ''; clean.hash = '';
  const isRoot = clean.href === self.registration.scope;
  if (!ASSETS.includes(clean.href) && !isRoot) return;
  event.respondWith(caches.open(CACHE).then(cache => cache.match(isRoot ? new URL('index.html', self.registration.scope).href : clean.href)).then(cached => cached || fetch(event.request)));
});
`,
);
await writeFile(`${root}/.nojekyll`, '');
console.log(
  `Offline shell generated: ${assets.length} public assets, version ${version}`,
);

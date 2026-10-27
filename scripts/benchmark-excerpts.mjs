import { performance } from 'node:perf_hooks';
import { sourceExcerpt } from '../packages/web/src/source-excerpt.ts';

// Synthetic only: no journal files or network requests. Run with --expose-gc so
// each sample starts after collection. Heap deltas are observations, not peaks.
if (!globalThis.gc) throw new Error('Run with node --expose-gc --import tsx');
const transactions = 200_000;
const text = Array.from(
  { length: transactions },
  (_, i) =>
    `2024-01-01 * transaction ${i}\n  expenses:coffee  0.01 USD\n  assets:cash\n\n`,
).join('');
const methods = {
  'legacy-split': (first, last) =>
    text
      .split(/\r?\n/)
      .slice(first - 1, last)
      .join('\n'),
  'range-scan': (first, last) => sourceExcerpt(text, first, last),
};
const samples = [];
for (const index of [0, Math.floor(transactions / 2), transactions - 1]) {
  const first = index * 4 + 1;
  const expected = `2024-01-01 * transaction ${index}\n  expenses:coffee  0.01 USD\n  assets:cash`;
  for (const [method, extract] of Object.entries(methods)) {
    globalThis.gc();
    const heapBefore = process.memoryUsage().heapUsed;
    const start = performance.now();
    const excerpt = extract(first, first + 2);
    const elapsedMs = performance.now() - start;
    const heapAfter = process.memoryUsage().heapUsed;
    if (excerpt !== expected)
      throw new Error(`Incorrect excerpt: ${method}, ${index}`);
    samples.push({
      method,
      transaction: index,
      elapsedMs,
      uncollectedHeapDeltaBytes: heapAfter - heapBefore,
    });
  }
}
console.log(
  JSON.stringify(
    {
      node: process.version,
      transactions,
      sourceBytes: Buffer.byteLength(text),
      samples,
    },
    null,
    2,
  ),
);

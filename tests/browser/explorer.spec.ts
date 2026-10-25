import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
const journal =
  '2024-02-01 * Salary\n  assets:cash  1000 USD\n  income:salary\n\n2024-02-02 ! Coffee\n  expenses:coffee  4.25 USD\n  assets:cash\n';

test('static import stays local, charts filter the register, and details explain inference', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const requests: string[] = [];
  page.on('request', (req) => requests.push(req.url()));
  await page.goto('./');
  await expect(
    page.getByRole('heading', { name: 'Meet your journal’s better half.' }),
  ).toBeVisible();
  await page.getByLabel('Import journal files').setInputFiles({
    name: 'personal.journal',
    mimeType: 'text/plain',
    buffer: Buffer.from(journal),
  });
  await expect(page.getByRole('table')).toContainText('Coffee');
  await expect(page.getByLabel('Filtered totals')).toContainText('4.25 USD');
  await page
    .getByRole('button', { name: 'Filter expenses:coffee', exact: true })
    .click();
  await expect(page.getByRole('table')).not.toContainText('Salary');
  await page
    .getByRole('button', { name: 'Clear filters', exact: true })
    .click();
  await page.getByRole('button', { name: '! Coffee', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('-4.25 USD');
  await expect(page.getByRole('dialog')).toContainText('inferred');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByLabel('Search transactions').fill('salary');
  await expect(page.getByRole('table')).not.toContainText('Coffee');
  await expect(page.getByRole('table')).toContainText('Salary');
  await page
    .getByRole('button', { name: 'Clear filters', exact: true })
    .click();
  await page.getByLabel('Status', { exact: true }).selectOption('!');
  await expect(page.getByRole('table')).not.toContainText('Salary');
  expect(requests.some((url) => url.includes('/api/'))).toBe(false);
  expect(requests.every((url) => new URL(url).hostname === '127.0.0.1')).toBe(
    true,
  );
  expect(errors).toEqual([]);
});

test('invalid and unsupported files disable reports with source diagnostics', async ({
  page,
}) => {
  await page.goto('./');
  await page.getByLabel('Import journal files').setInputFiles({
    name: 'unsupported.journal',
    mimeType: 'text/plain',
    buffer: Buffer.from('include private.journal\n' + journal),
  });
  await expect(page.getByRole('alert')).toContainText('unsupported.journal:1');
  await expect(
    page.getByRole('heading', {
      name: 'Reports paused to keep your totals honest.',
    }),
  ).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);
});

test('demo, account drill-down, month filters and drag-and-drop work', async ({
  page,
}) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Explore sample journal' }).click();
  await expect(page.getByLabel('Filtered totals')).toContainText('10');
  await page.getByRole('button', { name: 'Filter month 2026-02' }).click();
  await expect(page.getByRole('table')).not.toContainText('2026-01');
  await page.getByRole('button', { name: /Accounts/ }).click();
  await expect(
    page.getByRole('button', { name: 'assets:bank:checking 7139.80 USD' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Close journals' }).click();
  await page.evaluate((text) => {
    const transfer = new DataTransfer();
    transfer.items.add(
      new File([text], 'dropped.journal', { type: 'text/plain' }),
    );
    document
      .querySelector('.app')!
      .dispatchEvent(
        new DragEvent('drop', { bubbles: true, dataTransfer: transfer }),
      );
  }, journal);
  await expect(page.getByRole('table')).toContainText('Coffee');
});

test('offline reload preserves the app shell but never persists imported journals', async ({
  page,
  context,
}) => {
  await page.goto('./');
  await page.getByLabel('Import journal files').setInputFiles({
    name: 'secret.journal',
    mimeType: 'text/plain',
    buffer: Buffer.from(journal),
  });
  await expect(
    page.getByText('App available offline', { exact: false }),
  ).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);
  const cached = await page.evaluate(async () => {
    const requests = await Promise.all(
      (await caches.keys()).map(async (key) =>
        (await (await caches.open(key)).keys()).map((req) => req.url),
      ),
    );
    return requests.flat();
  });
  expect(cached.length).toBeGreaterThan(0);
  expect(
    cached.some((url) =>
      /\/api\/|secret\.journal|offline\.journal/.test(
        new URL(url).pathname.replace('/jledger/', '/'),
      ),
    ),
  ).toBe(false);
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Meet your journal’s better half.' }),
  ).toBeVisible();
  await page.getByLabel('Import journal files').setInputFiles({
    name: 'offline.journal',
    mimeType: 'text/plain',
    buffer: Buffer.from(journal),
  });
  await expect(page.getByRole('table')).toContainText('Coffee');
});

test('local server loads explicitly selected journals', async ({ page }) => {
  test.skip(
    Boolean(process.env.JLEDGER_TEST_BASE_PATH),
    'Static deployment has no local journal API.',
  );
  await page.goto('./?local=1');
  await expect(page.getByRole('table')).toContainText('Northwind');
  await expect(
    page.getByRole('button', { name: 'Reload files' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Reload files' }).click();
  await expect(page.getByRole('table')).toContainText('Northwind');
});

test('200,000 transactions import off-thread, search stays responsive, and every result is browsable', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  const count = 200_000;
  const large = Buffer.from(
    Array.from(
      { length: count },
      (_, index) =>
        `2024-01-01 * transaction ${index}\n  expenses:coffee  0.01 USD\n  assets:cash\n\n`,
    ).join(''),
  );
  await page.goto('./');
  await page.getByRole('button', { name: 'Explore sample journal' }).click();
  await expect(page.getByRole('table')).toContainText('Northwind');
  await page.evaluate(() => {
    const state = window as typeof window & {
      frames: number;
      stopFrames: boolean;
    };
    state.frames = 0;
    state.stopFrames = false;
    function tick() {
      state.frames++;
      if (!state.stopFrames) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
  const start = Date.now();
  await page.getByLabel('Import journal files').setInputFiles({
    name: 'large.journal',
    mimeType: 'text/plain',
    buffer: large,
  });
  const typeStart = Date.now();
  await page.getByLabel('Search transactions').fill('transaction 199999');
  await expect(page.getByLabel('Search transactions')).toHaveValue(
    'transaction 199999',
  );
  const inputLatency = Date.now() - typeStart;
  expect(inputLatency).toBeLessThan(1000);
  await expect(page.getByRole('table')).toContainText('transaction 199999', {
    timeout: 60_000,
  });
  await expect(page.getByRole('table')).toHaveAttribute('aria-rowcount', '2');
  const importAndSearchMs = Date.now() - start;
  const frames = await page.evaluate(() => {
    const state = window as typeof window & {
      frames: number;
      stopFrames: boolean;
    };
    state.stopFrames = true;
    return state.frames;
  });
  expect(frames).toBeGreaterThan(5);
  await page
    .getByRole('button', { name: 'Clear filters', exact: true })
    .click();
  await expect(page.getByRole('table')).toHaveAttribute(
    'aria-rowcount',
    String(count + 1),
  );
  await expect(page.getByLabel('Filtered totals')).toContainText('2000.00 USD');
  await page.getByLabel('From date', { exact: true }).fill('2024-01-02');
  await expect(page.getByRole('table')).toHaveAttribute('aria-rowcount', '1');
  await page.getByLabel('From date', { exact: true }).fill('2024-01-01');
  await page.getByLabel('Through date', { exact: true }).fill('2024-01-01');
  await expect(page.getByRole('table')).toHaveAttribute(
    'aria-rowcount',
    String(count + 1),
  );
  await expect(page.getByLabel('Filtered totals')).toContainText('2000.00 USD');
  expect(await page.locator('tbody tr').count()).toBeLessThan(50);
  await page.getByLabel('Scrollable transaction register').evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  await expect(page.getByRole('table')).toContainText('transaction 199999');
  expect(await page.locator('tbody tr').count()).toBeLessThan(50);
  await writeFile(
    testInfo.outputPath('metrics.json'),
    JSON.stringify(
      {
        transactions: count,
        bytes: large.length,
        inputLatencyMs: inputLatency,
        importAndSearchMs,
        animationFramesDuringImport: frames,
      },
      null,
      2,
    ),
  );
  await testInfo.attach('large-journal-metrics', {
    body: JSON.stringify({
      transactions: count,
      bytes: large.length,
      inputLatencyMs: inputLatency,
      importAndSearchMs,
      animationFramesDuringImport: frames,
    }),
    contentType: 'application/json',
  });
});

test('monthly include bundle preserves exact totals, comment context and source drill-down', async ({
  page,
}) => {
  const files = Array.from({ length: 12 }, (_, index) => {
    const month = String(index + 1).padStart(2, '0');
    const prefix =
      '; synthetic monthly export\ncomment\ninclude not-a-real-file.journal\nend comment\n\n';
    const bankCents = 300000n - 578123n * BigInt(index);
    const bankDigits = (bankCents < 0n ? -bankCents : bankCents)
      .toString()
      .padStart(3, '0');
    const bankBalance = `${bankCents < 0n ? '-' : ''}${bankDigits.slice(0, -2)}.${bankDigits.slice(-2)}`;
    const salary = `2026-${month}-01 Salary month ${month}\n  assets:bank  3,000.00 USD = ${bankBalance} USD\n  income:salary\n\n`;
    const purchases = Array.from({ length: 1999 }, (_, item) => {
      const number = item + 1;
      const quantity = number % 2 ? '10.01' : '-1.23';
      return `2026-${month}-02 month ${month} item ${number} ; synthetic:yes\n  expenses:food  ${quantity} USD ; café 🍵${number % 2 ? ` [2026-${month}-03]` : ''}\n  assets:bank\n\n`;
    }).join('');
    const text = prefix + salary + purchases;
    return {
      name: `2026-${month}.journal`,
      mimeType: 'text/plain',
      buffer: Buffer.from(
        index % 2 ? `\uFEFF${text.replaceAll('\n', '\r\n')}` : text,
      ),
    };
  });
  files.push({
    name: 'main.journal',
    mimeType: 'text/plain',
    buffer: Buffer.from(
      'commodity 1,000.00 USD\n' +
        files.map((file) => `include ${file.name}\n`).join(''),
    ),
  });
  await page.goto('./');
  await page.getByLabel('Import journal files').setInputFiles(files);
  await expect(page.getByRole('table')).toHaveAttribute(
    'aria-rowcount',
    '24001',
  );
  await expect(page.getByLabel('Filtered totals')).toContainText(
    '105374.76 USD',
  );
  await expect(page.getByLabel('Filtered totals')).toContainText(
    '36000.00 USD',
  );
  expect(await page.locator('tbody tr').count()).toBeLessThan(50);
  await page.getByLabel('Month', { exact: true }).selectOption('2026-12');
  await expect(page.getByRole('table')).toHaveAttribute(
    'aria-rowcount',
    '2001',
  );
  await expect(page.getByLabel('Filtered totals')).toContainText('8781.23 USD');
  await page.getByLabel('Search transactions').fill('month 12 item 1999');
  await expect(page.getByRole('table')).toHaveAttribute('aria-rowcount', '2');
  await page.getByRole('button', { name: /month 12 item 1999/ }).click();
  await expect(page.getByRole('dialog')).toContainText('2026-12.journal:8002');
  await expect(page.getByRole('dialog')).toContainText('synthetic:yes');
  await expect(page.getByRole('dialog')).toContainText('café 🍵');
  await expect(page.getByRole('dialog')).toContainText('-10.01 USD');
});

test('selected include bundle stays local and missing targets disable reports after replacement', async ({
  page,
}) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('./');
  const main = {
    name: 'main.journal',
    mimeType: 'text/plain',
    buffer: Buffer.from('include child.journal\n'),
  };
  await page.getByLabel('Import journal files').setInputFiles([
    {
      name: 'child.journal',
      mimeType: 'text/plain',
      buffer: Buffer.from(journal),
    },
    main,
  ]);
  await expect(page.getByRole('table')).toHaveAttribute('aria-rowcount', '3');
  await expect(page.getByLabel('Filtered totals')).toContainText('4.25 USD');
  await page.getByRole('button', { name: '! Coffee', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('child.journal:5');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByLabel('Import journal files').setInputFiles(main);
  await expect(page.getByRole('alert')).toContainText('main.journal:1');
  await expect(page.getByRole('alert')).toContainText(
    'Include target is not selected',
  );
  await expect(page.getByRole('table')).toHaveCount(0);
  expect(requests.some((url) => /child\.journal|\/api\//.test(url))).toBe(
    false,
  );
});

test('journal folder maps nested relative paths in the worker and rejects escapes', async ({
  page,
}, testInfo) => {
  const directory = testInfo.outputPath('bundle');
  await mkdir(join(directory, 'parts'), { recursive: true });
  await writeFile(
    join(directory, 'main.journal'),
    'include parts/child.journal\n',
  );
  await writeFile(
    join(directory, 'parts/child.journal'),
    '2026-01-01 Nested\n  expenses:food  1.23 USD\n  assets:cash\n\ninclude ../other.journal\n',
  );
  await writeFile(
    join(directory, 'other.journal'),
    '2026-01-02 Other\n  expenses:food  2.00 USD\n  assets:cash\n',
  );
  await page.goto('./');
  await page
    .getByLabel('Import journal folder', { exact: true })
    .setInputFiles(directory);
  await expect(page.getByRole('table')).toHaveAttribute('aria-rowcount', '3');
  await expect(page.getByLabel('Filtered totals')).toContainText('3.23 USD');
  await page.getByRole('button', { name: '· Nested', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText(
    'bundle/parts/child.journal:1',
  );
  await expect(page.getByRole('dialog')).toContainText('-1.23 USD');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await writeFile(
    join(directory, 'main.journal'),
    'include ../../outside.journal\n',
  );
  await page
    .getByLabel('Import journal folder', { exact: true })
    .setInputFiles(directory);
  await expect(page.getByRole('alert')).toContainText(
    'Include path must stay within the selected bundle',
  );
  await expect(page.getByRole('table')).toHaveCount(0);
});

test('balance assertions are checked in date order and failures pause every report', async ({
  page,
}) => {
  const text =
    '2024-02-02 Coffee\n  expenses:coffee  4.25 USD\n  assets:cash  -4.25 USD = 995.75 USD\n\n2024-02-01 Salary\n  assets:cash  1000 USD = 1000 USD\n  income:salary\n';
  await page.goto('./');
  const file = (contents: string) => ({
    name: 'asserted.journal',
    mimeType: 'text/plain',
    buffer: Buffer.from(contents),
  });
  await page.getByLabel('Import journal files').setInputFiles(file(text));
  await expect(page.getByRole('table')).toHaveAttribute('aria-rowcount', '3');
  await expect(page.getByLabel('Filtered totals')).toContainText('4.25 USD');
  await page.getByRole('button', { name: '· Coffee', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText(
    'balance checked: 995.75 USD',
  );
  await expect(page.getByRole('dialog')).toContainText('= 995.75 USD');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page
    .getByLabel('Import journal files')
    .setInputFiles(file(text.replace('= 995.75 USD', '= 995.74 USD')));
  await expect(page.getByRole('alert')).toContainText('asserted.journal:3');
  await expect(page.getByRole('alert')).toContainText(
    'expected 995.74 USD, calculated 995.75 USD',
  );
  await expect(
    page.getByRole('heading', {
      name: 'Reports paused to keep your totals honest.',
    }),
  ).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);
});

test('posting dates drive month totals while register rows retain transaction context', async ({
  page,
}) => {
  const text =
    '2026-01-01 Pending\n  expenses:food  2 USD ; [2026-02-01]\n  assets:cash\n';
  await page.goto('./');
  await page.getByLabel('Import journal files').setInputFiles({
    name: 'dated.journal',
    mimeType: 'text/plain',
    buffer: Buffer.from(text),
  });
  await expect(page.getByRole('table')).toHaveAttribute('aria-rowcount', '2');
  await page.getByRole('button', { name: 'Filter month 2026-02' }).click();
  await expect(page.getByLabel('Filtered totals')).toContainText('2 USD');
  await expect(page.getByRole('table')).toContainText('2026-01-01');
  await expect(page.getByRole('table')).toContainText('posted 2026-02-01');
  await expect(page.getByRole('table')).not.toContainText('assets:cash');
  await page.getByRole('button', { name: '· Pending', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText(
    'Transaction date 2026-01-01',
  );
  await expect(page.getByRole('dialog')).toContainText('posted 2026-02-01');
  await expect(page.getByRole('dialog')).toContainText('dated.journal:1');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByLabel('Month', { exact: true }).selectOption('2026-01');
  await expect(page.getByLabel('Filtered totals')).toContainText('0 USD');
  await expect(page.getByRole('table')).toContainText('assets:cash');
  await expect(page.getByRole('table')).not.toContainText('expenses:food');
  await page.getByRole('button', { name: /Accounts/ }).click();
  await page
    .getByRole('button', { name: 'expenses:food 2 USD', exact: true })
    .click();
  await expect(page.getByRole('table')).toHaveAttribute('aria-rowcount', '1');
  await page.getByRole('button', { name: /Overview/ }).click();
  await page.getByLabel('Month', { exact: true }).selectOption('2026-02');
  await expect(page.getByRole('table')).toHaveAttribute('aria-rowcount', '2');
  await expect(page.getByLabel('Filtered totals')).toContainText('2 USD');
});

test('unsupported secondary posting dates are diagnostics rather than inert comments', async ({
  page,
}) => {
  await page.goto('./');
  await page.getByLabel('Import journal files').setInputFiles({
    name: 'secondary.journal',
    mimeType: 'text/plain',
    buffer: Buffer.from(
      '2026-01-01 Secondary\n  expenses:food  2 USD ; [=2026-02-01]\n  assets:cash\n',
    ),
  });
  await expect(page.getByRole('alert')).toContainText('secondary.journal:2');
  await expect(page.getByRole('alert')).toContainText(
    'Secondary posting dates are not supported',
  );
  await expect(page.getByRole('table')).toHaveCount(0);
});

test('explicit commodity formats normalize exact totals and preserve original source', async ({
  page,
}) => {
  const text =
    'commodity EUR\n  format 1.000,00 EUR\n\n2026-01-01 Salary\n  assets:cash  2.000,00 EUR = 2.000,00 EUR\n  income:salary\n\n2026-02-01 Food\n  expenses:food  12,34 EUR\n  assets:cash  -12,34 EUR = 1.987,66 EUR\n';
  const file = (contents: string) => ({
    name: 'formatted.journal',
    mimeType: 'text/plain',
    buffer: Buffer.from(contents),
  });
  await page.goto('./');
  await page.getByLabel('Import journal files').setInputFiles(file(text));
  await expect(page.getByRole('table')).toHaveAttribute('aria-rowcount', '3');
  await expect(page.getByLabel('Filtered totals')).toContainText('2000.00 EUR');
  await expect(page.getByLabel('Filtered totals')).toContainText('12.34 EUR');
  await page.getByRole('button', { name: 'Filter month 2026-02' }).click();
  await expect(page.getByRole('table')).toHaveAttribute('aria-rowcount', '2');
  await page.getByRole('button', { name: '· Food', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText(
    'balance checked: 1987.66 EUR',
  );
  await expect(page.getByRole('dialog')).toContainText('12,34 EUR');
  await expect(page.getByRole('dialog')).toContainText('formatted.journal:8');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page
    .getByLabel('Import journal files')
    .setInputFiles(file(text.replace('12,34 EUR', '12.34,56 EUR')));
  await expect(page.getByRole('alert')).toContainText(
    'Unsupported amount or grouping',
  );
  await expect(page.getByRole('table')).toHaveCount(0);
});

test('inclusive ranges share exact chart/register totals and month shortcuts replace bounds', async ({
  page,
}) => {
  const text =
    '2024-02-28 Start\n  expenses:tea  0.10 USD\n  assets:cash\n\n2024-02-29 Leap\n  expenses:food  0.20 USD\n  assets:cash\n\n2024-03-01 Refund\n  expenses:food  -0.05 USD\n  assets:cash\n\n2024-03-02 Outside\n  expenses:food  99 USD\n  assets:cash\n\n2024-02-01 Shifted\n  expenses:food  1.23 USD ; [2024-02-29]\n  assets:cash\n';
  await page.goto('./');
  await page.getByLabel('Import journal files').setInputFiles({
    name: 'range.journal',
    mimeType: 'text/plain',
    buffer: Buffer.from(text),
  });
  await expect(page.getByRole('table')).toHaveAttribute('aria-rowcount', '6');
  await page.getByLabel('From date', { exact: true }).fill('2024-02-28');
  await page.getByLabel('Through date', { exact: true }).fill('2024-03-01');
  await expect(page.getByRole('table')).toHaveAttribute('aria-rowcount', '5');
  await expect(page.getByLabel('Filtered totals')).toContainText('1.48 USD');
  await expect(page.getByRole('table')).toContainText('Shifted');
  await expect(page.getByRole('table')).not.toContainText('Outside');
  await page.getByLabel('From date', { exact: true }).fill('2024-02-29');
  await page.getByLabel('Through date', { exact: true }).fill('2024-02-29');
  await expect(page.getByRole('table')).toHaveAttribute('aria-rowcount', '3');
  await expect(page.getByLabel('Filtered totals')).toContainText('1.43 USD');
  await page.getByRole('button', { name: '· Shifted', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText(
    'Transaction date 2024-02-01',
  );
  await expect(page.getByRole('dialog')).toContainText('posted 2024-02-29');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByLabel('Search transactions').fill('shifted');
  await expect(page.getByRole('table')).toHaveAttribute('aria-rowcount', '2');
  await page.getByLabel('From date', { exact: true }).fill('2024-03-01');
  await page.getByLabel('Through date', { exact: true }).fill('');
  await expect(page.getByRole('table')).toHaveAttribute('aria-rowcount', '1');
  await page.getByRole('button', { name: 'Clear dates', exact: true }).click();
  await expect(page.getByLabel('Search transactions')).toHaveValue('shifted');
  await expect(page.getByRole('table')).toHaveAttribute('aria-rowcount', '2');
  await expect(page.getByLabel('Filtered totals')).toContainText('1.23 USD');
  await page
    .getByRole('button', { name: 'Clear filters', exact: true })
    .click();
  await page.getByLabel('Month', { exact: true }).selectOption('2024-02');
  await expect(page.getByLabel('From date', { exact: true })).toHaveValue(
    '2024-02-01',
  );
  await expect(page.getByLabel('Through date', { exact: true })).toHaveValue(
    '2024-02-29',
  );
  await expect(page.getByLabel('Filtered totals')).toContainText('1.53 USD');
  await page.getByRole('button', { name: 'Filter month 2024-02' }).click();
  await expect(page.getByLabel('From date', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Through date', { exact: true })).toHaveValue(
    '',
  );
  await expect(page.getByLabel('Filtered totals')).toContainText('100.48 USD');
});

test('invalid ranges hide reports, recover locally, and imports clear the date scope', async ({
  page,
}) => {
  await page.goto('./');
  const file = {
    name: 'dates.journal',
    mimeType: 'text/plain',
    buffer: Buffer.from(journal),
  };
  await page.getByLabel('Import journal files').setInputFiles(file);
  await expect(page.getByRole('table')).toHaveAttribute('aria-rowcount', '3');
  await page.getByLabel('From date', { exact: true }).fill('2024-03-02');
  await page.getByLabel('Through date', { exact: true }).fill('2024-03-01');
  await expect(page.getByRole('alert')).toContainText(
    'From date must be on or before Through date',
  );
  await expect(page.getByLabel('From date', { exact: true })).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await expect(page.getByRole('table')).toHaveCount(0);
  await expect(page.getByLabel('Filtered totals')).toHaveCount(0);
  await page.getByLabel('Through date', { exact: true }).fill('2024-03-03');
  await expect(page.getByRole('table')).toHaveAttribute('aria-rowcount', '1');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: 'Clear dates', exact: true }).click();
  await expect(page.getByRole('table')).toHaveAttribute('aria-rowcount', '3');
  await page.getByLabel('Month', { exact: true }).selectOption('2024-02');
  await page.getByLabel('From date', { exact: true }).fill('2024-02-02');
  await expect(page.getByLabel('Month', { exact: true })).toHaveValue('');
  await expect(page.getByRole('table')).toHaveAttribute('aria-rowcount', '2');
  await page.getByLabel('Import journal files').setInputFiles(file);
  await expect(page.getByLabel('From date', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Through date', { exact: true })).toHaveValue(
    '',
  );
  await expect(page.getByRole('table')).toHaveAttribute('aria-rowcount', '3');
  await page.getByLabel('Import journal files').setInputFiles({
    name: 'invalid-utf8.journal',
    mimeType: 'text/plain',
    buffer: Buffer.from([0xff]),
  });
  await expect(page.getByRole('alert')).toBeVisible();
  const importError = await page.getByRole('alert').textContent();
  await page.getByLabel('From date', { exact: true }).fill('2024-02-02');
  await expect(page.getByRole('table')).toHaveAttribute('aria-rowcount', '2');
  await expect(page.getByRole('alert')).toHaveText(importError!);
});

test('date range controls remain labelled and within a narrow viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await page.getByLabel('Import journal files').setInputFiles({
    name: 'mobile.journal',
    mimeType: 'text/plain',
    buffer: Buffer.from(journal),
  });
  for (const name of ['From date', 'Through date']) {
    const input = page.getByLabel(name, { exact: true });
    await expect(input).toBeVisible();
    const box = await input.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  }
  await page.getByLabel('From date', { exact: true }).fill('2024-02-02');
  await page.getByLabel('Through date', { exact: true }).fill('2024-02-02');
  await expect(page.getByRole('table')).toHaveAttribute('aria-rowcount', '2');
  await expect(page.getByLabel('Filtered totals')).toContainText('4.25 USD');
});

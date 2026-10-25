import { writeFile } from 'node:fs/promises';
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

test('monthly file bundle preserves exact totals, comment context and source drill-down', async ({
  page,
}) => {
  const files = Array.from({ length: 12 }, (_, index) => {
    const month = String(index + 1).padStart(2, '0');
    const prefix =
      '; synthetic monthly export\ncomment\ninclude not-a-real-file.journal\nend comment\n\n';
    const salary = `2026-${month}-01 Salary month ${month}\n  assets:bank  3000.00 USD\n  income:salary\n\n`;
    const purchases = Array.from({ length: 1999 }, (_, item) => {
      const number = item + 1;
      const quantity = number % 2 ? '10.01' : '-1.23';
      return `2026-${month}-02 month ${month} item ${number} ; synthetic:yes\n  expenses:food  ${quantity} USD ; café 🍵\n  assets:bank\n\n`;
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

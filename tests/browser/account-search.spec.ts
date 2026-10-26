import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
async function openAccounts(page: Page) {
  await page.goto('./');
  const buffer = await readFile(
    new URL(
      '../../packages/core/fixtures/compatibility/account-hierarchy.journal',
      import.meta.url,
    ),
  );
  await page
    .getByLabel('Import journal files')
    .setInputFiles({ name: 'search.journal', mimeType: 'text/plain', buffer });
  await expect(page.getByRole('table')).toContainText('Food');
  await page.getByRole('button', { name: /Accounts/ }).click();
  await expect(
    page.getByRole('button', { name: 'assets:bank 13.00 USD', exact: true }),
  ).toBeVisible();
  return buffer;
}

test('account search reveals folded matches and full-balance ancestor context independently from register filters', async ({
  page,
}) => {
  await openAccounts(page);
  await page
    .getByRole('button', { name: 'Collapse assets:bank', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Expand assets:bank', exact: true }),
  ).toBeVisible();
  await page.getByLabel('Search transactions').fill('Food');
  await expect(page.getByRole('table')).toHaveAttribute('aria-rowcount', '2');
  await page.getByLabel('Search accounts', { exact: true }).fill('CHECKING');
  await expect(
    page.getByRole('status', { name: 'Account search results' }),
  ).toHaveText('1 matching account · 2 ancestor rows');
  const bank = page.getByRole('button', {
    name: 'assets:bank · ancestor 13.00 USD',
    exact: true,
  });
  await expect(bank).toBeVisible();
  await expect(bank).toHaveAttribute('title', /direct postings: 8.00 USD/);
  await expect(
    page.getByRole('button', { name: 'Collapse assets:bank', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'Collapse all accounts', exact: true }),
  ).toBeDisabled();
  await expect(page.getByLabel('Search transactions')).toHaveValue('Food');
  await expect(page.getByRole('table')).toHaveAttribute('aria-rowcount', '2');
  await page
    .getByRole('button', { name: 'assets:bank:checking 2.00 USD', exact: true })
    .click();
  await expect(page.getByRole('table')).toHaveAttribute('aria-rowcount', '1');
  await expect(page.getByLabel('Search accounts', { exact: true })).toHaveValue(
    'CHECKING',
  );
  await page
    .getByRole('button', { name: 'Clear account filter', exact: true })
    .click();
  await expect(page.getByRole('table')).toHaveAttribute('aria-rowcount', '2');
  await page.getByLabel('Include subaccounts', { exact: true }).uncheck();
  await expect(
    page.getByRole('status', { name: 'Account search results' }),
  ).toHaveText('1 matching account · 0 ancestor rows');
  await expect(bank).toHaveCount(0);
  await expect(
    page.getByRole('button', {
      name: 'assets:bank:checking 2.00 USD',
      exact: true,
    }),
  ).toBeVisible();
  await page.getByLabel('Include subaccounts', { exact: true }).check();
  await expect(bank).toBeVisible();
  await page
    .getByLabel('Search accounts', { exact: true })
    .fill('nothing matches');
  await expect(
    page.getByText('No accounts match this search.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('table')).toHaveAttribute('aria-rowcount', '2');
  await page
    .getByRole('button', { name: 'Clear account search', exact: true })
    .focus();
  await page
    .getByRole('button', { name: 'Clear account search', exact: true })
    .press('Enter');
  await expect(
    page.getByLabel('Search accounts', { exact: true }),
  ).toBeFocused();
  await expect(
    page.getByRole('button', { name: 'Expand assets:bank', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', {
      name: 'assets:bank:checking 2.00 USD',
      exact: true,
    }),
  ).toHaveCount(0);
});

test('large account searches stay windowed, ignore stale replies, and browse through the final match', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const state = window as typeof window & {
      accountWorker?: Worker;
      oldView?: unknown;
      oldRows?: unknown;
      maxRows: number;
    };
    state.maxRows = 0;
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        state.accountWorker = this;
        this.addEventListener('message', ({ data }) => {
          if (data.type === 'account-view' && !state.oldView)
            state.oldView = data;
          if (data.type === 'account-rows') {
            state.maxRows = Math.max(state.maxRows, data.window.rows.length);
            if (data.window.rows.length && !state.oldRows) state.oldRows = data;
          }
        });
      }
    };
  });
  await page.goto('./');
  const text = Array.from(
    { length: 5000 },
    (_, index) =>
      `2026-01-01 Item ${index}\n  expenses:${index % 2 ? 'travel' : 'groceries'}:item${String(index).padStart(5, '0')}  0.01 USD\n  assets:cash\n`,
  ).join('\n');
  await page.getByLabel('Import journal files').setInputFiles({
    name: 'large-search.journal',
    mimeType: 'text/plain',
    buffer: Buffer.from(text),
  });
  await expect(page.getByLabel('Filtered totals')).toContainText('50.00 USD');
  await page.getByRole('button', { name: /Accounts/ }).click();
  await expect(
    page.getByRole('button', { name: 'expenses 50.00 USD', exact: true }),
  ).toBeVisible();
  await page.getByLabel('Search accounts', { exact: true }).fill('travel');
  const start = Date.now();
  await page.getByLabel('Search accounts', { exact: true }).fill('GroCeRiEs');
  expect(Date.now() - start).toBeLessThan(1000);
  await expect(
    page.getByRole('status', { name: 'Account search results' }),
  ).toHaveText('2501 matching accounts · 1 ancestor row');
  const maxRows = await page.evaluate(() => {
    const state = window as typeof window & {
      accountWorker: Worker;
      oldView: unknown;
      oldRows: unknown;
      maxRows: number;
    };
    for (const data of [state.oldView, state.oldRows])
      state.accountWorker.onmessage?.call(
        state.accountWorker,
        new MessageEvent('message', { data }),
      );
    return state.maxRows;
  });
  expect(maxRows).toBeGreaterThan(0);
  expect(maxRows).toBeLessThanOrEqual(200);
  await expect(
    page.getByRole('status', { name: 'Account search results' }),
  ).toHaveText('2501 matching accounts · 1 ancestor row');
  await page
    .getByRole('list', { name: 'Account balances', exact: true })
    .evaluate((node) => {
      node.scrollTop = node.scrollHeight;
    });
  await expect(
    page.getByRole('button', {
      name: 'expenses:groceries:item04998 0.01 USD',
      exact: true,
    }),
  ).toBeVisible();
  expect(await page.locator('.account-row').count()).toBeLessThan(50);
  await expect(page.getByRole('table')).toHaveAttribute(
    'aria-rowcount',
    '5001',
  );
  await page.getByRole('button', { name: /Overview/ }).click();
  await expect(page.getByLabel('Filtered totals')).toContainText('50.00 USD');
  await page.getByRole('button', { name: /Accounts/ }).click();
  await expect(page.getByLabel('Search accounts', { exact: true })).toHaveValue(
    'GroCeRiEs',
  );
});

test('failed reads retain search, successful same-name imports reset it, and offline refresh persists no account query', async ({
  page,
  context,
}) => {
  const buffer = await openAccounts(page);
  const url = page.url();
  await page.getByLabel('Search accounts', { exact: true }).fill('checking');
  await expect(
    page.getByRole('status', { name: 'Account search results' }),
  ).toHaveText('1 matching account · 2 ancestor rows');
  await page.getByLabel('Import journal files').setInputFiles({
    name: 'invalid.journal',
    mimeType: 'text/plain',
    buffer: Buffer.from([0xff]),
  });
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByLabel('Search accounts', { exact: true })).toHaveValue(
    'checking',
  );
  await expect(
    page.getByRole('button', {
      name: 'assets:bank:checking 2.00 USD',
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByLabel('Import journal files')
    .setInputFiles({ name: 'search.journal', mimeType: 'text/plain', buffer });
  await expect(page.getByLabel('Search accounts', { exact: true })).toHaveValue(
    '',
  );
  await expect(
    page.getByRole('button', { name: 'Collapse assets:bank', exact: true }),
  ).toBeVisible();
  await page
    .getByLabel('Search accounts', { exact: true })
    .fill('private-account-query-853');
  await expect(
    page.getByText('No accounts match this search.', { exact: true }),
  ).toBeVisible();
  expect(page.url()).toBe(url);
  const stored = await page.evaluate(async () => ({
    local: localStorage.length,
    session: sessionStorage.length,
    databases: await indexedDB.databases(),
  }));
  expect(stored).toEqual({ local: 0, session: 0, databases: [] });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Meet your journal’s better half.' }),
  ).toBeVisible();
  await page
    .getByLabel('Import journal files')
    .setInputFiles({ name: 'search.journal', mimeType: 'text/plain', buffer });
  await page.getByRole('button', { name: /Accounts/ }).click();
  await expect(page.getByLabel('Search accounts', { exact: true })).toHaveValue(
    '',
  );
  await expect(
    page.getByRole('button', { name: 'assets:bank 13.00 USD', exact: true }),
  ).toBeVisible();
});

test('narrow account search supports Unicode matching and keyboard clearing with exact mixed balances', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto('./');
  const account = 'assets:household:Épargne.current';
  await page.getByLabel('Import journal files').setInputFiles({
    name: 'unicode.journal',
    mimeType: 'text/plain',
    buffer: Buffer.from(
      `2026-01-01 Synthetic\n  ${account}:eur  0.10 EUR\n  equity:eur\n\n2026-01-02 Synthetic\n  ${account}:usd  0.20 USD\n  equity:usd`,
    ),
  });
  await page.getByRole('button', { name: /Accounts/ }).click();
  await page
    .getByLabel('Search accounts', { exact: true })
    .fill('épargne.current');
  await expect(
    page.getByRole('status', { name: 'Account search results' }),
  ).toHaveText('3 matching accounts · 2 ancestor rows');
  await expect(
    page.getByRole('button', {
      name: `${account} 0.10 EUR · 0.20 USD`,
      exact: true,
    }),
  ).toBeVisible();
  const bounds = await page
    .locator(
      '.account-search-controls,.account-search-controls input,.account-search-controls button,.account-row',
    )
    .evaluateAll((nodes) =>
      nodes.map((node) => ({
        left: node.getBoundingClientRect().left,
        right: node.getBoundingClientRect().right,
        width: window.innerWidth,
      })),
    );
  expect(
    bounds.every(({ left, right, width }) => left >= 0 && right <= width),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('narrow-account-search.png'),
  });
  await page
    .getByRole('button', { name: 'Clear account search', exact: true })
    .focus();
  await page
    .getByRole('button', { name: 'Clear account search', exact: true })
    .press('Enter');
  await expect(
    page.getByLabel('Search accounts', { exact: true }),
  ).toBeFocused();
});

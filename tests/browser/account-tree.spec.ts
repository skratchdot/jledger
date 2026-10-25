import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
async function fixture(page: Page) {
  await page.goto('./');
  const buffer = await readFile(
    new URL(
      '../../packages/core/fixtures/compatibility/account-hierarchy.journal',
      import.meta.url,
    ),
  );
  await page
    .getByLabel('Import journal files')
    .setInputFiles({ name: 'tree.journal', mimeType: 'text/plain', buffer });
  await expect(page.getByRole('table')).toContainText('Food');
  await page.getByRole('button', { name: /Accounts/ }).click();
  await expect(
    page.getByRole('button', { name: 'assets:bank 13.00 USD', exact: true }),
  ).toBeVisible();
  return buffer;
}

test('account disclosures preserve balances, child folds, query scope and keyboard focus', async ({
  page,
}) => {
  await fixture(page);
  await page.getByLabel('Search transactions').fill('Food');
  await expect(page.getByRole('table')).toHaveAttribute('aria-rowcount', '2');
  await page
    .getByRole('button', { name: 'Collapse assets:bank', exact: true })
    .focus();
  await page
    .getByRole('button', { name: 'Collapse assets:bank', exact: true })
    .press('Enter');
  const bank = page.getByRole('button', {
    name: 'Expand assets:bank',
    exact: true,
  });
  await expect(bank).toHaveAttribute('aria-expanded', 'false');
  await expect(bank).toBeFocused();
  await expect(
    page.getByRole('button', {
      name: 'assets:bank:checking 2.00 USD',
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'assets:banking 7.00 USD', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'assets:bank 13.00 USD', exact: true }),
  ).toHaveAttribute('title', /direct postings: 8.00 USD/);
  await expect(page.getByLabel('Search transactions')).toHaveValue('Food');
  await expect(page.getByRole('table')).toHaveAttribute('aria-rowcount', '2');
  await page
    .getByRole('button', { name: 'Collapse assets', exact: true })
    .click();
  await expect(bank).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Expand assets', exact: true })
    .click();
  await expect(bank).toBeVisible();
  await expect(
    page.getByRole('button', {
      name: 'assets:bank:checking 2.00 USD',
      exact: true,
    }),
  ).toHaveCount(0);
  await page.getByLabel('Include subaccounts', { exact: true }).uncheck();
  await expect(
    page.getByRole('button', { name: 'assets:bank 8.00 USD', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', {
      name: 'assets:bank:checking 2.00 USD',
      exact: true,
    }),
  ).toBeVisible();
  await page.getByLabel('Include subaccounts', { exact: true }).check();
  await expect(bank).toBeVisible();
  await page
    .getByRole('button', { name: 'Clear filters', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'assets:bank 13.00 USD', exact: true })
    .click();
  await expect(page.getByRole('table')).toHaveAttribute('aria-rowcount', '5');
  await expect(page.getByRole('table')).not.toContainText('Separate prefix');
  await expect(bank).toBeVisible();
  await page
    .getByRole('button', { name: 'Expand all accounts', exact: true })
    .click();
  await expect(
    page.getByRole('button', {
      name: 'assets:bank:checking 2.00 USD',
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Collapse all accounts', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'assets 20.00 USD', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'assets:bank 13.00 USD', exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole('table')).toHaveAttribute('aria-rowcount', '5');
});

test('large branches use bounded worker windows and reject stale responses after replacement', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const state = window as typeof window & {
      accountWorker?: Worker;
      accountOldRows?: unknown;
      accountOldView?: unknown;
      accountMaxRows: number;
      accountLeakedArrays: boolean;
    };
    state.accountMaxRows = 0;
    state.accountLeakedArrays = false;
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        state.accountWorker = this;
        this.addEventListener('message', ({ data }) => {
          if (data.type === 'loaded')
            state.accountLeakedArrays ||=
              'accounts' in data.summary || 'accountRollups' in data.summary;
          if (data.type === 'account-rows') {
            state.accountMaxRows = Math.max(
              state.accountMaxRows,
              data.window.rows.length,
            );
            if (data.window.rows.length && !state.accountOldRows)
              state.accountOldRows = data;
          }
          if (data.type === 'account-view' && !state.accountOldView)
            state.accountOldView = data;
        });
      }
    };
  });
  await page.goto('./');
  const text = Array.from(
    { length: 5000 },
    (_, index) =>
      `2026-01-01 Synthetic ${index}\n  expenses:group${String(index).padStart(5, '0')}:leaf  0.01 USD\n  assets:cash\n`,
  ).join('\n');
  await page.getByLabel('Import journal files').setInputFiles({
    name: 'many.journal',
    mimeType: 'text/plain',
    buffer: Buffer.from(text),
  });
  await page.getByRole('button', { name: /Accounts/ }).click();
  await expect(
    page.getByRole('button', { name: 'expenses 50.00 USD', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Collapse all accounts', exact: true })
    .click();
  await expect(
    page.getByText('2 of 10003 account rows shown', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Expand expenses', exact: true })
    .click();
  await expect(
    page.getByText('5002 of 10003 account rows shown', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Expand all accounts', exact: true })
    .click();
  await expect(
    page.getByText('10003 of 10003 account rows shown', { exact: true }),
  ).toBeVisible();
  const accounts = page.getByRole('list', {
    name: 'Account balances',
    exact: true,
  });
  await accounts.evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  await expect(
    page.getByRole('button', {
      name: 'expenses:group04999:leaf 0.01 USD',
      exact: true,
    }),
  ).toBeVisible();
  expect(await page.locator('.account-row').count()).toBeLessThan(50);
  await page.getByLabel('Import journal files').setInputFiles({
    name: 'new.journal',
    mimeType: 'text/plain',
    buffer: Buffer.from(
      '2026-01-01 Replacement\n  assets:cash  9 USD\n  equity:opening',
    ),
  });
  await expect(
    page.getByRole('button', { name: 'assets:cash 9.00 USD', exact: true }),
  ).toBeVisible();
  const observed = await page.evaluate(() => {
    const state = window as typeof window & {
      accountWorker: Worker;
      accountOldRows: unknown;
      accountOldView: unknown;
      accountMaxRows: number;
      accountLeakedArrays: boolean;
    };
    for (const data of [state.accountOldView, state.accountOldRows])
      state.accountWorker.onmessage?.call(
        state.accountWorker,
        new MessageEvent('message', { data }),
      );
    return {
      maxRows: state.accountMaxRows,
      leakedArrays: state.accountLeakedArrays,
    };
  });
  expect(observed.maxRows).toBeGreaterThan(0);
  expect(observed.maxRows).toBeLessThanOrEqual(200);
  expect(observed.leakedArrays).toBe(false);
  await expect(
    page.getByRole('button', { name: 'assets:cash 9.00 USD', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'assets:cash -50.00 USD', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText('4 of 4 account rows shown', { exact: true }),
  ).toBeVisible();
});

test('failed imports retain a usable folded hierarchy and successful same-name imports reset it', async ({
  page,
}) => {
  const buffer = await fixture(page);
  await page
    .getByRole('button', { name: 'Collapse assets:bank', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Expand assets:bank', exact: true }),
  ).toBeVisible();
  await page.getByLabel('Import journal files').setInputFiles({
    name: 'invalid.journal',
    mimeType: 'text/plain',
    buffer: Buffer.from([0xff]),
  });
  await expect(page.getByRole('alert')).toBeVisible();
  await page
    .getByRole('button', { name: 'Expand assets:bank', exact: true })
    .click();
  await expect(
    page.getByRole('button', {
      name: 'assets:bank:checking 2.00 USD',
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Collapse assets:bank', exact: true })
    .click();
  await page.getByLabel('Import journal files').setInputFiles({
    name: 'deep.journal',
    mimeType: 'text/plain',
    buffer: Buffer.from(
      `2026-01-01 New\n  ${Array(65).fill('deep').join(':')}  999 USD\n  equity`,
    ),
  });
  await expect(page.getByRole('alert')).toContainText(
    'Account hierarchy supports at most 64',
  );
  await expect(
    page.getByRole('button', { name: 'Expand assets:bank', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Expand assets:bank', exact: true })
    .click();
  await expect(
    page.getByRole('button', {
      name: 'assets:bank:checking 2.00 USD',
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Collapse assets:bank', exact: true })
    .click();
  await page
    .getByLabel('Import journal files')
    .setInputFiles({ name: 'tree.journal', mimeType: 'text/plain', buffer });
  await expect(
    page.getByRole('button', { name: 'Collapse assets:bank', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', {
      name: 'assets:bank:checking 2.00 USD',
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('narrow account disclosures retain separate commodities and usable native controls', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto('./');
  const account = 'assets:household:unexpectedly-long-account-name';
  await page.getByLabel('Import journal files').setInputFiles({
    name: 'mixed.journal',
    mimeType: 'text/plain',
    buffer: Buffer.from(
      `2026-01-01 Synthetic\n  ${account}:eur  0.10 EUR\n  equity:eur\n\n2026-01-02 Synthetic\n  ${account}:usd  0.20 USD\n  equity:usd`,
    ),
  });
  await page.getByRole('button', { name: /Accounts/ }).click();
  await expect(
    page.getByRole('button', {
      name: `${account} 0.10 EUR · 0.20 USD`,
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: `Collapse ${account}`, exact: true })
    .focus();
  await page
    .getByRole('button', { name: `Collapse ${account}`, exact: true })
    .press('Enter');
  await expect(
    page.getByRole('button', { name: `Expand ${account}`, exact: true }),
  ).toBeFocused();
  await expect(
    page.getByRole('button', {
      name: `${account} 0.10 EUR · 0.20 USD`,
      exact: true,
    }),
  ).toBeVisible();
  const bounds = await page
    .locator(
      '.account-row,.account-select,.account-expand,.account-tree-controls button',
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
    path: testInfo.outputPath('narrow-account-tree.png'),
  });
});

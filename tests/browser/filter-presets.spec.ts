import { expect, test, type Page } from '@playwright/test';

const journal =
  '2024-02-29 ! Coffee\n  expenses:coffee  0.10 USD\n  assets:cash\n\n2024-03-01 ! Coffee refund\n  expenses:coffee  -0.03 USD\n  assets:cash\n\n2024-02-29 * Coffee settled\n  expenses:coffee  10 USD\n  assets:cash\n\n2024-02-29 ! Euro coffee\n  expenses:coffee  1.25 EUR\n  assets:cash\n\n2024-02-29 ! Tea\n  expenses:tea  0.20 USD\n  assets:cash\n\n2024-02-29 Coffee unmarked\n  expenses:coffee  0.30 USD\n  assets:cash\n\n2024-04-01 ! Outside coffee\n  expenses:coffee  100 USD\n  assets:cash';
const file = {
  name: 'presets.journal',
  mimeType: 'text/plain',
  buffer: Buffer.from(journal),
};
async function openJournal(page: Page) {
  await page.goto('./');
  await page.getByLabel('Import journal files').setInputFiles(file);
  await expect(page.getByRole('table')).toContainText('Euro coffee');
  await page.getByLabel('Commodity', { exact: true }).selectOption('USD');
  await expect(page.getByLabel('Filtered totals')).toContainText('110.57 USD');
}
async function openPresets(page: Page) {
  await page.locator('.saved-filters > summary').click();
  await expect(page.getByLabel('Filter name', { exact: true })).toBeVisible();
}
async function save(page: Page, name: string) {
  await page.getByLabel('Filter name', { exact: true }).fill(name);
  await page
    .getByRole('button', { name: 'Save current filters', exact: true })
    .click();
  await expect(
    page.getByRole('button', {
      name: `Apply saved filter ${name.trim()}`,
      exact: true,
    }),
  ).toBeVisible();
}

test('saved scopes restore every field, remain independent of edits, and chips clear only their scope', async ({
  page,
}) => {
  await openJournal(page);
  await page.getByLabel('Search transactions').fill('coffee');
  await page.getByLabel('Status', { exact: true }).selectOption('!');
  await page.getByLabel('From date', { exact: true }).fill('2024-02-29');
  await page.getByLabel('Through date', { exact: true }).fill('2024-03-01');
  await page
    .getByRole('button', { name: 'Filter expenses:coffee', exact: true })
    .click();
  await expect(page.getByLabel('Filtered totals')).toContainText('0.07 USD');
  await expect(page.getByRole('table')).toHaveAttribute('aria-rowcount', '3');
  await openPresets(page);
  await save(page, 'Coffee refunds');
  const preset = page.getByRole('button', {
    name: 'Apply saved filter Coffee refunds',
    exact: true,
  });
  await expect(preset).toHaveAttribute('aria-pressed', 'true');
  await page
    .getByRole('button', { name: 'Clear filters', exact: true })
    .click();
  await page.getByLabel('Commodity', { exact: true }).selectOption('EUR');
  await page.getByLabel('Month', { exact: true }).selectOption('2024-04');
  await expect(preset).toHaveAttribute('aria-pressed', 'false');
  await expect(preset).toBeEnabled();
  await preset.focus();
  await preset.press('Enter');
  await expect(page.getByLabel('Search transactions')).toHaveValue('coffee');
  await expect(page.getByLabel('Commodity', { exact: true })).toHaveValue(
    'USD',
  );
  await expect(page.getByLabel('Status', { exact: true })).toHaveValue('!');
  await expect(page.getByLabel('Month', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('From date', { exact: true })).toHaveValue(
    '2024-02-29',
  );
  await expect(page.getByLabel('Through date', { exact: true })).toHaveValue(
    '2024-03-01',
  );
  const chips = page.getByRole('list', { name: 'Active filters' });
  await expect(chips).toContainText('Commodity: USD');
  await expect(chips).toContainText(
    'Account: expenses:coffee (and subaccounts)',
  );
  await expect(chips).toContainText('Dates: 2024-02-29 through 2024-03-01');
  await expect(chips).toContainText('Status: Pending');
  await expect(page.getByLabel('Filtered totals')).toContainText('0.07 USD');
  await page
    .getByRole('button', { name: 'Clear search filter', exact: true })
    .focus();
  await page
    .getByRole('button', { name: 'Clear search filter', exact: true })
    .press('Enter');
  await expect(page.getByLabel('Search transactions')).toBeFocused();
  await expect(page.getByLabel('Search transactions')).toHaveValue('');
  await expect(chips).toContainText('Account: expenses:coffee');
  await page
    .getByRole('button', { name: 'Clear account filter', exact: true })
    .click();
  await expect(page.getByLabel('Filtered totals')).toContainText('0.27 USD');
  await expect(page.getByLabel('Status', { exact: true })).toHaveValue('!');
  await page
    .getByRole('button', { name: 'Clear date filter', exact: true })
    .click();
  await expect(page.getByLabel('From date', { exact: true })).toBeFocused();
  await expect(page.getByLabel('From date', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Through date', { exact: true })).toHaveValue(
    '',
  );
  await expect(page.getByLabel('Filtered totals')).toContainText('100.27 USD');
  await page
    .getByRole('button', { name: 'Clear status filter', exact: true })
    .click();
  await expect(page.getByLabel('Status', { exact: true })).toBeFocused();
  await expect(page.getByLabel('Commodity', { exact: true })).toHaveValue(
    'USD',
  );
  await expect(page.getByLabel('Filtered totals')).toContainText('110.57 USD');
  await preset.click();
  await expect(page.getByRole('table')).toHaveAttribute('aria-rowcount', '3');
  await expect(page.getByLabel('Filtered totals')).toContainText('0.07 USD');
});

test('month presets recover an invalid range and duplicate names cannot overwrite them', async ({
  page,
}) => {
  await openJournal(page);
  await page.getByLabel('Month', { exact: true }).selectOption('2024-02');
  await openPresets(page);
  await save(page, '  February  ');
  await page.getByLabel('Filter name', { exact: true }).fill('february');
  await page
    .getByRole('button', { name: 'Save current filters', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText('already saved');
  await expect(
    page.getByText('Saved filters (1)', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Clear date filter', exact: true })
    .click();
  await expect(page.getByLabel('Month', { exact: true })).toHaveValue('');
  await page.getByLabel('Filter name', { exact: true }).fill('Invalid');
  await page.getByLabel('From date', { exact: true }).fill('2024-03-02');
  await page.getByLabel('Through date', { exact: true }).fill('2024-03-01');
  await expect(
    page.getByRole('button', { name: 'Save current filters', exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole('table')).toHaveCount(0);
  const preset = page.getByRole('button', {
    name: 'Apply saved filter February',
    exact: true,
  });
  await expect(preset).toBeEnabled();
  await preset.click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByLabel('Month', { exact: true })).toHaveValue(
    '2024-02',
  );
  await expect(page.getByLabel('From date', { exact: true })).toHaveValue(
    '2024-02-01',
  );
  await expect(page.getByLabel('Through date', { exact: true })).toHaveValue(
    '2024-02-29',
  );
  await expect(page.getByLabel('Filtered totals')).toContainText('10.60 USD');
});

test('presets survive a failed read, clear for same-name replacements and closing, and stay out of persistent storage', async ({
  page,
  context,
}) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await openJournal(page);
  await openPresets(page);
  await save(page, 'private-view-742');
  const url = page.url();
  await page.getByLabel('Import journal files').setInputFiles({
    name: 'invalid.journal',
    mimeType: 'text/plain',
    buffer: Buffer.from([0xff]),
  });
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(
    page.getByRole('button', {
      name: 'Apply saved filter private-view-742',
      exact: true,
    }),
  ).toBeEnabled();
  await page.getByLabel('Import journal files').setInputFiles(file);
  await expect(
    page.getByText('Saved filters (0)', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', {
      name: 'Apply saved filter private-view-742',
      exact: true,
    }),
  ).toHaveCount(0);
  await openPresets(page);
  await save(page, 'private-view-742');
  await page
    .getByRole('button', { name: 'Close journals', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Meet your journal’s better half.' }),
  ).toBeVisible();
  await page.getByLabel('Import journal files').setInputFiles(file);
  await expect(
    page.getByText('Saved filters (0)', { exact: true }),
  ).toBeVisible();
  await openPresets(page);
  await save(page, 'private-view-742');
  await page.evaluate(() => navigator.serviceWorker.ready);
  const stored = await page.evaluate(async () => {
    const cached = await Promise.all(
      (await caches.keys()).map(async (key) => {
        const cache = await caches.open(key);
        return Promise.all(
          (await cache.keys()).map(async (request) => ({
            url: request.url,
            body: await (await cache.match(request))!.text(),
          })),
        );
      }),
    );
    return {
      local: localStorage.length,
      session: sessionStorage.length,
      databases: await indexedDB.databases(),
      cacheContainsPreset: cached
        .flat()
        .some((entry) => (entry.url + entry.body).includes('private-view-742')),
    };
  });
  expect(stored).toEqual({
    local: 0,
    session: 0,
    databases: [],
    cacheContainsPreset: false,
  });
  expect(page.url()).toBe(url);
  expect(
    requests.every(
      (request) =>
        new URL(request).hostname === '127.0.0.1' &&
        !request.includes('private-view-742'),
    ),
  ).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Meet your journal’s better half.' }),
  ).toBeVisible();
  await page.getByLabel('Import journal files').setInputFiles(file);
  await expect(
    page.getByText('Saved filters (0)', { exact: true }),
  ).toBeVisible();
});

test('saved filters are bounded, support keyboard saving/removal, and fit a narrow viewport', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await openJournal(page);
  await page.locator('.saved-filters > summary').focus();
  await page.locator('.saved-filters > summary').press('Enter');
  await page.getByLabel('Filter name', { exact: true }).fill('   ');
  await page
    .getByRole('button', { name: 'Save current filters', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText('Enter a name');
  await expect(page.getByLabel('Filter name', { exact: true })).toHaveAttribute(
    'maxlength',
    '80',
  );
  for (let index = 0; index < 20; index++) await save(page, `View ${index}`);
  await expect(
    page.getByRole('button', { name: 'Save current filters', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole('list', { name: 'Saved filter presets' }).locator('li'),
  ).toHaveCount(20);
  await page
    .getByRole('button', { name: 'Remove saved filter View 0', exact: true })
    .focus();
  await page
    .getByRole('button', { name: 'Remove saved filter View 0', exact: true })
    .press('Enter');
  await expect(page.getByLabel('Filter name', { exact: true })).toBeFocused();
  const longName = 'x'.repeat(80);
  await page.getByLabel('Filter name', { exact: true }).fill(longName);
  await page.getByLabel('Filter name', { exact: true }).press('Enter');
  await expect(
    page.getByRole('button', {
      name: `Apply saved filter ${longName}`,
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByLabel('Search transactions')
    .fill('long private search '.repeat(20));
  const bounds = await page
    .locator(
      '.filter-chips, .saved-filters, .saved-filter-list li, .save-filter-form input, .save-filter-form button',
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
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('narrow-presets.png') });
});

test('a successful local file reload clears saved filters', async ({
  page,
}) => {
  test.skip(
    Boolean(
      process.env.JLEDGER_TEST_BASE_PATH &&
      process.env.JLEDGER_TEST_BASE_PATH !== '/',
    ),
    'Local server only',
  );
  await page.goto('./?local=1');
  await expect(page.getByRole('table')).toContainText('Northwind');
  await openPresets(page);
  await save(page, 'Local view');
  await page.getByRole('button', { name: 'Reload files' }).click();
  await expect(
    page.getByText('Saved filters (0)', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', {
      name: 'Apply saved filter Local view',
      exact: true,
    }),
  ).toHaveCount(0);
});

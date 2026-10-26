import { expect, test, type Page } from '@playwright/test';
const text =
  '2024-02-29 ! Coffee old\n  expenses:coffee  0.10 USD\n  assets:cash\n\n2024-03-01 ! Coffee new\n  expenses:coffee  0.20 USD\n  assets:cash\n\n2024-03-02 Tea\n  expenses:tea  0.30 EUR\n  assets:cash\n\n2024-03-03 Salary\n  income:salary  -1000 USD\n  assets:cash\n';
const file = {
  name: 'history.journal',
  mimeType: 'text/plain',
  buffer: Buffer.from(text),
};
const undo = (page: Page) =>
  page.getByRole('button', { name: 'Undo filter change', exact: true });
const redo = (page: Page) =>
  page.getByRole('button', { name: 'Redo filter change', exact: true });
async function open(page: Page) {
  await page.goto('./');
  await page.getByLabel('Import journal files').setInputFiles(file);
  await expect(page.getByLabel('Filtered totals')).toContainText('0.30 EUR');
  await expect(undo(page)).toBeDisabled();
  await expect(redo(page)).toBeDisabled();
}

test('filter undo/redo restores complete month and preset scopes with keyboard controls', async ({
  page,
}) => {
  await open(page);
  await page.getByLabel('Commodity', { exact: true }).selectOption('USD');
  await page.getByLabel('Month', { exact: true }).selectOption('2024-03');
  await expect(
    page.getByRole('region', { name: 'Previous month comparison' }),
  ).toContainText('0.10 USD');
  await undo(page).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Month', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('From date', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Through date', { exact: true })).toHaveValue(
    '',
  );
  await expect(page.getByLabel('Commodity', { exact: true })).toHaveValue(
    'USD',
  );
  await expect(
    page.getByRole('region', { name: 'Previous month comparison' }),
  ).toHaveCount(0);
  await expect(undo(page)).toBeFocused();
  await redo(page).focus();
  await page.keyboard.press('Space');
  await expect(page.getByLabel('Month', { exact: true })).toHaveValue(
    '2024-03',
  );
  await expect(page.getByLabel('From date', { exact: true })).toHaveValue(
    '2024-03-01',
  );
  await expect(page.getByLabel('Through date', { exact: true })).toHaveValue(
    '2024-03-31',
  );
  await expect(redo(page)).toBeDisabled();
  await expect(redo(page)).toBeFocused();
  await page
    .getByLabel('Search transactions')
    .pressSequentially('Coffee', { delay: 20 });
  await expect(page.getByLabel('Filtered totals')).toContainText('0.20 USD');
  await undo(page).click();
  await expect(page.getByLabel('Search transactions')).toHaveValue('');
  await expect(page.getByLabel('Month', { exact: true })).toHaveValue(
    '2024-03',
  );
  await redo(page).click();
  await expect(page.getByLabel('Search transactions')).toHaveValue('Coffee');
  await page.getByLabel('Status', { exact: true }).selectOption('!');
  await page
    .getByRole('button', { name: 'Filter expenses:coffee', exact: true })
    .click();
  await page.locator('.saved-filters > summary').click();
  await page.getByLabel('Filter name', { exact: true }).fill('Coffee March');
  await page
    .getByRole('button', { name: 'Save current filters', exact: true })
    .click();
  await page.getByLabel('Commodity', { exact: true }).selectOption('EUR');
  await page
    .getByRole('button', { name: 'Clear filters', exact: true })
    .click();
  await expect(page.getByLabel('Filtered totals')).toContainText('0.30 EUR');
  await page
    .getByRole('button', {
      name: 'Apply saved filter Coffee March',
      exact: true,
    })
    .click();
  await expect(page.getByLabel('Filtered totals')).toContainText('0.20 USD');
  await undo(page).click();
  await expect(page.getByLabel('Search transactions')).toHaveValue('');
  await expect(page.getByLabel('Commodity', { exact: true })).toHaveValue(
    'EUR',
  );
  await expect(page.getByLabel('Status', { exact: true })).toHaveValue('all');
  await expect(page.getByLabel('Month', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Active filters')).not.toContainText(
    'expenses:coffee',
  );
  await redo(page).click();
  await expect(page.getByLabel('Search transactions')).toHaveValue('Coffee');
  await expect(page.getByLabel('Commodity', { exact: true })).toHaveValue(
    'USD',
  );
  await expect(page.getByLabel('Status', { exact: true })).toHaveValue('!');
  await expect(page.getByLabel('Month', { exact: true })).toHaveValue(
    '2024-03',
  );
  await expect(page.getByLabel('Active filters')).toContainText(
    'expenses:coffee',
  );
  await expect(
    page.getByRole('region', { name: 'Previous month comparison' }),
  ).toContainText('0.10 USD');
  await page.getByLabel('From date', { exact: true }).fill('2024-04-01');
  await expect(page.getByRole('alert')).toBeVisible();
  await undo(page).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByLabel('Month', { exact: true })).toHaveValue(
    '2024-03',
  );
  await redo(page).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await undo(page).click();
  await page.getByLabel('Status', { exact: true }).selectOption('*');
  await expect(redo(page)).toBeDisabled();
});

test.describe('import lifecycle', () => {
  test.use({ serviceWorkers: 'block' });
  test('failed and cancelled imports retain history; same-name commits and closing clear it', async ({
    page,
    context,
  }) => {
    let hold = false,
      release: (() => void) | undefined;
    await context.route('**/assets/journal.worker-*.js', async (route) => {
      if (hold)
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      await route.continue().catch(() => {});
    });
    await open(page);
    await page.getByLabel('Commodity', { exact: true }).selectOption('USD');
    await page.getByLabel('Search transactions').fill('Coffee');
    await undo(page).click();
    await expect(redo(page)).toBeEnabled();
    await page.getByLabel('Import journal files').setInputFiles({
      name: 'bad.journal',
      mimeType: 'text/plain',
      buffer: Buffer.from([0xff]),
    });
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(redo(page)).toBeEnabled();
    hold = true;
    await page.getByLabel('Import journal files').setInputFiles(file);
    await expect(
      page.getByRole('status', { name: 'Import progress' }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Cancel import', exact: true })
      .click();
    hold = false;
    release?.();
    await expect(page.getByRole('alert')).toContainText('Import cancelled');
    await expect(redo(page)).toBeEnabled();
    await redo(page).click();
    await expect(page.getByLabel('Search transactions')).toHaveValue('Coffee');
    await expect(page.getByLabel('Filtered totals')).toContainText('0.30 USD');
    await page.getByLabel('Import journal files').setInputFiles(file);
    await expect(page.getByLabel('Search transactions')).toHaveValue('');
    await expect(undo(page)).toBeDisabled();
    await expect(redo(page)).toBeDisabled();
    await page.getByLabel('Status', { exact: true }).selectOption('!');
    await expect(undo(page)).toBeEnabled();
    await page
      .getByRole('button', { name: 'Close journals', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Meet your journal’s better half.' }),
    ).toBeVisible();
    await page.getByLabel('Import journal files').setInputFiles(file);
    await expect(undo(page)).toBeDisabled();
    await expect(redo(page)).toBeDisabled();
  });
});

test('history stays out of persistent storage and URLs and clears after an offline refresh', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  const url = page.url(),
    marker = 'private-filter-history-987431';
  await page.getByLabel('Search transactions').fill(marker);
  await page
    .getByRole('button', { name: 'Clear search filter', exact: true })
    .click();
  await expect(undo(page)).toBeEnabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(page.url()).toBe(url);
  await page.evaluate(() => navigator.serviceWorker.ready);
  const stored = await page.evaluate(async (marker) => {
    let cached = false;
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) {
        const response = await cache.match(request);
        if (
          request.url.includes(marker) ||
          (await response?.text())?.includes(marker)
        )
          cached = true;
      }
    }
    return {
      local: localStorage.length,
      session: sessionStorage.length,
      databases: await indexedDB.databases(),
      cached,
    };
  }, marker);
  expect(stored).toEqual({
    local: 0,
    session: 0,
    databases: [],
    cached: false,
  });
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Meet your journal’s better half.' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Explore sample journal', exact: true })
    .click();
  await expect(page.getByRole('table')).toContainText('Northwind');
  await expect(undo(page)).toBeDisabled();
  await expect(redo(page)).toBeDisabled();
  await expect(page.getByLabel('Search transactions')).toHaveValue('');
});

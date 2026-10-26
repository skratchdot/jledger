import { expect, test } from '@playwright/test';
const file = (text: string) => ({
  name: 'range.journal',
  mimeType: 'text/plain',
  buffer: Buffer.from(text),
});
const journal =
  '2024-02-28 ! Match old\n  expenses:food  0.30 USD\n  assets:cash\n\n' +
  '2024-03-01 ! Match new\n  expenses:food  0.30 USD\n  assets:cash\n\n' +
  '2024-03-02 ! Match refund\n  expenses:food  -0.03 USD\n  assets:cash\n\n' +
  '2024-02-29 Excluded\n  expenses:food  100 USD\n  assets:cash\n\n' +
  '2024-03-01 ! Match euro\n  expenses:food  2 EUR\n  assets:cash\n';

test('custom ranges compare equal periods and drill down atomically with filters, presets and history', async ({
  page,
}) => {
  await page.goto('./');
  await page.getByLabel('Import journal files').setInputFiles(file(journal));
  await page.getByLabel('Commodity', { exact: true }).selectOption('USD');
  await page.getByLabel('Search transactions').fill('match');
  await page.getByLabel('Status', { exact: true }).selectOption('!');
  await page
    .getByRole('button', { name: 'Filter expenses:food', exact: true })
    .click();
  const comparison = page.getByRole('region', {
    name: 'Previous period comparison',
  });
  await page.getByLabel('From date', { exact: true }).fill('2024-03-01');
  await expect(comparison).toHaveCount(0);
  await page.getByLabel('Through date', { exact: true }).fill('2024-03-02');
  await expect(comparison).toContainText(
    'Compared with 2024-02-28 through 2024-02-29',
  );
  await expect(comparison).toContainText('Equal-length inclusive date ranges');
  await expect(comparison).toContainText('0.30 USD');
  await expect(comparison).toContainText('Change: -0.03 USD');
  await expect(comparison).toContainText('Previous transactions1Change: +1');
  const register = page.getByRole('table', { name: 'Transaction register' });
  await expect(register).toHaveAttribute('aria-rowcount', '3');
  await expect(register).not.toContainText('Match old');
  await page.locator('.saved-filters > summary').click();
  await page.getByLabel('Filter name', { exact: true }).fill('Two days');
  await page
    .getByRole('button', { name: 'Save current filters', exact: true })
    .click();
  await comparison
    .getByRole('button', {
      name: 'Explore 2024-02-28 through 2024-02-29',
      exact: true,
    })
    .focus();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('From date', { exact: true })).toHaveValue(
    '2024-02-28',
  );
  await expect(page.getByLabel('From date', { exact: true })).toBeFocused();
  await expect(page.getByLabel('Through date', { exact: true })).toHaveValue(
    '2024-02-29',
  );
  await expect(page.getByLabel('Month', { exact: true })).toHaveValue('');
  await expect(register).toHaveAttribute('aria-rowcount', '2');
  await expect(register).toContainText('Match old');
  await expect(comparison).toContainText(
    'No transactions match in the previous period',
  );
  await page
    .getByRole('button', { name: 'Undo filter change', exact: true })
    .click();
  await expect(page.getByLabel('From date', { exact: true })).toHaveValue(
    '2024-03-01',
  );
  await expect(page.getByLabel('Through date', { exact: true })).toHaveValue(
    '2024-03-02',
  );
  await expect(comparison).toContainText('Change: -0.03 USD');
  await page
    .getByRole('button', { name: 'Clear filters', exact: true })
    .click();
  await expect(comparison).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Apply saved filter Two days', exact: true })
    .click();
  await expect(comparison).toContainText('Change: -0.03 USD');
  await expect(page.getByLabel('Status', { exact: true })).toHaveValue('!');
  await expect(register).toHaveAttribute('aria-rowcount', '3');
});

test('narrow range comparisons preserve exact split posting dates and hide incomplete or invalid scopes', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await page
    .getByLabel('Import journal files')
    .setInputFiles(
      file(
        '2024-01-01 Split\n  expenses:food  9007199254740993.01 ; [2/29]\n  expenses:food  9007199254740992.98 ; [3/1]\n  assets:cash\n',
      ),
    );
  await page.getByLabel('From date', { exact: true }).fill('2024-03-01');
  await page.getByLabel('Through date', { exact: true }).fill('2024-03-01');
  const comparison = page.getByRole('region', {
    name: 'Previous period comparison',
  });
  await expect(comparison).toContainText(
    'Compared with 2024-02-29 through 2024-02-29',
  );
  await expect(comparison).toContainText('9,007,199,254,740,993.01');
  await expect(comparison).toContainText('Change: -0.03');
  await expect(comparison).toContainText('Previous transactions1Change: +0');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await comparison.getByRole('button').click();
  await expect(page.getByLabel('From date', { exact: true })).toBeFocused();
  await expect(page.getByLabel('Filtered totals')).toContainText(
    '9,007,199,254,740,993.01',
  );
  await page.getByRole('button', { name: '· Split', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('2024-02-29');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByLabel('Through date', { exact: true }).fill('');
  await expect(comparison).toHaveCount(0);
  await page.getByLabel('Through date', { exact: true }).fill('2024-02-28');
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(comparison).toHaveCount(0);
  await page.getByLabel('Through date', { exact: true }).fill('2024-02-29');
  await expect(comparison).toBeVisible();
  await page
    .getByLabel('Import journal files')
    .setInputFiles(
      file(
        '2024-03-01 Invalid\n  expenses:food  1 USD @ 2 EUR\n  assets:cash\n',
      ),
    );
  await expect(page.getByRole('alert')).toContainText('Reports paused');
  await expect(comparison).toHaveCount(0);
});

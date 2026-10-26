import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('status filters honor posting overrides, explain inheritance and match the same account', async ({
  page,
}) => {
  await page.goto('./');
  const buffer = await readFile(
    new URL(
      '../../packages/core/fixtures/compatibility/status-overrides.journal',
      import.meta.url,
    ),
  );
  await page
    .getByLabel('Import journal files')
    .setInputFiles({ name: 'status.journal', mimeType: 'text/plain', buffer });
  await expect(page.getByLabel('Filtered totals')).toContainText('41.00 USD');
  await page.getByLabel('Status', { exact: true }).selectOption('!');
  await expect(page.getByLabel('Filtered totals')).toContainText('22.00 USD');
  await expect(page.getByRole('table')).toHaveAttribute('aria-rowcount', '4');
  const row = page.getByRole('row').filter({
    has: page.getByRole('button', { name: '* Cleared', exact: true }),
  });
  await expect(row).toContainText('2.00 USD');
  await expect(row).not.toContainText('3.00 USD');
  await expect(row).not.toContainText('-5.00 USD');
  await expect(row.getByTitle('Cleared transaction')).toBeVisible();
  await page.getByRole('button', { name: '* Cleared', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText(
    'Pending (posting status)',
  );
  await expect(page.getByRole('dialog')).toContainText(
    'Cleared (transaction status)',
  );
  await expect(page.getByRole('dialog').locator('pre')).toContainText(
    '! expenses:food  2.00 USD',
  );
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByLabel('Status', { exact: true }).selectOption('*');
  await expect(page.getByLabel('Filtered totals')).toContainText('19.00 USD');
  await page
    .getByRole('button', { name: 'Filter expenses:food', exact: true })
    .click();
  await page.getByLabel('Status', { exact: true }).selectOption('');
  await expect(page.getByRole('table')).toHaveAttribute('aria-rowcount', '1');
  await expect(page.getByLabel('Filtered totals')).toContainText('0.00 USD');
  await page
    .getByRole('button', { name: 'Clear filters', exact: true })
    .click();
  await page.getByLabel('Status', { exact: true }).selectOption('');
  await expect(page.getByRole('table')).toHaveAttribute('aria-rowcount', '2');
  await expect(page.getByRole('table')).toContainText('assets:bank');
  await expect(page.getByRole('table')).not.toContainText('expenses:food');
  await page
    .getByRole('button', { name: 'Clear status filter', exact: true })
    .click();
  await expect(page.getByLabel('Status', { exact: true })).toBeFocused();
  await expect(page.getByLabel('Filtered totals')).toContainText('41.00 USD');
});

test('posting status scopes survive presets and history and drive both comparison periods on narrow screens', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  const text =
    '2024-02-01 ! Before\n  * expenses:food  0.10 USD\n  ! expenses:food  0.20 USD\n  assets:bank  -0.30 USD\n\n2024-03-01 * After\n  * expenses:food  0.30 USD\n  ! expenses:food  0.40 USD\n  assets:bank  -0.70 USD\n';
  await page.getByLabel('Import journal files').setInputFiles({
    name: 'periods.journal',
    mimeType: 'text/plain',
    buffer: Buffer.from(text),
  });
  await page.getByLabel('Month', { exact: true }).selectOption('2024-03');
  await page.getByLabel('Status', { exact: true }).selectOption('!');
  await expect(page.getByLabel('Filtered totals')).toContainText('0.40 USD');
  await expect(page.getByLabel('Previous month comparison')).toContainText(
    '0.20 USD',
  );
  await page.locator('.saved-filters > summary').click();
  await page.getByLabel('Filter name', { exact: true }).fill('Pending March');
  await page
    .getByRole('button', { name: 'Save current filters', exact: true })
    .click();
  await page.getByLabel('Status', { exact: true }).selectOption('*');
  await expect(page.getByLabel('Filtered totals')).toContainText('0.30 USD');
  await expect(page.getByLabel('Previous month comparison')).toContainText(
    '0.10 USD',
  );
  const apply = page.getByRole('button', {
    name: 'Apply saved filter Pending March',
    exact: true,
  });
  await apply.focus();
  await apply.press('Enter');
  await expect(page.getByLabel('Status', { exact: true })).toHaveValue('!');
  await expect(page.getByLabel('Filtered totals')).toContainText('0.40 USD');
  await page
    .getByRole('button', { name: 'Undo filter change', exact: true })
    .click();
  await expect(page.getByLabel('Status', { exact: true })).toHaveValue('*');
  await expect(page.getByLabel('Filtered totals')).toContainText('0.30 USD');
  await page
    .getByRole('button', { name: 'Redo filter change', exact: true })
    .click();
  await expect(page.getByLabel('Status', { exact: true })).toHaveValue('!');
  await expect(page.getByLabel('Filtered totals')).toContainText('0.40 USD');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test('large posting-status results stay responsive and windowed through final source drill-down', async ({
  page,
}) => {
  await page.goto('./');
  let text = '';
  for (let i = 0; i < 5000; i++)
    text += `2024-01-01 * Payment ${i}\n  ${i % 2 ? '! ' : ''}expenses:food  0.01 USD\n  assets:bank\n\n`;
  await page.getByLabel('Import journal files').setInputFiles({
    name: 'large-status.journal',
    mimeType: 'text/plain',
    buffer: Buffer.from(text),
  });
  const status = page.getByLabel('Status', { exact: true });
  await status.selectOption('!');
  await expect(page.getByLabel('Filtered totals')).toContainText('25.00 USD');
  await expect(page.getByRole('table')).toHaveAttribute(
    'aria-rowcount',
    '2501',
  );
  const search = page.getByLabel('Search transactions');
  const started = Date.now();
  await search.fill('Payment 4999');
  expect(Date.now() - started).toBeLessThan(1000);
  await expect(page.getByRole('table')).toHaveAttribute('aria-rowcount', '2');
  await expect(page.getByRole('table')).not.toContainText('assets:bank');
  await page
    .getByRole('button', { name: '* Payment 4999', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toContainText(
    'Pending (posting status)',
  );
  await expect(page.getByRole('dialog')).toContainText(
    'large-status.journal:19997',
  );
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await search.fill('');
  await expect(page.getByRole('table')).toHaveAttribute(
    'aria-rowcount',
    '2501',
  );
  expect(await page.locator('tbody tr').count()).toBeLessThan(50);
  await page
    .getByLabel('Scrollable transaction register')
    .evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
  await expect(
    page.getByRole('button', { name: '* Payment 4999', exact: true }),
  ).toBeVisible();
});

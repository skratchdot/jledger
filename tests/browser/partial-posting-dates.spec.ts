import { expect, test } from '@playwright/test';

test('partial posting dates use transaction years through includes, reports and drill-down', async ({
  page,
}) => {
  await page.goto('./');
  const root =
    'Y2020\ninclude child.journal\n2024-12-31 Purchase\n  expenses:food  0.20 USD ; [1/1]\n  assets:cash\n';
  const child =
    'Y2028\n2024-03-01 Leap purchase\n  expenses:food  0.10 USD ; project:tea, date:2/29\n  assets:cash\n';
  await page.getByLabel('Import journal files').setInputFiles([
    { name: 'root.journal', mimeType: 'text/plain', buffer: Buffer.from(root) },
    {
      name: 'child.journal',
      mimeType: 'text/plain',
      buffer: Buffer.from(child),
    },
  ]);
  await expect(page.getByLabel('Filtered totals')).toContainText('0.30 USD');
  await page.getByRole('button', { name: 'Filter month 2024-02' }).click();
  await expect(page.getByLabel('Filtered totals')).toContainText('0.10 USD');
  await expect(page.getByRole('table')).toHaveAttribute('aria-rowcount', '2');
  await expect(page.getByRole('table')).toContainText('2024-03-01');
  await expect(page.getByRole('table')).toContainText('posted 2024-02-29');
  await expect(page.getByRole('table')).not.toContainText('assets:cash');
  await page
    .getByRole('button', { name: '· Leap purchase', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toContainText(
    'Transaction date 2024-03-01',
  );
  await expect(page.getByRole('dialog')).toContainText('posted 2024-02-29');
  await expect(page.getByRole('dialog')).toContainText('child.journal:2');
  await expect(page.getByRole('dialog').locator('pre')).toContainText(
    'date:2/29',
  );
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByLabel('Month', { exact: true }).selectOption('2024-01');
  await expect(page.getByLabel('Filtered totals')).toContainText('0.20 USD');
  await expect(page.getByRole('table')).toContainText('2024-12-31');
  await expect(page.getByRole('table')).toContainText('posted 2024-01-01');
  await page.getByLabel('Import journal files').setInputFiles({
    name: 'invalid.journal',
    mimeType: 'text/plain',
    buffer: Buffer.from(
      'Y2024\n2025-03-01 Invalid leap\n  expenses:food  1 USD ; [2/29]\n  assets:cash',
    ),
  });
  await expect(page.getByRole('alert')).toContainText('invalid.journal:3');
  await expect(page.getByRole('alert')).toContainText('posting-date');
  await expect(page.getByRole('table')).toHaveCount(0);
  await expect(page.getByLabel('Filtered totals')).toHaveCount(0);
});

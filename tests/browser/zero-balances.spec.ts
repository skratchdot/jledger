import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const fixture = (name: string) =>
  readFile(
    new URL(
      `../../packages/core/fixtures/compatibility/${name}.journal`,
      import.meta.url,
    ),
  );

test('closed spending accounts retain zero balances and drill into purchases and refunds', async ({
  page,
}) => {
  await page.goto('./');
  await page.getByLabel('Import journal files').setInputFiles({
    name: 'zero-refund.journal',
    mimeType: 'text/plain',
    buffer: await fixture('zero-refund'),
  });
  await expect(page.getByRole('table')).toHaveAttribute('aria-rowcount', '3');
  await expect(page.getByLabel('Filtered totals')).toContainText('0.00 USD');
  await page.getByRole('button', { name: /Accounts/ }).click();
  const food = page.getByRole('button', {
    name: 'expenses:food 0.00 USD',
    exact: true,
  });
  await expect(food).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'assets:bank 0.00 USD', exact: true }),
  ).toBeVisible();
  await food.click();
  await expect(page.getByRole('table')).toHaveAttribute('aria-rowcount', '3');
  await page.getByLabel('Month', { exact: true }).selectOption('2024-01');
  await expect(page.getByRole('table')).toHaveAttribute('aria-rowcount', '2');
  // Account amounts keep full-journal scope even when the register shows a month.
  await expect(food).toContainText('0.00 USD');
  await page.getByRole('button', { name: /Overview/ }).click();
  await expect(page.getByLabel('Filtered totals')).toContainText('12.34 USD');
  await page.getByLabel('Month', { exact: true }).selectOption('2024-02');
  await expect(page.getByLabel('Filtered totals')).toContainText('-12.34 USD');
  await page.getByRole('button', { name: '· Refund', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('zero-refund.journal:5');
  await expect(page.getByRole('dialog').locator('pre')).toContainText(
    'expenses:food  -12.34 USD',
  );
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page
    .getByRole('button', { name: 'Clear filters', exact: true })
    .click();
  await expect(page.getByRole('table')).toHaveAttribute('aria-rowcount', '3');
  await expect(page.getByLabel('Filtered totals')).toContainText('0.00 USD');
});

test('zero commodities stay visible beside nonzero balances and finer residuals never round away', async ({
  page,
}) => {
  await page.goto('./');
  const fine =
    'commodity 1.00 USD\n2024-01-01 Deposit\n  assets:residual  0.010000000000000001 USD\n  equity:fine\n\n2024-01-02 Withdrawal\n  assets:residual  -0.010000000000000000 USD\n  equity:fine\n';
  await page.getByLabel('Import journal files').setInputFiles([
    {
      name: 'mixed.journal',
      mimeType: 'text/plain',
      buffer: await fixture('zero-remaining'),
    },
    { name: 'fine.journal', mimeType: 'text/plain', buffer: Buffer.from(fine) },
  ]);
  await page.getByLabel('Commodity', { exact: true }).selectOption('USD');
  await expect(page.getByRole('table')).toHaveAttribute('aria-rowcount', '5');
  await page.getByRole('button', { name: /Accounts/ }).click();
  const cash = page.getByRole('button', {
    name: 'assets:cash 0.20 EUR · 0.00 USD',
    exact: true,
  });
  const residual = page.getByRole('button', {
    name: 'assets:residual 0.000000000000000001 USD',
    exact: true,
  });
  await expect(cash).toBeVisible();
  await expect(residual).toBeVisible();
  await page.getByLabel('Include subaccounts', { exact: true }).uncheck();
  await expect(cash).toBeVisible();
  await expect(residual).toBeVisible();
  await cash.click();
  await page.getByLabel('Commodity', { exact: true }).selectOption('USD');
  await expect(page.getByRole('table')).toHaveAttribute('aria-rowcount', '3');
  await expect(cash).toContainText('0.00 USD');
  await page
    .getByRole('button', { name: 'Clear filters', exact: true })
    .click();
  await residual.click();
  await expect(page.getByRole('table')).toHaveAttribute('aria-rowcount', '3');
  await page.getByRole('button', { name: '· Deposit', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText(
    '0.010000000000000001 USD',
  );
  await expect(page.getByRole('dialog').locator('pre')).toContainText(
    '0.010000000000000001 USD',
  );
});

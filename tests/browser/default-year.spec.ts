import { expect, test } from '@playwright/test';

test('declared years flow through selected includes, exact reports and source explanations', async ({
  page,
}) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('./');
  const root =
    'Y2024 ; annual journal\ninclude february.journal\n3/1 Refund\n  expenses:coffee  -0.05 USD\n  assets:cash\n\nY 2025\n1/1 * Next year salary\n  assets:cash  10 USD\n  income:salary\n';
  const child =
    '2/28 * Start\n  expenses:food  0.10 USD\n  assets:cash\n\n2/29 ! Leap coffee\n  expenses:coffee  0.20 USD\n  assets:cash\n\nyear 2028\n2/29 Child future\n  expenses:food  0.30 USD\n  assets:cash\n';
  await page.getByLabel('Import journal files').setInputFiles([
    { name: 'root.journal', mimeType: 'text/plain', buffer: Buffer.from(root) },
    {
      name: 'february.journal',
      mimeType: 'text/plain',
      buffer: Buffer.from(child),
    },
  ]);
  await expect(page.getByLabel('Filtered totals')).toContainText('0.55 USD');
  await expect(page.getByLabel('Filtered totals')).toContainText('10 USD');
  await page.getByLabel('Month', { exact: true }).selectOption('2024-02');
  await expect(page.getByLabel('Filtered totals')).toContainText('0.30 USD');
  await expect(page.getByRole('table')).toHaveAttribute('aria-rowcount', '3');
  await page
    .getByRole('button', { name: '! Leap coffee', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toContainText(
    'Transaction date 2024-02-29',
  );
  await expect(page.getByRole('dialog')).toContainText(
    'Year 2024 supplied by root.journal:1.',
  );
  await expect(page.getByRole('dialog').locator('pre')).toContainText(
    '2/29 ! Leap coffee',
  );
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByLabel('Month', { exact: true }).selectOption('2024-03');
  await expect(page.getByLabel('Filtered totals')).toContainText('-0.05 USD');
  await expect(page.getByRole('table')).toContainText('Refund');
  await page.getByLabel('Month', { exact: true }).selectOption('2028-02');
  await expect(page.getByLabel('Filtered totals')).toContainText('0.30 USD');
  await page
    .getByRole('button', { name: '· Child future', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toContainText(
    'Year 2028 supplied by february.journal:9.',
  );
  expect(
    requests.every(
      (request) =>
        new URL(request).hostname === '127.0.0.1' &&
        !/root\.journal|february\.journal/.test(request),
    ),
  ).toBe(true);
});

test('unanchored headers and partial posting dates disable every report until corrected', async ({
  page,
}) => {
  await page.goto('./');
  const text =
    '2024-12-31 Explicit\n  expenses:food  1 USD\n  assets:cash\n\n1/2 Missing year\n  expenses:food  1 USD\n  assets:cash\n';
  await page.getByLabel('Import journal files').setInputFiles({
    name: 'year.journal',
    mimeType: 'text/plain',
    buffer: Buffer.from('Y2024\n' + text),
  });
  await expect(page.getByLabel('Filtered totals')).toContainText('2 USD');
  await page.getByLabel('Import journal files').setInputFiles({
    name: 'year.journal',
    mimeType: 'text/plain',
    buffer: Buffer.from(text),
  });
  await expect(page.getByRole('alert')).toContainText('default-year-required');
  await expect(page.getByRole('alert')).toContainText('year.journal:5');
  await expect(page.getByRole('table')).toHaveCount(0);
  await expect(page.getByLabel('Filtered totals')).toHaveCount(0);
  await page.getByLabel('Import journal files').setInputFiles({
    name: 'year.journal',
    mimeType: 'text/plain',
    buffer: Buffer.from(
      'Y2024\n2/29 Partial posting\n  expenses:food  1 USD ; [3/1]\n  assets:cash',
    ),
  });
  await expect(page.getByRole('alert')).toContainText('posting-date');
  await expect(page.getByRole('table')).toHaveCount(0);
  await page.getByLabel('Import journal files').setInputFiles({
    name: 'year.journal',
    mimeType: 'text/plain',
    buffer: Buffer.from('Y2024\n' + text),
  });
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('table')).toContainText('2024-01-02');
  await expect(page.getByRole('table')).toContainText('2024-12-31');
});

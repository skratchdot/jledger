import { expect, test } from '@playwright/test';
const file = (text: string) => ({
  name: 'monthly-surplus.journal',
  mimeType: 'text/plain',
  buffer: Buffer.from(text),
});

test('monthly income less spending pages exact values and links keyboard month selection, source details and history', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  const text = Array.from({ length: 61 }, (_, i) => {
    const month = `${2020 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
    const quantity = i === 60 ? '0.000000000000000001' : '-9007199254740993.01';
    const expense = i === 60 ? '' : '  expenses:food  9007199254740993 USD\n';
    return `${month}-01 Employer ${i}\n  income:salary  ${quantity} USD\n${expense}  assets:cash\n`;
  }).join('\n');
  await page.getByLabel('Import journal files').setInputFiles(file(text));
  const disclosure = page.locator('.monthly-surplus');
  await expect(disclosure.locator('table')).toHaveCount(0);
  await disclosure.locator('summary').focus();
  await page.keyboard.press('Enter');
  const table = page.getByRole('table', {
    name: 'Monthly income less spending · USD',
    exact: true,
  });
  await expect(table.getByRole('row')).toHaveCount(26);
  await expect(
    table.getByRole('columnheader', {
      name: 'Income less spending',
      exact: true,
    }),
  ).toBeVisible();
  await expect(table).toContainText('0.01 USD');
  const next = page.getByRole('button', {
    name: 'Next monthly income less spending page',
  });
  await next.focus();
  await page.keyboard.press('Enter');
  await expect(next).toBeFocused();
  await expect(table).toContainText('2022-02');
  await next.click();
  await expect(table.getByRole('row')).toHaveCount(12);
  await expect(next).toBeDisabled();
  const finalMonth = table.getByRole('button', {
    name: 'Filter month 2025-01',
    exact: true,
  });
  await expect(table.getByRole('row').last()).toContainText(
    '-0.000000000000000001 USD',
  );
  await finalMonth.focus();
  await page.keyboard.press('Space');
  await expect(table.getByRole('row')).toHaveCount(2);
  await expect(finalMonth).toHaveAttribute('aria-pressed', 'true');
  await expect(finalMonth).toBeFocused();
  await expect(
    page.getByRole('table', { name: 'Transaction register' }),
  ).toHaveAttribute('aria-rowcount', '2');
  await page
    .getByRole('button', { name: '· Employer 60', exact: true })
    .click();
  await expect(page.getByRole('dialog').locator('pre')).toContainText(
    '0.000000000000000001 USD',
  );
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await finalMonth.focus();
  await page.keyboard.press('Enter');
  await expect(table.getByRole('row')).toHaveCount(26);
  await expect(table.locator('caption')).toBeFocused();
  await page
    .getByRole('button', { name: 'Undo filter change', exact: true })
    .click();
  await expect(table.getByRole('row')).toHaveCount(2);
  await next.focus();
  await page.getByLabel('Import journal files').setInputFiles(file(text));
  await expect(page.locator('.income-accounts')).toHaveCount(1);
  await expect(disclosure).toHaveCount(1);
  await expect(disclosure).not.toHaveAttribute('open');
  await expect(disclosure.locator('table')).toHaveCount(0);
});

test('monthly income less spending follows effective posting scopes, separate commodities and invalid reports', async ({
  page,
}) => {
  await page.goto('./');
  await page.getByLabel('Import journal files').setInputFiles(
    file(`account revenus  ; type:R
alias wages = revenus:paie
2024-01-01 * Salary
  ! wages  -0.10 USD ; [2/29]
  * wages  -0.20 USD ; [3/1]
  revenus:other  -5 EUR
  assets:cash  0.30 USD
  assets:cash  5 EUR

2024-04-01 Unitless
  wages  -0.01
  assets:cash
`),
  );
  const disclosure = page.locator('.monthly-surplus');
  await disclosure.locator('summary').click();
  await page.getByLabel('Commodity', { exact: true }).selectOption('USD');
  let table = page.getByRole('table', {
    name: 'Monthly income less spending · USD',
    exact: true,
  });
  await expect(table).toContainText('0.10 USD');
  await expect(table).toContainText('0.20 USD');
  await expect(table.getByRole('row').nth(1)).toContainText('0.00 USD');
  await page.getByLabel('Status', { exact: true }).selectOption('!');
  await expect(
    table.getByRole('row').filter({ hasText: '2024-03' }),
  ).toContainText('0.00 USD');
  await table
    .getByRole('button', { name: 'Filter month 2024-02', exact: true })
    .click();
  await expect(
    page.getByRole('table', { name: 'Transaction register' }),
  ).toContainText('posted 2024-02-29');
  await page
    .getByRole('button', { name: 'Clear filters', exact: true })
    .click();
  await page.getByLabel('Commodity', { exact: true }).selectOption('EUR');
  table = page.getByRole('table', {
    name: 'Monthly income less spending · EUR',
    exact: true,
  });
  await expect(table).toContainText('5.00 EUR');
  await page.getByLabel('Commodity', { exact: true }).selectOption('');
  table = page.getByRole('table', {
    name: 'Monthly income less spending · No commodity',
    exact: true,
  });
  await expect(table).toContainText('0.01');
  await page.getByLabel('From date', { exact: true }).fill('2025-01-01');
  await expect(table.getByRole('row')).toHaveCount(1);
  await expect(disclosure).toContainText(
    'No matching monthly income less spending.',
  );
  await page
    .getByLabel('Import journal files')
    .setInputFiles(
      file(
        '2024-01-01 Unsupported\n  income:salary  -1 USD @ 2 EUR\n  assets:cash\n',
      ),
    );
  await expect(disclosure).toHaveCount(0);
});

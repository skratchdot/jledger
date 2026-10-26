import { expect, test } from '@playwright/test';
const file = (text: string) => ({
  name: 'comparison.journal',
  mimeType: 'text/plain',
  buffer: Buffer.from(text),
});
const text =
  '2024-02-29 ! Match old\n  expenses:food  0.30 USD\n  assets:cash\n\n2024-03-01 ! Match new\n  expenses:food  0.30 USD\n  assets:cash\n\n2024-03-02 ! Match refund\n  expenses:food  -0.03 USD\n  assets:cash\n\n2024-02-01 Salary old\n  income:salary  -900 USD\n  assets:cash\n\n2024-03-01 Salary new\n  income:salary  -1000 USD\n  assets:cash\n\n2024-02-29 Euro old\n  expenses:food  2 EUR\n  assets:cash\n\n2024-03-01 Euro new\n  expenses:food  1 EUR\n  assets:cash\n';

test('month comparisons share exact filters and link back to prior-month transactions', async ({
  page,
}) => {
  await page.goto('./');
  await page.getByLabel('Import journal files').setInputFiles(file(text));
  await page.getByLabel('Commodity', { exact: true }).selectOption('USD');
  const comparison = page.getByRole('region', {
    name: 'Previous month comparison',
  });
  await expect(comparison).toHaveCount(0);
  await page.getByLabel('Month', { exact: true }).selectOption('2024-03');
  await expect(comparison).toContainText('Compared with 2024-02');
  await expect(comparison).toContainText('900.00 USD');
  await expect(comparison).toContainText('Change: +100.00 USD');
  await expect(comparison).toContainText('0.30 USD');
  await expect(comparison).toContainText('Change: -0.03 USD');
  await expect(comparison).toContainText('Previous transactions2Change: +1');
  await expect(
    page.getByRole('table', { name: 'Transaction register' }),
  ).toHaveAttribute('aria-rowcount', '4');
  await page.getByLabel('Search transactions').fill('match');
  await page.getByLabel('Status', { exact: true }).selectOption('!');
  await expect(comparison).toContainText('Previous transactions1Change: +1');
  await expect(comparison).toContainText('Change: -0.03 USD');
  await expect(comparison).toContainText('Change: +0.00 USD');
  await page
    .getByRole('button', { name: 'Filter expenses:food', exact: true })
    .click();
  await expect(comparison).toContainText('0.30 USD');
  await comparison
    .getByRole('button', { name: 'Explore 2024-02', exact: true })
    .click();
  await expect(page.getByLabel('Month', { exact: true })).toHaveValue(
    '2024-02',
  );
  await expect(page.getByLabel('Month', { exact: true })).toBeFocused();
  await expect(page.getByLabel('Filtered totals')).toContainText('0.30 USD');
  await expect(
    page.getByRole('table', { name: 'Transaction register' }),
  ).toContainText('Match old');
  await expect(comparison).toContainText('Compared with 2024-01');
  await expect(comparison).toContainText(
    'No transactions match in the previous month',
  );
  await comparison
    .getByRole('button', { name: 'Explore 2024-01', exact: true })
    .click();
  await expect(page.getByLabel('Month', { exact: true })).toHaveValue(
    '2024-01',
  );
  await expect(
    page.getByLabel('Month', { exact: true }).locator('option:checked'),
  ).toContainText('no journal postings');
  await expect(
    page.getByRole('table', { name: 'Transaction register' }),
  ).toHaveAttribute('aria-rowcount', '1');
  await expect(comparison).toContainText('Compared with 2023-12');
  await page
    .getByRole('button', { name: 'Clear filters', exact: true })
    .click();
  await expect(comparison).toHaveCount(0);
  await page.getByLabel('Month', { exact: true }).selectOption('2024-03');
  await page.getByLabel('Commodity', { exact: true }).selectOption('EUR');
  await expect(comparison).toContainText('2.00 EUR');
  await expect(comparison).toContainText('Change: -1.00 EUR');
  await page.getByLabel('From date', { exact: true }).fill('2024-03-02');
  await expect(comparison).toHaveCount(0);
});

test('comparisons respect posting dates and exact unitless amounts on narrow screens and hide invalid reports', async ({
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
  await page.getByLabel('Month', { exact: true }).selectOption('2024-03');
  const comparison = page.getByRole('region', {
    name: 'Previous month comparison',
  });
  await expect(comparison).toContainText('9,007,199,254,740,993.01');
  await expect(comparison).toContainText('Change: -0.03');
  await expect(comparison).toContainText('Previous transactions1Change: +0');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole('button', { name: 'Tables', exact: true }).click();
  await expect(comparison).toContainText('Change: -0.03');
  await page.getByLabel('Through date', { exact: true }).fill('2024-02-28');
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(comparison).toHaveCount(0);
  await page.getByRole('button', { name: 'Clear dates', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByLabel('Month', { exact: true }).selectOption('2024-03');
  await expect(comparison).toContainText('Change: -0.03');
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

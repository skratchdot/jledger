import { expect, test } from '@playwright/test';

const upload = async (page: import('@playwright/test').Page, text: string) => {
  await page.getByLabel('Import journal files').setInputFiles({
    name: 'tables.journal',
    mimeType: 'text/plain',
    buffer: Buffer.from(text),
  });
};

test('expense tables expose every category with exact signed values and keyboard drill-down', async ({
  page,
}) => {
  await page.goto('./');
  const text =
    Array.from(
      { length: 61 },
      (_, i) =>
        `2024-01-01 Merchant ${i}\n  expenses:category-${String(i).padStart(3, '0')}  0.10 USD\n  assets:cash\n`,
    ).join('\n') +
    '\n2024-01-02 Refund\n  expenses:refund  -0.03 USD\n  assets:cash\n';
  await upload(page, text);
  await expect(page.getByLabel('Filtered totals')).toContainText('6.07 USD');
  await expect(
    page.getByRole('button', { name: 'Filter expenses:refund', exact: true }),
  ).toHaveCount(0);
  const mode = page.getByRole('button', { name: 'Tables', exact: true });
  await mode.focus();
  await page.keyboard.press('Enter');
  await expect(mode).toHaveAttribute('aria-pressed', 'true');
  const categories = page.getByRole('table', {
    name: 'Expense categories · USD',
    exact: true,
  });
  await expect(categories.getByRole('row')).toHaveCount(26);
  await expect(
    categories.getByRole('columnheader', { name: 'Account', exact: true }),
  ).toHaveCount(1);
  await expect(
    categories.getByRole('columnheader', { name: 'Net spending', exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByRole('button', { name: 'Previous expense categories page' }),
  ).toBeDisabled();
  await page
    .getByRole('button', { name: 'Next expense categories page' })
    .click();
  await expect(categories).toContainText('expenses:category-025');
  await expect(categories.getByRole('row')).toHaveCount(26);
  await page
    .getByRole('button', { name: 'Next expense categories page' })
    .click();
  await expect(categories).toContainText('expenses:category-060');
  await expect(categories).toContainText('-0.03 USD');
  await expect(categories.getByRole('row')).toHaveCount(13);
  await expect(
    page.getByRole('button', { name: 'Next expense categories page' }),
  ).toBeDisabled();
  const refund = categories.getByRole('button', {
    name: 'Filter account expenses:refund',
    exact: true,
  });
  await refund.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Filtered totals')).toContainText('-0.03 USD');
  await expect(refund).toHaveAttribute('aria-current', 'true');
  await expect(refund).toBeFocused();
  await expect(categories.getByRole('row')).toHaveCount(2);
  await expect(
    page.getByRole('table', { name: 'Transaction register' }),
  ).toContainText('Refund');
  await page.getByRole('button', { name: 'Charts', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Filter expenses:refund', exact: true }),
  ).toHaveAttribute('aria-current', 'true');
  await expect(categories).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Clear filters', exact: true })
    .click();
  await page.getByRole('button', { name: 'Tables', exact: true }).click();
  await expect(categories).toContainText('expenses:category-000');
  await expect(
    page.getByRole('button', { name: 'Previous expense categories page' }),
  ).toBeDisabled();
});

test('monthly tables page through all months, use posting dates and share month toggles', async ({
  page,
}) => {
  await page.goto('./');
  const text = Array.from({ length: 61 }, (_, i) => {
    const month = `${2020 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
    return `${month}-01 Purchase ${i}\n  expenses:food  0.10 USD\n  assets:cash\n`;
  }).join('\n');
  await upload(page, text);
  await expect(page.getByLabel('Filtered totals')).toContainText('6.10 USD');
  await page.getByRole('button', { name: 'Tables', exact: true }).click();
  const monthly = page.getByRole('table', {
    name: 'Monthly spending · USD',
    exact: true,
  });
  await expect(monthly.getByRole('row')).toHaveCount(26);
  await page
    .getByRole('button', { name: 'Next monthly spending page' })
    .click();
  await expect(monthly).toContainText('2022-02');
  await page
    .getByRole('button', { name: 'Next monthly spending page' })
    .click();
  await expect(monthly).toContainText('2025-01');
  await expect(monthly.getByRole('row')).toHaveCount(12);
  await expect(
    page.getByRole('button', { name: 'Next monthly spending page' }),
  ).toBeDisabled();
  const finalMonth = monthly.getByRole('button', {
    name: 'Filter month 2025-01',
    exact: true,
  });
  await finalMonth.focus();
  await page.keyboard.press('Space');
  await expect(page.getByLabel('Filtered totals')).toContainText('0.10 USD');
  await expect(finalMonth).toHaveAttribute('aria-pressed', 'true');
  await expect(finalMonth).toBeFocused();
  await expect(monthly.getByRole('row')).toHaveCount(2);
  await finalMonth.click();
  await expect(page.getByLabel('Filtered totals')).toContainText('6.10 USD');
  await expect(monthly).toContainText('2020-01');
  await expect(monthly.locator('caption')).toBeFocused();
  await expect(
    page.getByRole('button', { name: 'Previous monthly spending page' }),
  ).toBeDisabled();
  await upload(
    page,
    '2024-03-01 Split\n  expenses:food  0.10 USD ; [2/29]\n  assets:cash\n',
  );
  await expect(monthly).toContainText('2024-02');
  await monthly
    .getByRole('button', { name: 'Filter month 2024-02', exact: true })
    .click();
  await expect(page.getByLabel('Filtered totals')).toContainText('0.10 USD');
  await expect(
    page.getByRole('table', { name: 'Transaction register' }),
  ).toContainText('posted 2024-02-29');
  await expect(
    page.getByRole('table', { name: 'Transaction register' }),
  ).not.toContainText('assets:cash');
});

test('tables preserve exact large and unitless amounts, empty states and narrow layout', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  const long = 'expenses:' + 'long-account-'.repeat(15);
  await upload(
    page,
    `2024-01-01 Large\n  ${long}  9007199254740993.01 USD\n  assets:cash\n\n2024-01-02 Refund\n  ${long}  -0.02 USD\n  assets:cash\n\n2024-01-03 Euro\n  expenses:food  0.20 EUR\n  assets:cash\n\n2024-01-04 Unitless\n  expenses:food  0.30\n  assets:cash\n`,
  );
  await page.getByLabel('Commodity', { exact: true }).selectOption('USD');
  await expect(page.getByLabel('Filtered totals')).toContainText(
    '9007199254740992.99 USD',
  );
  await page.getByRole('button', { name: 'Tables', exact: true }).click();
  const categories = page.getByRole('table', {
    name: 'Expense categories · USD',
    exact: true,
  });
  await expect(categories).toContainText(long);
  await expect(categories).toContainText('9007199254740992.99 USD');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByLabel('Commodity', { exact: true }).selectOption('EUR');
  await expect(
    page.getByRole('table', { name: 'Expense categories · EUR', exact: true }),
  ).toContainText('0.20 EUR');
  await page.getByLabel('Commodity', { exact: true }).selectOption('');
  await expect(
    page.getByRole('table', {
      name: 'Expense categories · No commodity',
      exact: true,
    }),
  ).toContainText('0.30');
  await page.getByLabel('Search transactions').fill('not-present');
  await expect(
    page.getByText('No matching expense categories.', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Next expense categories page' }),
  ).toBeDisabled();
  await page.getByLabel('Search transactions').fill('');
  await page.getByLabel('From date', { exact: true }).fill('2024-02-01');
  await page.getByLabel('Through date', { exact: true }).fill('2024-01-01');
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);
  await page.getByRole('button', { name: 'Clear dates', exact: true }).click();
  await expect(
    page.getByRole('table', {
      name: 'Monthly spending · No commodity',
      exact: true,
    }),
  ).toContainText('0.30');
  await upload(
    page,
    '2024-01-01 Unsupported\n  expenses:food  1 USD @ 2 EUR\n  assets:cash\n',
  );
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);
});

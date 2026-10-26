import { expect, test } from '@playwright/test';

test('charts and paginated tables rank near-equal large spending exactly and drill into the top category', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  const journal = Array.from({ length: 32 }, (_, i) => {
    const suffix = String(i).padStart(2, '0');
    return `2024-01-01 Merchant ${suffix}\n  expenses:category-${suffix}  9007199254740993.${suffix} USD\n  assets:cash\n`;
  }).join('\n');
  await page.getByLabel('Import journal files').setInputFiles({
    name: 'ranking.journal',
    mimeType: 'text/plain',
    buffer: Buffer.from(journal),
  });
  await expect(page.getByLabel('Filtered totals')).toContainText(
    '288,230,376,151,711,780.96 USD',
  );
  const bars = page.getByRole('button', { name: /^Filter expenses:category-/ });
  await expect(bars).toHaveCount(30);
  await expect(bars.first()).toHaveAccessibleName(
    'Filter expenses:category-31',
  );
  await expect(bars.last()).toHaveAccessibleName('Filter expenses:category-02');
  await expect(
    page.getByRole('button', {
      name: 'Filter expenses:category-01',
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', {
      name: 'Filter expenses:category-31',
      exact: true,
    }),
  ).toContainText('9,007,199,254,740,993.31 USD');
  await page.getByRole('button', { name: 'Tables', exact: true }).click();
  const table = page.getByRole('table', {
    name: 'Expense categories · USD',
    exact: true,
  });
  await expect(table.getByRole('row')).toHaveCount(26);
  await expect(table.getByRole('row').nth(1)).toContainText(
    'expenses:category-31',
  );
  await expect(table.getByRole('row').last()).toContainText(
    'expenses:category-07',
  );
  await page
    .getByRole('button', { name: 'Next expense categories page' })
    .click();
  await expect(table.getByRole('row')).toHaveCount(8);
  await expect(table.getByRole('row').nth(1)).toContainText(
    'expenses:category-06',
  );
  await expect(table.getByRole('row').last()).toContainText(
    'expenses:category-00',
  );
  await page
    .getByRole('button', { name: 'Previous expense categories page' })
    .click();
  const top = page.getByRole('button', {
    name: 'Filter account expenses:category-31',
    exact: true,
  });
  await top.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Filtered totals')).toContainText(
    '9,007,199,254,740,993.31 USD',
  );
  await expect(top).toBeFocused();
  await expect(
    page.getByRole('table', { name: 'Transaction register' }),
  ).toHaveAttribute('aria-rowcount', '2');
  await page
    .getByRole('button', { name: '· Merchant 31', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toContainText(
    '9007199254740993.31 USD',
  );
  await expect(page.getByRole('dialog')).toContainText('ranking.journal:125');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page
    .getByRole('button', { name: 'Clear filters', exact: true })
    .click();
  await page.getByRole('button', { name: 'Charts', exact: true }).click();
  await expect(bars.first()).toHaveAccessibleName(
    'Filter expenses:category-31',
  );
  await expect(bars).toHaveCount(30);
});

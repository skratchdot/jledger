import { expect, test } from '@playwright/test';
const file = (name: string, text: string) => ({
  name,
  mimeType: 'text/plain',
  buffer: Buffer.from(text),
});

test('default commodities flow through includes, exact reports, comparisons and directive source explanations', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await page
    .getByLabel('Import journal files')
    .setInputFiles([
      file(
        'main.journal',
        'D 1.00 USD\ninclude child.journal\n2024-03-01 Parent USD\n  expenses:usd  0.20 = 0.30\n  assets:usd\n',
      ),
      file(
        'child.journal',
        '2024-02-29 Inherited USD\n  expenses:usd  0.10\n  assets:usd\nD 1.00 "Meal Credits"\n2024-03-01 Child credits\n  expenses:credits  0.07 = 0.07\n  assets:credits\n',
      ),
    ]);
  await page.getByLabel('Commodity', { exact: true }).selectOption('USD');
  await expect(page.getByLabel('Filtered totals')).toContainText('0.30 USD');
  const register = page.getByRole('table', { name: 'Transaction register' });
  await expect(register).toHaveAttribute('aria-rowcount', '3');
  await page.getByRole('button', { name: '· Parent USD', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('commodity from D at main.journal:1');
  await expect(dialog).toContainText(
    'assertion commodity from D at main.journal:1',
  );
  await expect(dialog).toContainText('balance checked: 0.30 USD');
  await expect(dialog.locator('pre')).toContainText(
    'expenses:usd  0.20 = 0.30',
  );
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByLabel('Month', { exact: true }).selectOption('2024-03');
  const comparison = page.getByRole('region', {
    name: 'Previous month comparison',
  });
  await expect(comparison).toContainText('0.10 USD');
  await expect(comparison).toContainText('Change: +0.10 USD');
  await expect(register).toHaveAttribute('aria-rowcount', '2');
  await page
    .getByLabel('Commodity', { exact: true })
    .selectOption('Meal Credits');
  await expect(page.getByLabel('Filtered totals')).toContainText(
    '0.07 "Meal Credits"',
  );
  await expect(register).toContainText('Child credits');
  await expect(register).not.toContainText('Parent USD');
  await page
    .getByRole('button', { name: '· Child credits', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toContainText(
    'commodity from D at child.journal:4',
  );
  await expect(page.getByRole('dialog')).toContainText(
    'assertion commodity from D at child.journal:4',
  );
});

test('unsupported default directives and financial syntax in children disable every report', async ({
  page,
}) => {
  await page.goto('./');
  for (const [directive, body, code] of [
    ['D 1 USD', '1', 'default-commodity'],
    ['D 1.00', '1', 'default-commodity'],
    ['decimal-mark ,\nD 1.00 USD', '1', 'default-commodity'],
    ['D 1.00 USD', '1 @ 2 EUR', 'amount'],
  ]) {
    await page
      .getByLabel('Import journal files')
      .setInputFiles([
        file('main.journal', 'include child.journal\n'),
        file(
          'child.journal',
          `${directive}\n2024-01-01 Invalid\n  expenses:food  ${body}\n  assets:cash\n`,
        ),
      ]);
    await expect(page.getByRole('alert')).toContainText('child.journal:');
    await expect(page.getByRole('alert')).toContainText(code!);
    await expect(page.getByRole('table')).toHaveCount(0);
    await expect(page.getByLabel('Filtered totals')).toHaveCount(0);
  }
});

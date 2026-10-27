import { expect, test } from '@playwright/test';

test('total assertions validate included aliased accounts and explain their scope in drill-down', async ({
  page,
}) => {
  await page.goto('./');
  const root =
    'alias bank = assets:bank\ncommodity "Meal Credits"\n  format 1.000,00 "Meal Credits"\n2024-01-01 Opening\n  bank  10,00 "Meal Credits"\n  equity:opening\n\n';
  const child =
    '2024-01-02 Purchase\n  expenses:food  0,10 "Meal Credits"\n  bank  -0,10 "Meal Credits" == 9,90 "Meal Credits"\n';
  const upload = async (parent: string, childText = child) => {
    await page.getByLabel('Import journal files').setInputFiles([
      {
        name: 'root.journal',
        mimeType: 'text/plain',
        buffer: Buffer.from(parent + 'include child.journal\n'),
      },
      {
        name: 'child.journal',
        mimeType: 'text/plain',
        buffer: Buffer.from(childText),
      },
    ]);
  };
  await upload(root);
  await expect(page.getByLabel('Filtered totals')).toContainText(
    '0.10 "Meal Credits"',
  );
  await page.getByRole('button', { name: '· Purchase', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText(
    'balance checked (direct account, all commodities): 9.90 "Meal Credits"',
  );
  await expect(page.getByRole('dialog')).toContainText(
    'original account bank; aliases from root.journal:1',
  );
  await expect(page.getByRole('dialog').locator('pre')).toContainText(
    '== 9,90 "Meal Credits"',
  );
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  const extra =
    root + '2024-01-01 Other commodity\n  bank  1 EUR\n  equity:opening\n\n';
  await upload(extra);
  await expect(page.getByRole('alert')).toContainText('child.journal:3');
  await expect(page.getByRole('alert')).toContainText(
    'Other nonzero balances: 1 EUR',
  );
  await expect(page.getByRole('table')).toHaveCount(0);
  await expect(page.getByLabel('Filtered totals')).toHaveCount(0);
  await upload(extra, child.replace('==', '= '));
  await page
    .getByLabel('Commodity', { exact: true })
    .selectOption({ value: 'Meal Credits' });
  await expect(page.getByLabel('Filtered totals')).toContainText(
    '0.10 "Meal Credits"',
  );
  await page.getByRole('button', { name: '· Purchase', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText(
    'balance checked: 9.90 "Meal Credits"',
  );
  await expect(page.getByRole('dialog')).not.toContainText('all commodities');
});

test('total assertions keep assignments and malformed forms fail-closed and recover after correction', async ({
  page,
}) => {
  await page.goto('./');
  const upload = (text: string) =>
    page.getByLabel('Import journal files').setInputFiles({
      name: 'total.journal',
      mimeType: 'text/plain',
      buffer: Buffer.from(text),
    });
  const valid =
    '2024-01-01 Opening\n  assets:cash  1 USD == 1 USD\n  equity:opening\n';
  await upload(valid);
  await expect(page.getByRole('table')).toHaveAttribute('aria-rowcount', '2');
  await upload(valid.replace('1 USD ==', '=='));
  await expect(page.getByRole('alert')).toContainText('balance-assignment');
  await expect(page.getByLabel('Filtered totals')).toHaveCount(0);
  await upload(valid.replace('==', '==**'));
  await expect(page.getByRole('alert')).toContainText(
    'balance-assertion-syntax',
  );
  await expect(page.getByRole('table')).toHaveCount(0);
  await upload(valid.replace('== 1 USD', '== 2 USD'));
  await expect(page.getByRole('alert')).toContainText(
    'expected 2 USD, calculated 1 USD',
  );
  await expect(page.getByRole('table')).toHaveCount(0);
  await upload(valid);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: '· Opening', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText(
    'balance checked (direct account, all commodities): 1.00 USD',
  );
});

import { expect, test } from '@playwright/test';

test('total-inclusive assertions explain scope through includes, aliases and defaults and reject child-only extra currencies', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  const child =
    '2024-01-01 Opening\n  bank:checking  10\n  equity:opening\n\n2024-01-02 Purchase\n  expenses:food  0.10\n  bank:checking\n';
  const extra = '\n2024-01-02 Extra\n  bank:checking  2 EUR\n  equity:eur\n';
  const upload = (operator = '==*', extras = '') =>
    page.getByLabel('Import journal files').setInputFiles([
      {
        name: 'main.journal',
        mimeType: 'text/plain',
        buffer: Buffer.from(
          `alias bank = assets:bank\nD 1.00 USD\ninclude child.journal\n2024-01-03 Checked parent\n  bank  0 ${operator} 9.90\n  equity:opening\n`,
        ),
      },
      {
        name: 'child.journal',
        mimeType: 'text/plain',
        buffer: Buffer.from(child + extras),
      },
    ]);
  await upload();
  await expect(page.getByLabel('Filtered totals')).toContainText('0.10 USD');
  await expect(
    page.getByRole('table', { name: 'Transaction register' }),
  ).toHaveAttribute('aria-rowcount', '4');
  await page
    .getByRole('button', { name: '· Checked parent', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toContainText(
    'balance checked (including subaccounts, all commodities): 9.90 USD',
  );
  await expect(page.getByRole('dialog')).toContainText(
    'assertion commodity from D at main.journal:2',
  );
  await expect(page.getByRole('dialog')).toContainText('original account bank');
  await expect(page.getByRole('dialog').locator('pre')).toContainText(
    '0 ==* 9.90',
  );
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByLabel('From date', { exact: true }).fill('2024-01-02');
  await page.getByLabel('Through date', { exact: true }).fill('2024-01-02');
  await expect(page.getByLabel('Filtered totals')).toContainText('0.10 USD');
  await expect(
    page.getByRole('table', { name: 'Transaction register' }),
  ).toHaveAttribute('aria-rowcount', '2');
  await upload('=*', extra);
  await page.getByLabel('Commodity', { exact: true }).selectOption('USD');
  await expect(page.getByLabel('Filtered totals')).toContainText('0.10 USD');
  await upload('==*', extra);
  await expect(page.getByRole('alert')).toContainText('main.journal:5');
  await expect(page.getByRole('alert')).toContainText(
    'Other nonzero balances: 2 EUR',
  );
  await expect(page.getByRole('alert')).toContainText(
    'every commodity in this account and its subaccounts',
  );
  await expect(page.getByRole('table')).toHaveCount(0);
  await expect(page.getByLabel('Filtered totals')).toHaveCount(0);
  await expect(
    page.getByRole('region', { name: /Previous .* comparison/ }),
  ).toHaveCount(0);
  await upload();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByLabel('Filtered totals')).toContainText('0.10 USD');
});

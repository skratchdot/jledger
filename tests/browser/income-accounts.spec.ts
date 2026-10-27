import { expect, test } from '@playwright/test';
const file = (text: string) => ({
  name: 'income.journal',
  mimeType: 'text/plain',
  buffer: Buffer.from(text),
});

test('income accounts page exact rankings, drill down with keyboard/history and reset after replacement', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  const text = Array.from({ length: 32 }, (_, i) => {
    const id = String(i).padStart(2, '0');
    return `2024-03-01 Employer ${id}\n  income:job-${id}  -9007199254740993.${id} USD\n  assets:cash\n`;
  }).join('\n');
  await page.getByLabel('Import journal files').setInputFiles(file(text));
  const disclosure = page.locator('.income-accounts');
  await expect(disclosure).not.toHaveAttribute('open');
  await expect(disclosure.locator('table')).toHaveCount(0);
  await disclosure.locator('summary').focus();
  await page.keyboard.press('Enter');
  const table = page.getByRole('table', {
    name: 'Income accounts · USD',
    exact: true,
  });
  await expect(
    table.getByRole('columnheader', { name: 'Net income', exact: true }),
  ).toBeVisible();
  await expect(table.getByRole('row')).toHaveCount(26);
  await expect(table.getByRole('row').nth(1)).toContainText('income:job-31');
  await expect(table.getByRole('row').nth(1)).toContainText(
    '9,007,199,254,740,993.31 USD',
  );
  await expect(page.getByLabel('Filtered totals')).toContainText(
    '288,230,376,151,711,780.96 USD',
  );
  await page.getByRole('button', { name: 'Next income accounts page' }).click();
  await expect(table.getByRole('row')).toHaveCount(8);
  await expect(table.getByRole('row').last()).toContainText('income:job-00');
  const account = page.getByRole('button', {
    name: 'Filter account income:job-00',
    exact: true,
  });
  await account.focus();
  await page.keyboard.press('Space');
  await expect(page.getByLabel('Filtered totals')).toContainText(
    '9,007,199,254,740,993.00 USD',
  );
  await expect(account).toBeFocused();
  await expect(table.getByRole('row')).toHaveCount(2);
  await expect(account).toHaveAttribute('aria-current', 'true');
  const register = page.getByRole('table', { name: 'Transaction register' });
  await expect(register).toHaveAttribute('aria-rowcount', '2');
  await page
    .getByRole('button', { name: '· Employer 00', exact: true })
    .click();
  await expect(page.getByRole('dialog').locator('pre')).toContainText(
    '-9007199254740993.00 USD',
  );
  await expect(page.getByRole('dialog')).toContainText('income.journal:1');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page
    .getByRole('button', { name: 'Undo filter change', exact: true })
    .click();
  await expect(table.getByRole('row')).toHaveCount(26);
  await disclosure.locator('summary').click();
  await expect(disclosure.locator('table')).toHaveCount(0);
  await page
    .getByLabel('Import journal files')
    .setInputFiles(
      file('2024-01-01 Replacement\n  income:new  -1 USD\n  assets:cash\n'),
    );
  await expect(page.getByLabel('Filtered totals')).toContainText('1.00 USD');
  await expect(disclosure).not.toHaveAttribute('open');
  await disclosure.locator('summary').click();
  await expect(table).toContainText('income:new');
  await expect(table).not.toContainText('income:job');
});

test('income breakdown follows typed aliases, split dates, status, currency and empty/invalid scopes', async ({
  page,
}) => {
  await page.goto('./');
  await page
    .getByLabel('Import journal files')
    .setInputFiles(
      file(
        'alias wages = revenus:paie\naccount revenus  ; type:R\n2024-01-01 * Split payroll\n  ! wages  -0.10 USD ; [2/29]\n  ! wages  -0.20 USD ; [3/1]\n  * wages  -10 USD ; [3/1]\n  ! revenus:euro  -2 EUR ; [3/1]\n  assets:cash  10.30 USD\n  assets:cash  2 EUR\n\n2024-03-01 ! Reversal\n  wages  0.03 USD\n  assets:cash\n',
      ),
    );
  await page.getByLabel('Commodity', { exact: true }).selectOption('USD');
  await page.locator('.income-accounts > summary').click();
  const table = page.getByRole('table', {
    name: 'Income accounts · USD',
    exact: true,
  });
  await page.getByLabel('Month', { exact: true }).selectOption('2024-03');
  await page.getByLabel('Status', { exact: true }).selectOption('!');
  await expect(table).toContainText('revenus:paie');
  await expect(table).toContainText('0.17 USD');
  await expect(page.getByLabel('Filtered totals')).toContainText('0.17 USD');
  await expect(
    page.getByRole('region', { name: 'Previous month comparison' }),
  ).toContainText('0.10 USD');
  await page.getByLabel('Search transactions').fill('missing');
  await expect(
    page.getByText('No matching income accounts.', { exact: true }),
  ).toBeVisible();
  await expect(table.getByRole('row')).toHaveCount(1);
  await page.getByLabel('Search transactions').fill('');
  await page.getByLabel('Commodity', { exact: true }).selectOption('EUR');
  const euro = page.getByRole('table', {
    name: 'Income accounts · EUR',
    exact: true,
  });
  await expect(euro).toContainText('revenus:euro');
  await expect(euro).toContainText('2.00 EUR');
  await expect(euro).not.toContainText('revenus:paie');
  await page
    .getByLabel('Import journal files')
    .setInputFiles(
      file(
        '2024-01-01 Invalid\n  income:salary  -1 USD @ 2 EUR\n  assets:cash\n',
      ),
    );
  await expect(page.getByRole('alert')).toContainText('Reports paused');
  await expect(page.locator('.income-accounts')).toHaveCount(0);
  await expect(page.getByLabel('Filtered totals')).toHaveCount(0);
});

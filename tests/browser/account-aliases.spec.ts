import { expect, test } from '@playwright/test';

test('literal aliases drive classification, exact reports, original-name search and source explanations', async ({
  page,
}) => {
  await page.goto('./');
  const root =
    'alias meals = dépenses:repas\naccount meals  ; type:X\ninclude child.journal\n2024-03-01 Parent meal\n  meals  0.20 USD = 0.20 USD\n  assets:cash\n\nend aliases\naccount meals  ; type:X\n2024-03-02 Refund\n  meals  -0.03 USD\n  assets:cash\n\nalias wages = income:salary\n2024-03-03 Salary\n  assets:cash  1000 USD\n  wages\n';
  const child =
    'alias meals = autres:repas\naccount meals  ; type:X\n2024-02-29 Child meal\n  meals  0.10 USD ; [3/1]\n  assets:cash\n';
  await page.getByLabel('Import journal files').setInputFiles([
    { name: 'root.journal', mimeType: 'text/plain', buffer: Buffer.from(root) },
    {
      name: 'child.journal',
      mimeType: 'text/plain',
      buffer: Buffer.from(child),
    },
  ]);
  await expect(page.getByLabel('Filtered totals')).toContainText('0.27 USD');
  await expect(page.getByLabel('Filtered totals')).toContainText(
    '1,000.00 USD',
  );
  await page.getByLabel('Search transactions').fill('meals');
  await expect(page.getByRole('table')).toHaveAttribute('aria-rowcount', '4');
  await expect(page.getByRole('table')).toContainText('dépenses:repas');
  await expect(page.getByRole('table')).toContainText('autres:repas');
  await page.getByRole('button', { name: '· Child meal', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText(
    'original account meals; aliases from child.journal:1',
  );
  await expect(page.getByRole('dialog')).toContainText(
    'declared on autres:repas at child.journal:2',
  );
  await expect(page.getByRole('dialog').locator('pre')).toContainText(
    'meals  0.10 USD',
  );
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page
    .getByRole('button', { name: 'Clear filters', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Filter dépenses:repas', exact: true })
    .click();
  await expect(page.getByLabel('Filtered totals')).toContainText('0.20 USD');
  await expect(page.getByRole('table')).toHaveAttribute('aria-rowcount', '2');
  await page
    .getByRole('button', { name: '· Parent meal', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toContainText(
    'original account meals; aliases from root.journal:1',
  );
  await expect(page.getByRole('dialog')).toContainText(
    'balance checked: 0.20 USD',
  );
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page
    .getByRole('button', { name: 'Clear filters', exact: true })
    .click();
  await page.getByLabel('Search transactions').fill('wages');
  await expect(page.getByRole('table')).toHaveAttribute('aria-rowcount', '2');
  await page.getByRole('button', { name: '· Salary', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText(
    'original account wages; aliases from root.journal:14',
  );
});

test('unsupported alias forms and failed assertions hide all reports, and fresh imports clear alias context', async ({
  page,
}) => {
  await page.goto('./');
  const text = '2024-01-01 Purchase\n  food  0.10 USD\n  assets:cash\n';
  const upload = (text: string) =>
    page.getByLabel('Import journal files').setInputFiles({
      name: 'alias.journal',
      mimeType: 'text/plain',
      buffer: Buffer.from(text),
    });
  await upload('alias food = expenses:food\n' + text);
  await expect(page.getByLabel('Filtered totals')).toContainText('0.10 USD');
  await upload('alias /food/ = expenses:food\n' + text);
  await expect(page.getByRole('alert')).toContainText('account-alias');
  await expect(page.getByRole('table')).toHaveCount(0);
  await upload('alias food = expenses:food ; note\n' + text);
  await expect(page.getByRole('alert')).toContainText('account-alias');
  await expect(page.getByLabel('Filtered totals')).toHaveCount(0);
  await upload(
    'alias food = expenses:food\n' +
      text.replace('0.10 USD', '0.10 USD = 0.20 USD'),
  );
  await expect(page.getByRole('alert')).toContainText('balance-assertion');
  await expect(page.getByRole('table')).toHaveCount(0);
  await upload(text);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('table')).toContainText('food');
  await expect(page.getByLabel('Filtered totals')).toContainText('0.00 USD');
  await page.getByRole('button', { name: '· Purchase', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toContainText('original account');
});

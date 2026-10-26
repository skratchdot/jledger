import { expect, test } from '@playwright/test';

test('quoted commodities flow through selected includes, exact reports, assertions and source details', async ({
  page,
}) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('./');
  const root =
    'commodity "Meal Credits"\n  format 1.000,00 "Meal Credits"\ninclude child.journal\n2024-03-01 Refund\n  expenses:food  -0,03 "Meal Credits"\n  assets:cash\n\n2024-04-01 Pay\n  assets:cash  1000 "USD"\n  income:salary\n\n2024-04-02 Fee\n  expenses:food  0.01 USD\n  assets:cash\n';
  const child =
    '2024-02-29 Purchase\n  expenses:food  0,10 "Meal Credits" = 0,10 "Meal Credits" ; [3/1]\n  assets:cash\n';
  await page.getByLabel('Import journal files').setInputFiles([
    { name: 'root.journal', mimeType: 'text/plain', buffer: Buffer.from(root) },
    {
      name: 'child.journal',
      mimeType: 'text/plain',
      buffer: Buffer.from(child),
    },
  ]);
  await expect(page.getByLabel('Filtered totals')).toContainText(
    '0.07 "Meal Credits"',
  );
  await page.getByRole('button', { name: 'Tables', exact: true }).click();
  const categories = page.getByRole('table', {
    name: 'Expense categories · Meal Credits',
    exact: true,
  });
  await expect(categories).toContainText('0.07 "Meal Credits"');
  await page.getByLabel('Month', { exact: true }).selectOption('2024-03');
  await expect(page.getByLabel('Filtered totals')).toContainText(
    '0.07 "Meal Credits"',
  );
  await categories
    .getByRole('button', { name: 'Filter account expenses:food', exact: true })
    .click();
  const register = page.getByRole('table', {
    name: 'Transaction register',
    exact: true,
  });
  await expect(register).toHaveAttribute('aria-rowcount', '3');
  await expect(register).toContainText('posted 2024-03-01');
  await page.getByRole('button', { name: '· Purchase', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('child.journal:1');
  await expect(page.getByRole('dialog')).toContainText(
    'balance checked: 0.10 "Meal Credits"',
  );
  await expect(page.getByRole('dialog').locator('pre')).toContainText(
    '0,10 "Meal Credits"',
  );
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page
    .getByRole('button', { name: 'Clear filters', exact: true })
    .click();
  await page.getByLabel('Commodity', { exact: true }).selectOption('USD');
  await expect(page.getByLabel('Filtered totals')).toContainText(
    '1,000.00 USD',
  );
  await expect(page.getByLabel('Filtered totals')).toContainText('0.01 USD');
  await expect(
    page.getByLabel('Commodity', { exact: true }).getByRole('option'),
  ).toHaveCount(2);
  expect(
    requests.every(
      (url) =>
        new URL(url).hostname === '127.0.0.1' &&
        !/api\/journals|root\.journal|child\.journal/.test(url),
    ),
  ).toBe(true);
});

test('literal commodity spacing and numeric names remain distinct, while malformed syntax pauses every report', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  const text =
    '2024-01-01 One space\n  expenses:food  0.10 "US Dollar"\n  assets:cash\n\n2024-01-02 Two spaces\n  expenses:food  0.20 "US  Dollar"\n  assets:cash\n\n2024-01-03 Numeric\n  expenses:food  9007199254740993.01 "123"\n  assets:cash\n';
  const input = page.getByLabel('Import journal files');
  const upload = (text: string) =>
    input.setInputFiles({
      name: 'literal.journal',
      mimeType: 'text/plain',
      buffer: Buffer.from(text),
    });
  await upload(text);
  await expect(page.getByLabel('Filtered totals')).toContainText(
    '9,007,199,254,740,993.01 "123"',
  );
  await page
    .getByLabel('Commodity', { exact: true })
    .selectOption({ value: 'US  Dollar' });
  await expect(page.getByLabel('Filtered totals')).toContainText(
    '0.20 "US  Dollar"',
  );
  await page.getByRole('button', { name: 'Tables', exact: true }).click();
  const categories = page.getByRole('table', {
    name: 'Expense categories · US Dollar',
  });
  await expect(categories.locator('tbody td')).toHaveText('0.20 "US  Dollar"');
  expect(
    await categories
      .locator('tbody td')
      .evaluate((node) => getComputedStyle(node).whiteSpace),
  ).toBe('pre-wrap');
  await page
    .getByLabel('Commodity', { exact: true })
    .selectOption({ value: 'US Dollar' });
  await expect(page.getByLabel('Filtered totals')).toContainText(
    '0.10 "US Dollar"',
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await upload(
    text +
      '\n2024-01-04 Cost\n  expenses:food  1 "US Dollar" @ 2 USD\n  assets:cash\n',
  );
  await expect(page.getByRole('alert')).toContainText('Reports paused');
  await expect(page.getByRole('table')).toHaveCount(0);
  await upload('commodity "Unclosed\n' + text);
  await expect(page.getByRole('alert')).toContainText('commodity-format');
  await expect(page.getByLabel('Filtered totals')).toHaveCount(0);
  await upload(text);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page
    .getByLabel('Commodity', { exact: true })
    .selectOption({ value: 'US  Dollar' });
  await expect(page.getByLabel('Filtered totals')).toContainText(
    '0.20 "US  Dollar"',
  );
});

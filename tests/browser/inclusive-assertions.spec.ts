import { expect, test } from '@playwright/test';

test('inclusive assertions explain scope through aliases/includes and fail closed after replacement', async ({
  page,
}) => {
  await page.goto('./');
  const root =
    'alias bank = assets:bank\ncommodity "Meal Credits"\n  format 1.000,00 "Meal Credits"\n2024-01-01 Opening\n  bank:checking  10,00 "Meal Credits"\n  equity:opening\n\ninclude child.journal\n';
  const child =
    '2024-01-02 Purchase\n  expenses:food  0,10 "Meal Credits"\n  bank:checking  -0,10 "Meal Credits"\n\n2024-01-02 Statement\n  bank  0,01 "Meal Credits" =* 9,91 "Meal Credits"\n  equity:opening\n';
  const upload = async (text = child) => {
    await page.getByLabel('Import journal files').setInputFiles([
      {
        name: 'root.journal',
        mimeType: 'text/plain',
        buffer: Buffer.from(root),
      },
      {
        name: 'child.journal',
        mimeType: 'text/plain',
        buffer: Buffer.from(text),
      },
    ]);
  };
  await upload();
  await expect(page.getByLabel('Filtered totals')).toContainText(
    '0.10 "Meal Credits"',
  );
  await page.getByRole('button', { name: '· Statement', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText(
    'balance checked (including subaccounts, one commodity): 9.91 "Meal Credits"',
  );
  await expect(page.getByRole('dialog')).toContainText(
    'original account bank; aliases from root.journal:1',
  );
  await expect(page.getByRole('dialog').locator('pre')).toContainText(
    '=* 9,91 "Meal Credits"',
  );
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  // A direct check would see only the parent's 0.01; changing syntax changes scope.
  await upload(child.replace('=*', '='));
  await expect(page.getByRole('alert')).toContainText('child.journal:6');
  await expect(page.getByRole('alert')).toContainText(
    'calculated 0.01 "Meal Credits"',
  );
  await expect(page.getByLabel('Filtered totals')).toHaveCount(0);
  await upload(child.replace('=* 9,91', '=* 9,92'));
  await expect(page.getByRole('alert')).toContainText(
    'calculated 9.91 "Meal Credits"',
  );
  await expect(page.getByRole('alert')).toContainText(
    'Checks this account and its subaccounts in the asserted commodity',
  );
  await expect(page.getByRole('table')).toHaveCount(0);
  await upload(child.replace('0,01 "Meal Credits" =*', '=*'));
  await expect(page.getByRole('alert')).toContainText('balance-assignment');
  await expect(page.getByRole('table')).toHaveCount(0);
  await upload(child.replace('=*', '==**'));
  await expect(page.getByRole('alert')).toContainText(
    'balance-assertion-syntax',
  );
  await expect(page.getByLabel('Filtered totals')).toHaveCount(0);
  await upload();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByLabel('Filtered totals')).toContainText(
    '0.10 "Meal Credits"',
  );
});

test('multi-file repeated inclusive checks preserve exact totals, responsiveness and final source inspection', async ({
  page,
}) => {
  await page.goto('./');
  const files: { name: string; mimeType: string; buffer: Buffer }[] = [];
  let root =
    'alias bank = assets:bank\n2024-01-01 Opening\n  bank:savings  1000.00 USD\n  equity:opening\n\n';
  for (let month = 1; month <= 4; month++) {
    const name = `month-${month}.journal`;
    root += `include ${name}\n`;
    const date = `2024-${String(month).padStart(2, '0')}-28`;
    let text = '';
    for (let n = 0; n < 3000; n++) {
      text += `${date} Purchase ${month}-${n}\n  expenses:food  0.01 USD\n  bank:checking\n\n`;
    }
    const cents = String(100000n - BigInt(month) * 3000n);
    const expected = `${cents.slice(0, -2)}.${cents.slice(-2)}`;
    text += `${date} Statement ${month}\n  bank  0 USD =* ${expected} USD\n  equity:opening\n`;
    files.push({ name, mimeType: 'text/plain', buffer: Buffer.from(text) });
  }
  files.unshift({
    name: 'root.journal',
    mimeType: 'text/plain',
    buffer: Buffer.from(root),
  });
  await page.getByLabel('Import journal files').setInputFiles(files);
  // Input stays usable while the worker parses, checks and indexes the bundle.
  const search = page.getByLabel('Search transactions');
  const started = Date.now();
  await search.fill('Statement 4');
  expect(Date.now() - started).toBeLessThan(1000);
  await expect(
    page.getByRole('button', { name: '· Statement 4', exact: true }),
  ).toBeVisible();
  await search.fill('');
  await expect(page.getByLabel('Filtered totals')).toContainText('120.00 USD');
  await expect(page.getByRole('table')).toHaveAttribute(
    'aria-rowcount',
    '12006',
  );
  expect(await page.getByRole('row').count()).toBeLessThan(50);
  await search.fill('Statement 4');
  await page
    .getByRole('button', { name: '· Statement 4', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toContainText(
    'balance checked (including subaccounts, one commodity): 880.00 USD',
  );
  await expect(page.getByRole('dialog')).toContainText('month-4.journal:12001');
  await expect(page.getByRole('dialog').locator('pre')).toContainText(
    '=* 880.00 USD',
  );
});

import { expect, test } from '@playwright/test';

test('included continuation dates drive filters and comparisons and explain final-posting source', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  const file = (name: string, text: string) => ({
    name,
    mimeType: 'text/plain',
    buffer: Buffer.from(text),
  });
  await page
    .getByLabel('Import journal files')
    .setInputFiles([
      file('main.journal', 'Y2020\ninclude child.journal\n'),
      file(
        'child.journal',
        '2024-03-01 ! Split\n  expenses:food  0.10 USD\n    ; ordinary note\n    ; [2/29]\n  assets:cash\n    ; date:3/2\n',
      ),
    ]);
  await expect(page.getByLabel('Filtered totals')).toContainText('0.10 USD');
  await page.getByLabel('Month', { exact: true }).selectOption('2024-02');
  const register = page.getByRole('table', { name: 'Transaction register' });
  await expect(register).toHaveAttribute('aria-rowcount', '2');
  await expect(register).toContainText('2024-03-01');
  await expect(register).toContainText('posted 2024-02-29');
  await expect(register).not.toContainText('assets:cash');
  await page.getByRole('button', { name: '! Split', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText(
    'date from continuation at child.journal:4',
  );
  await expect(dialog).toContainText(
    'date from continuation at child.journal:6',
  );
  await expect(dialog).toContainText('posted 2024-03-02');
  await expect(dialog.locator('pre')).toContainText('; date:3/2');
  await expect(dialog.locator('pre')).toContainText('; ordinary note');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByLabel('Month', { exact: true }).selectOption('2024-03');
  await expect(page.getByLabel('Filtered totals')).toContainText('0.00 USD');
  await expect(register).toContainText('assets:cash');
  await expect(register).toContainText('posted 2024-03-02');
  await expect(register).not.toContainText('expenses:food');
  const comparison = page.getByRole('region', {
    name: 'Previous month comparison',
  });
  await expect(comparison).toContainText('0.10 USD');
  await expect(comparison).toContainText('Change: -0.10 USD');
  await page.getByLabel('From date', { exact: true }).fill('2024-03-02');
  await page.getByLabel('Through date', { exact: true }).fill('2024-03-02');
  await expect(register).toHaveAttribute('aria-rowcount', '2');
  await expect(register).toContainText('posted 2024-03-02');
  await page
    .getByLabel('Import journal files')
    .setInputFiles(
      file(
        'asserted.journal',
        '2024-01-01 Assertion\n  assets:cash  10 USD\n    ; [1/3]\n  assets:cash  -1 USD = -1 USD\n    ; [1/2]\n  equity:opening  -9 USD\n',
      ),
    );
  await expect(
    page.getByRole('table', { name: 'Transaction register' }),
  ).toHaveAttribute('aria-rowcount', '2');
  await page.getByRole('button', { name: '· Assertion', exact: true }).click();
  await expect(page.getByRole('dialog').locator('pre')).toContainText(
    '; [1/2]',
  );
});

test('duplicate, secondary and orphaned continuation dates pause every report with the comment location', async ({
  page,
}) => {
  await page.goto('./');
  for (const [name, text, line] of [
    [
      'duplicate',
      '2024-01-01 Duplicate\n  expenses:food  1 USD ; [2/1]\n    ; [2/2]\n  assets:cash\n',
      3,
    ],
    [
      'secondary',
      '2024-01-01 Secondary\n  expenses:food  1 USD\n    ; [=2/1]\n  assets:cash\n',
      3,
    ],
    [
      'orphan',
      '2024-01-01 Orphan\n    ; [2/1]\n  expenses:food  1 USD\n  assets:cash\n',
      2,
    ],
  ] as const) {
    await page.getByLabel('Import journal files').setInputFiles({
      name: `${name}.journal`,
      mimeType: 'text/plain',
      buffer: Buffer.from(text),
    });
    await expect(page.getByRole('alert')).toContainText(
      `${name}.journal:${line}`,
    );
    await expect(page.getByRole('alert')).toContainText('posting-date');
    await expect(page.getByRole('table')).toHaveCount(0);
    await expect(page.getByLabel('Filtered totals')).toHaveCount(0);
    await expect(
      page.getByRole('region', { name: /Previous .* comparison/ }),
    ).toHaveCount(0);
  }
});

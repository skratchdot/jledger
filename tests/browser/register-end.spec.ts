import { expect, test } from '@playwright/test';

test('the final full-register transaction remains visible and actionable after large jumps', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto('./');
  await page.getByRole('button', { name: 'Explore sample journal' }).click();
  await expect(page.getByRole('table')).toContainText('Northwind');
  const count = 200_000;
  await page.getByLabel('Import journal files').setInputFiles({
    name: 'end.journal',
    mimeType: 'text/plain',
    buffer: Buffer.from(
      Array.from(
        { length: count },
        (_, i) =>
          `2024-01-01 * Transaction ${i}\n  expenses:coffee  0.01 USD\n  assets:cash\n\n`,
      ).join(''),
    ),
  });
  const register = page.getByRole('table', { name: 'Transaction register' });
  await expect(register).toHaveAttribute('aria-rowcount', String(count + 1), {
    timeout: 30_000,
  });
  await page.getByLabel('Search transactions').fill('Transaction 199999');
  await expect(register).toHaveAttribute('aria-rowcount', '2');
  await page
    .getByRole('button', { name: 'Clear filters', exact: true })
    .click();
  await expect(register).toHaveAttribute('aria-rowcount', String(count + 1));
  await page.getByLabel('From date', { exact: true }).fill('2024-01-02');
  await expect(register).toHaveAttribute('aria-rowcount', '1');
  await page.getByLabel('From date', { exact: true }).fill('2024-01-01');
  await page.getByLabel('Through date', { exact: true }).fill('2024-01-01');
  await expect(register).toHaveAttribute('aria-rowcount', String(count + 1));
  await expect(register.getByRole('columnheader')).toHaveCount(4);
  await expect(register).toHaveAttribute('aria-colcount', '4');
  const scroll = page.getByLabel('Scrollable transaction register');
  await scroll.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  const last = register.getByRole('button', {
    name: '* Transaction 199999',
    exact: true,
  });
  await expect(last).toBeAttached();
  const isInsideScrollport = () =>
    last.evaluate((button) => {
      const clip = button.closest('.virtual-register')!.getBoundingClientRect();
      const rect = button.getBoundingClientRect();
      return rect.top >= clip.top && rect.bottom <= clip.bottom;
    });
  await expect.poll(isInsideScrollport).toBe(true);
  expect(await register.locator('tbody tr').count()).toBeLessThan(50);
  await last.click({ timeout: 5000 });
  await expect(page.getByRole('dialog')).toContainText('Transaction 199999');
  await expect(page.getByRole('dialog')).toContainText('end.journal:799997');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await scroll.evaluate((el) => {
    el.scrollTop = el.scrollHeight / 2;
  });
  await expect(register.locator('tr[aria-rowindex="100001"]')).toBeAttached();
  await scroll.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect.poll(isInsideScrollport).toBe(true);
  expect(await register.locator('tbody tr').count()).toBeLessThan(50);
  await last.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog').locator('pre')).toHaveText(
    '2024-01-01 * Transaction 199999\n  expenses:coffee  0.01 USD\n  assets:cash',
  );
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByLabel('Search transactions').fill('Transaction 0');
  await expect(register).toHaveAttribute('aria-rowcount', '2');
  await expect(
    register.getByRole('button', { name: '* Transaction 0', exact: true }),
  ).toBeAttached();
  await expect.poll(() => scroll.evaluate((el) => el.scrollTop)).toBe(0);
});

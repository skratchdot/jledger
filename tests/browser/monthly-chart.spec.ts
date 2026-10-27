import { expect, test } from '@playwright/test';

test('monthly chart pages stay bounded with a shared scale, keyboard drill-down and focus recovery', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  const journal = Array.from({ length: 121 }, (_, i) => {
    const month = `${2010 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
    const amount = i === 0 ? '2' : i === 120 ? '-0.5' : i === 119 ? '0' : '1';
    return `${month}-01 Purchase ${i}\n  expenses:food  ${amount} USD\n  assets:cash\n`;
  }).join('\n');
  const upload = () =>
    page.getByLabel('Import journal files').setInputFiles({
      name: 'months.journal',
      mimeType: 'text/plain',
      buffer: Buffer.from(journal),
    });
  await upload();
  const chart = page.getByRole('region', {
    name: 'Monthly spending chart',
    exact: true,
  });
  const bars = chart.getByRole('button', { name: /^Filter month / });
  const next = chart.getByRole('button', { name: 'Next monthly chart page' });
  const previous = chart.getByRole('button', {
    name: 'Previous monthly chart page',
  });
  await expect(bars).toHaveCount(12);
  await expect(chart.getByRole('status')).toHaveText('1–12 of 121 months');
  await expect(previous).toBeDisabled();
  await expect(bars.first().locator('.column-track > div')).toHaveAttribute(
    'style',
    'height: 100%;',
  );
  await next.focus();
  await page.keyboard.press('Enter');
  await expect(next).toBeFocused();
  await expect(chart.getByRole('status')).toHaveText('13–24 of 121 months');
  await expect(bars.first().locator('.column-track > div')).toHaveAttribute(
    'style',
    'height: 50%;',
  );
  for (let i = 0; i < 8; i++) {
    await next.click();
    await expect(bars).toHaveCount(12);
  }
  const zeroBar = chart
    .getByRole('button', { name: 'Filter month 2019-12', exact: true })
    .locator('.column-track > div');
  await expect
    .poll(() => zeroBar.evaluate((el) => el.getBoundingClientRect().height))
    .toBe(0);
  // Horizontal browsing on a narrow display resets when changing pages.
  await chart.locator('.monthly-chart').evaluate((el) => {
    el.scrollLeft = el.scrollWidth;
  });
  await next.click();
  await expect(bars).toHaveCount(1);
  await expect(chart.getByRole('status')).toHaveText('121–121 of 121 months');
  await expect(next).toBeDisabled();
  await expect
    .poll(() => chart.locator('.monthly-chart').evaluate((el) => el.scrollLeft))
    .toBe(0);
  const finalMonth = chart.getByRole('button', {
    name: 'Filter month 2020-01',
    exact: true,
  });
  await expect(finalMonth).toContainText('-0.50 USD');
  await expect(finalMonth.locator('.column-track > div')).toHaveAttribute(
    'style',
    'height: 25%;',
  );
  await finalMonth.focus();
  await page.keyboard.press('Space');
  await expect(chart.getByRole('status')).toHaveText('1–1 of 1 months');
  await expect(finalMonth).toHaveAttribute('aria-pressed', 'true');
  await expect(finalMonth).toBeFocused();
  await expect(
    page.getByRole('table', { name: 'Transaction register' }),
  ).toHaveAttribute('aria-rowcount', '2');
  await page
    .getByRole('button', { name: '· Purchase 120', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toContainText('-0.5 USD');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await finalMonth.focus();
  await page.keyboard.press('Enter');
  await expect(chart.getByRole('status')).toHaveText('1–12 of 121 months');
  await expect(chart).toBeFocused();
  await expect(bars).toHaveCount(12);
  await next.click();
  await upload();
  await expect(chart.getByRole('status')).toHaveText('1–12 of 121 months');
  await expect(previous).toBeDisabled();
});

test('monthly chart empties for unmatched filters and unmounts for invalid reports', async ({
  page,
}) => {
  await page.goto('./');
  await page.getByLabel('Import journal files').setInputFiles({
    name: 'empty.journal',
    mimeType: 'text/plain',
    buffer: Buffer.from(
      '2024-01-01 Purchase\n  expenses:food  0.10 USD\n  assets:cash\n',
    ),
  });
  const chart = page.getByRole('region', {
    name: 'Monthly spending chart',
    exact: true,
  });
  await expect(
    chart.getByRole('button', { name: 'Filter month 2024-01' }),
  ).toBeVisible();
  // A date scope outside the journal removes all month aggregates.
  await page.getByLabel('From date', { exact: true }).fill('2025-01-01');
  await expect(chart.getByRole('status')).toHaveText('0 months');
  await expect(chart).toContainText('No matching months.');
  await expect(
    chart.getByRole('button', { name: 'Next monthly chart page' }),
  ).toBeDisabled();
  await page.getByLabel('Import journal files').setInputFiles({
    name: 'invalid.journal',
    mimeType: 'text/plain',
    buffer: Buffer.from(
      '2024-01-01 Unsupported\n  expenses:food  1 USD @ 2 EUR\n  assets:cash\n',
    ),
  });
  await expect(chart).toHaveCount(0);
});

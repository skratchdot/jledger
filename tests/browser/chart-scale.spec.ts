import { expect, test } from '@playwright/test';

for (const scale of ['huge', 'tiny'] as const) {
  test(`${scale} quantities keep proportional category and monthly bars`, async ({
    page,
  }) => {
    await page.goto('./');
    const full =
      scale === 'huge' ? '2' + '0'.repeat(400) : '0.' + '0'.repeat(400) + '2';
    const half =
      scale === 'huge' ? '1' + '0'.repeat(400) : '0.' + '0'.repeat(400) + '1';
    await page.getByLabel('Import journal files').setInputFiles({
      name: 'chart-scale.journal',
      mimeType: 'text/plain',
      buffer: Buffer.from(
        `2024-01-01 Full\n  expenses:full  ${full} USD\n  assets:cash\n\n2024-02-01 Half refund\n  expenses:half  -${half} USD\n  assets:cash\n\n2024-03-01 Zero\n  expenses:zero  0 USD\n  assets:cash\n`,
      ),
    });
    const fullBar = page.getByRole('button', {
      name: 'Filter expenses:full',
      exact: true,
    });
    const halfBar = page.getByRole('button', {
      name: 'Filter expenses:half',
      exact: true,
    });
    await expect
      .poll(() =>
        fullBar
          .locator('.bar-track > div')
          .evaluate((el) => (el as HTMLElement).style.width),
      )
      .toBe('100%');
    await expect
      .poll(() =>
        halfBar
          .locator('.bar-track > div')
          .evaluate((el) => (el as HTMLElement).style.width),
      )
      .toBe('50%');
    await expect(
      page
        .getByRole('button', { name: 'Filter expenses:zero', exact: true })
        .locator('.bar-track > div'),
    ).toHaveAttribute('style', /width: 0%/);
    for (const [month, height] of [
      ['01', '100%'],
      ['02', '50%'],
      ['03', '0%'],
    ]) {
      await expect
        .poll(() =>
          page
            .getByRole('button', {
              name: `Filter month 2024-${month}`,
              exact: true,
            })
            .locator('.column-track > div')
            .evaluate((el) => (el as HTMLElement).style.height),
        )
        .toBe(height);
    }
    await halfBar.click();
    await expect(
      page.getByRole('table', { name: 'Transaction register' }),
    ).toHaveAttribute('aria-rowcount', '2');
    await page
      .getByRole('button', { name: '· Half refund', exact: true })
      .click();
    await expect(page.getByRole('dialog')).toContainText(`-${half} USD`);
  });
}

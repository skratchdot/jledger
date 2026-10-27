import { expect, test, type Page } from '@playwright/test';

declare global {
  interface Window {
    currencyProbe: {
      hold: boolean;
      releasing: boolean;
      held: {
        worker: Worker;
        data: { type: 'report'; id: number; report: { commodity: string } };
      }[];
      release: (commodity: string) => void;
    };
  }
}

async function deferReports(page: Page) {
  await page.addInitScript(() => {
    const state: Window['currencyProbe'] = {
      hold: false,
      releasing: false,
      held: [],
      release(commodity) {
        const index = this.held.findIndex(
          (entry) => entry.data.report.commodity === commodity,
        );
        if (index < 0)
          throw new Error('No held report for requested commodity');
        const [entry] = this.held.splice(index, 1);
        this.releasing = true;
        try {
          entry!.worker.dispatchEvent(
            new MessageEvent('message', { data: entry!.data }),
          );
        } finally {
          this.releasing = false;
        }
      },
    };
    window.currencyProbe = state;
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        // Hold actual computed replies, preserving worker query delivery/order.
        this.addEventListener(
          'message',
          (event) => {
            if (!state.hold || state.releasing || event.data.type !== 'report')
              return;
            event.stopImmediatePropagation();
            state.held.push({ worker: this, data: event.data });
          },
          true,
        );
      }
    };
  });
}
const file = {
  name: 'currency.journal',
  mimeType: 'text/plain',
  buffer: Buffer.from(
    '2024-01-01 USD salary\n  income:salary  -10 USD\n  assets:cash\n\n' +
      '2024-01-02 USD purchase\n  expenses:food  0.10 USD\n  assets:cash\n\n' +
      '2024-01-01 EUR salary\n  income:salary  -20 EUR\n  assets:cash\n\n' +
      '2024-01-02 EUR purchase\n  expenses:food  0.20 EUR\n  assets:cash\n\n' +
      '2024-01-02 Unitless purchase\n  expenses:food  0.30\n  assets:cash\n',
  ),
};
const waitForHeld = async (page: Page, commodity: string) => {
  await expect
    .poll(() =>
      page.evaluate(
        (commodity) =>
          window.currencyProbe.held.some(
            (entry) => entry.data.report.commodity === commodity,
          ),
        commodity,
      ),
    )
    .toBe(true);
};

test('metrics, charts and tables retain committed currency while a real worker reply is pending', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await deferReports(page);
  await page.goto('./');
  await page.getByLabel('Import journal files').setInputFiles(file);
  await page.getByLabel('Commodity', { exact: true }).selectOption('USD');
  const totals = page.getByLabel('Filtered totals');
  await expect(totals).toContainText('10.00 USD');
  await expect(totals).toContainText('0.10 USD');
  await page.locator('.income-accounts > summary').click();
  await expect(
    page.getByRole('table', { name: 'Income accounts · USD', exact: true }),
  ).toContainText('10.00 USD');
  await page.evaluate(() => {
    window.currencyProbe.hold = true;
  });
  await page.getByLabel('Commodity', { exact: true }).selectOption('EUR');
  await waitForHeld(page, 'EUR');
  await expect(totals).toHaveAttribute('aria-busy', 'true');
  await expect(totals).toContainText('10.00 USD');
  await expect(totals).toContainText('0.10 USD');
  await expect(totals).not.toContainText('EUR');
  await expect(totals).toContainText('Report updating');
  const chart = page.getByRole('button', {
    name: 'Filter expenses:food',
    exact: true,
  });
  await expect(chart).toContainText('0.10 USD');
  const monthly = page.getByRole('button', {
    name: 'Filter month 2024-01',
    exact: true,
  });
  await expect(monthly).toContainText('0.10 USD');
  await expect(monthly).toBeDisabled();
  const monthlyChart = page.getByRole('region', {
    name: 'Monthly spending chart',
    exact: true,
  });
  await expect(monthlyChart).toHaveAttribute('aria-busy', 'true');
  await expect(
    monthlyChart.getByRole('button', { name: 'Next monthly chart page' }),
  ).toBeDisabled();
  await expect(
    monthlyChart.getByRole('button', { name: 'Previous monthly chart page' }),
  ).toBeDisabled();

  await expect(page.locator('#spending-panels')).toHaveAttribute(
    'aria-busy',
    'true',
  );
  await page.getByRole('button', { name: 'Tables', exact: true }).click();
  await expect(
    page.getByRole('table', { name: 'Expense categories · USD', exact: true }),
  ).toContainText('0.10 USD');
  await expect(
    page.getByRole('table', { name: 'Monthly spending · USD', exact: true }),
  ).toContainText('0.10 USD');
  await expect(
    page.getByRole('table', { name: 'Income accounts · USD', exact: true }),
  ).toContainText('10.00 USD');
  await page.evaluate(() => window.currencyProbe.release('EUR'));
  await expect(totals).toHaveAttribute('aria-busy', 'false');
  await expect(totals).toContainText('20.00 EUR');
  await expect(totals).toContainText('0.20 EUR');
  await expect(
    page.getByRole('table', { name: 'Expense categories · EUR', exact: true }),
  ).toContainText('0.20 EUR');
  await expect(
    page.getByRole('table', { name: 'Monthly spending · EUR', exact: true }),
  ).toContainText('0.20 EUR');
  await expect(
    page.getByRole('table', { name: 'Income accounts · EUR', exact: true }),
  ).toContainText('20.00 EUR');
  await page.getByLabel('Commodity', { exact: true }).selectOption('');
  await waitForHeld(page, '');
  await expect(totals).toContainText('0.20 EUR');
  await expect(
    page.getByRole('table', { name: 'Expense categories · EUR', exact: true }),
  ).toContainText('0.20 EUR');
  await page.evaluate(() => window.currencyProbe.release(''));
  await expect(
    page.getByRole('table', {
      name: 'Expense categories · No commodity',
      exact: true,
    }),
  ).toContainText('0.30');
  await expect(totals).not.toContainText('EUR');
});

test('a superseded currency report cannot replace newer labels or values', async ({
  page,
}) => {
  await deferReports(page);
  await page.goto('./');
  await page.getByLabel('Import journal files').setInputFiles(file);
  await page.getByLabel('Commodity', { exact: true }).selectOption('USD');
  await expect(page.getByLabel('Filtered totals')).toContainText('0.10 USD');
  await page.evaluate(() => {
    window.currencyProbe.hold = true;
  });
  await page.getByLabel('Commodity', { exact: true }).selectOption('EUR');
  await waitForHeld(page, 'EUR');
  await page.getByLabel('Commodity', { exact: true }).selectOption('USD');
  await waitForHeld(page, 'USD');
  await page.evaluate(() => window.currencyProbe.release('USD'));
  await expect(page.getByLabel('Filtered totals')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  await page.evaluate(() => window.currencyProbe.release('EUR'));
  await expect(page.getByLabel('Filtered totals')).toContainText('0.10 USD');
  await expect(page.getByLabel('Filtered totals')).not.toContainText('EUR');
  await expect(
    page.getByRole('table', { name: 'Transaction register' }),
  ).toContainText('USD purchase');
  await expect(
    page.getByRole('table', { name: 'Transaction register' }),
  ).not.toContainText('EUR purchase');
});

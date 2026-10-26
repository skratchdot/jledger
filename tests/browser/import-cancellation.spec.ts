import { expect, test, type BrowserContext, type Page } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

declare global {
  interface Window {
    importProbe: {
      workers: Worker[];
      terminated: number[];
      loads: number[];
      progress: { phase: string; completed?: number; total?: number }[];
    };
  }
}

async function trackWorkers(page: Page, context: BrowserContext) {
  await page.addInitScript(() => {
    const state = (window.importProbe = {
      workers: [],
      terminated: [],
      loads: [],
      progress: [],
    } as Window['importProbe']);
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      index: number;
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.index = state.workers.length;
        state.workers.push(this);
        this.addEventListener('message', ({ data }) => {
          if (data.type === 'progress') state.progress.push(data.progress);
        });
      }
      postMessage(message: { type: string; id: number }) {
        if (message.type === 'load') state.loads[this.index] = message.id;
        super.postMessage(message);
      }
      terminate() {
        state.terminated.push(this.index);
        super.terminate();
      }
    };
  });
  let stall = false;
  await context.route('**/assets/journal.worker-*.js', async (route) => {
    if (!stall) return route.continue();
    stall = false;
    // An actual non-yielding worker proves cancellation does not depend on the
    // parser servicing a queued message. Use same-origin code under the app CSP.
    await route.fulfill({
      contentType: 'text/javascript',
      body: `
      self.onmessage = ({data}) => {
        self.postMessage({type:'progress',id:data.id,progress:{phase:'processing'}});
        while (true) {}
      };
    `,
    });
  });
  return () => {
    stall = true;
  };
}
const file = (name: string, text: string) => ({
  name,
  mimeType: 'text/plain',
  buffer: Buffer.from(text),
});
const small =
  '2024-01-01 Kept purchase\n  expenses:food  0.10 USD\n  assets:cash\n';
async function injectLateReply(page: Page, index: number) {
  await page.evaluate((index) => {
    const state = window.importProbe,
      target = state.workers[index]!;
    const id = state.loads[index];
    for (const data of [
      {
        type: 'progress',
        id,
        progress: { phase: 'reading', completed: 999, total: 999 },
      },
      { type: 'error', id, message: 'Late failure must be ignored' },
      {
        type: 'loaded',
        id,
        summary: {
          names: ['late.journal'],
          diagnosticCount: 0,
          diagnostics: [],
          transactionCount: 999,
          accountCount: 0,
          accountRollupCount: 0,
          commodities: [],
          months: [],
        },
      },
    ])
      target.onmessage?.call(target, new MessageEvent('message', { data }));
  }, index);
}

test('cancelling a non-yielding replacement preserves filters, presets, accounts and the committed worker', async ({
  page,
  context,
}) => {
  const stallNext = await trackWorkers(page, context);
  await page.goto('./');
  await page
    .getByLabel('Import journal files')
    .setInputFiles([
      file('root.journal', 'include child.journal\n' + small),
      file(
        'child.journal',
        '2024-01-02 Kept tea\n  expenses:tea  0.20 USD\n  assets:cash\n',
      ),
    ]);
  await expect(page.getByLabel('Filtered totals')).toContainText('0.30 USD');
  const progress = await page.evaluate(() => window.importProbe.progress);
  expect(progress).toContainEqual({ phase: 'reading', completed: 0, total: 2 });
  expect(progress).toContainEqual({ phase: 'reading', completed: 2, total: 2 });
  expect(progress).toContainEqual({ phase: 'processing' });
  await page.getByLabel('Search transactions').fill('purchase');
  await expect(page.getByLabel('Filtered totals')).toContainText('0.10 USD');
  await page.locator('.saved-filters > summary').click();
  await page.getByLabel('Filter name', { exact: true }).fill('Keep this scope');
  await page
    .getByRole('button', { name: 'Save current filters', exact: true })
    .click();
  await page.getByRole('button', { name: /Accounts/ }).click();
  await page
    .getByRole('button', { name: 'Collapse expenses', exact: true })
    .click();
  stallNext();
  await page
    .getByLabel('Import journal files')
    .setInputFiles(file('blocked.journal', small));
  await expect(
    page.getByRole('status', { name: 'Import progress' }),
  ).toContainText('Parsing journals and building indexes');
  const cancel = page.getByRole('button', {
    name: 'Cancel import',
    exact: true,
  });
  await cancel.focus();
  const started = Date.now();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('alert')).toContainText('Import cancelled');
  expect(Date.now() - started).toBeLessThan(1000);
  await expect(cancel).toHaveCount(0);
  await expect(
    page
      .locator('aside')
      .getByRole('button', { name: '＋ Import journals', exact: true }),
  ).toBeFocused();
  await expect(page.getByLabel('Search transactions')).toHaveValue('purchase');
  await expect(
    page.getByRole('button', {
      name: 'Apply saved filter Keep this scope',
      exact: true,
    }),
  ).toBeEnabled();
  await expect(
    page.getByRole('button', { name: 'Expand expenses', exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.importProbe.terminated)).toEqual([1]);
  await injectLateReply(page, 1);
  await expect(page.getByRole('alert')).toContainText('Import cancelled');
  await expect(
    page.getByRole('status', { name: 'Import progress' }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: /Overview/ }).click();
  await expect(page.getByLabel('Filtered totals')).toContainText('0.10 USD');
  await page
    .getByRole('button', { name: '· Kept purchase', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toContainText('root.journal:2');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page
    .getByLabel('Import journal files')
    .setInputFiles(
      file(
        'new.journal',
        '2025-02-01 Replacement\n  expenses:food  2 USD\n  assets:cash\n',
      ),
    );
  await expect(page.getByLabel('Filtered totals')).toContainText('2.00 USD');
  await expect(page.getByLabel('Search transactions')).toHaveValue('');
  await expect(
    page.getByText('Saved filters (0)', { exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.importProbe.terminated)).toEqual([
    1, 0,
  ]);
});

test('an initial import can be cancelled, superseded or closed without stale reports', async ({
  page,
  context,
}) => {
  const stallNext = await trackWorkers(page, context);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  stallNext();
  await page
    .getByLabel('Import journal files')
    .setInputFiles(file('first.journal', small));
  await expect(
    page.getByRole('status', { name: 'Import progress' }),
  ).toContainText('Parsing');
  await page
    .getByRole('button', { name: 'Cancel import', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Meet your journal’s better half.' }),
  ).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);
  stallNext();
  await page
    .getByLabel('Import journal files')
    .setInputFiles(file('second.journal', small));
  await expect(
    page.getByRole('status', { name: 'Import progress' }),
  ).toContainText('Parsing');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page
    .getByLabel('Import journal files')
    .setInputFiles(file('third.journal', small));
  await expect(page.getByLabel('Filtered totals')).toContainText('0.10 USD');
  await injectLateReply(page, 0);
  await injectLateReply(page, 1);
  await expect(page.getByRole('table')).toContainText('Kept purchase');
  await expect(page.getByRole('alert')).toHaveCount(0);
  stallNext();
  await page
    .getByLabel('Import journal files')
    .setInputFiles(file('fourth.journal', small));
  await expect(
    page.getByRole('status', { name: 'Import progress' }),
  ).toContainText('Parsing');
  await page
    .getByRole('button', { name: 'Close journals', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Meet your journal’s better half.' }),
  ).toBeVisible();
  await injectLateReply(page, 3);
  await expect(page.getByRole('table')).toHaveCount(0);
  expect(await page.evaluate(() => window.importProbe.terminated)).toEqual([
    0, 1, 3, 2,
  ]);
  await page
    .getByLabel('Import journal files')
    .setInputFiles(
      file(
        'invalid.journal',
        '2024-01-01 Unsupported\n  expenses:food  1 USD @ 2 EUR\n  assets:cash\n',
      ),
    );
  await expect(page.getByRole('alert')).toContainText('Reports paused');
  await expect(page.getByLabel('Filtered totals')).toHaveCount(0);
});

test('local fetch cancellation preserves the selected server session and permits reload', async ({
  page,
  context,
}) => {
  test.skip(
    Boolean(process.env.JLEDGER_TEST_BASE_PATH),
    'Requires the loopback server entry point.',
  );
  await trackWorkers(page, context);
  let waiting = false,
    release: (() => void) | undefined;
  await context.route('**/api/journals', async (route) => {
    if (waiting)
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    await route
      .fulfill({
        contentType: 'application/json',
        body: JSON.stringify([{ name: 'local.journal', text: small }]),
      })
      .catch(() => {});
  });
  await page.goto('./?local=1');
  await expect(page.getByLabel('Filtered totals')).toContainText('0.10 USD');
  await page.getByLabel('Search transactions').fill('purchase');
  waiting = true;
  await page
    .getByRole('button', { name: '↻ Reload files', exact: true })
    .click();
  await expect(
    page.getByRole('status', { name: 'Import progress' }),
  ).toContainText('Reading selected local journals');
  await page
    .getByRole('button', { name: 'Cancel import', exact: true })
    .click();
  waiting = false;
  release?.();
  await expect(page.getByRole('alert')).toContainText('Import cancelled');
  await expect(page.getByLabel('Search transactions')).toHaveValue('purchase');
  await expect(
    page.getByRole('button', { name: '↻ Reload files', exact: true }),
  ).toBeEnabled();
  await expect(page.getByLabel('Filtered totals')).toContainText('0.10 USD');
  await page.getByLabel('Import journal files').setInputFiles({
    name: 'bad.journal',
    mimeType: 'text/plain',
    buffer: Buffer.from([0xff]),
  });
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByLabel('Search transactions')).toHaveValue('purchase');
  await expect(
    page.getByRole('button', { name: '↻ Reload files', exact: true }),
  ).toBeEnabled();
  await expect(page.getByLabel('Filtered totals')).toContainText('0.10 USD');
  await page
    .getByRole('button', { name: '↻ Reload files', exact: true })
    .click();
  await expect(page.getByLabel('Search transactions')).toHaveValue('');
  await expect(page.getByLabel('Filtered totals')).toContainText('0.10 USD');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

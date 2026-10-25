// Synthetic fixtures only. Never point this capture tool at personal journals.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { add } from '../packages/core/dist/index.js';

const root = new URL(
  '../packages/core/fixtures/compatibility/',
  import.meta.url,
);
const cases = JSON.parse(readFileSync(new URL('cases.json', root), 'utf8'));
const capture = process.argv.includes('--capture');
const tools = [
  {
    name: 'hledger',
    executable: process.env.HLEDGER_BIN || 'hledger',
    version: /^hledger 1\.52(?:,|\s|$)/,
  },
  {
    name: 'ledger',
    executable: process.env.LEDGER_BIN || 'ledger',
    version: /^Ledger 3\.3\.2-/,
  },
];
const env = { ...process.env, LC_ALL: 'C.UTF-8', TZ: 'UTC' };
// Prevent user report defaults/file selection from changing reference results.
for (const key of Object.keys(env))
  if (/^(LEDGER|HLEDGER)_/.test(key)) delete env[key];
function run(tool, args) {
  const result = spawnSync(tool.executable, args, {
    env,
    encoding: 'utf8',
    timeout: 10000,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  assert.equal(result.signal, null, 'Reference process terminated');
  return result;
}
function csv(text) {
  const rows = [];
  let row = [],
    field = '',
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && (c === ',' || c === '\n')) {
      row.push(field);
      field = '';
      if (c === '\n') {
        rows.push(row);
        row = [];
      }
    } else field += c;
  }
  assert.equal(quoted, false, 'Unclosed CSV field');
  if (field || row.length) rows.push([...row, field]);
  return rows;
}
function quantity(text) {
  // Canonical decimal strings, preserving exactness without binary floating point.
  const value = add('0', text);
  return value.includes('.')
    ? value.replace(/0+$/, '').replace(/\.$/, '')
    : value;
}
function hledgerAmount(a) {
  const { decimalMantissa, decimalPlaces } = a.aquantity;
  const negative = decimalMantissa.startsWith('-');
  const digits = decimalMantissa
    .replace(/^-/, '')
    .padStart(decimalPlaces + 1, '0');
  const value = decimalPlaces
    ? `${digits.slice(0, -decimalPlaces)}.${digits.slice(-decimalPlaces)}`
    : digits;
  return {
    commodity: a.acommodity,
    quantity: quantity(`${negative ? '-' : ''}${value}`),
  };
}
for (const tool of tools) {
  const version = run(tool, ['--version']);
  assert.equal(version.status, 0);
  assert.match(version.stdout, tool.version, 'Wrong reference version');
  const observed = {};
  for (const fixture of cases) {
    const path = fileURLToPath(new URL(`${fixture.id}.journal`, root));
    const prefix =
      tool.name === 'ledger'
        ? ['--args-only', '-f', path]
        : ['--no-conf', '-f', path];
    const parsed = run(tool, [
      ...prefix,
      ...(tool.name === 'ledger' ? ['csv'] : ['print', '-O', 'json']),
    ]);
    const entry = { accepted: parsed.status === 0 };
    const expectedAcceptance =
      fixture.referenceAcceptance?.[tool.name] ??
      (fixture.supported ? true : undefined);
    if (expectedAcceptance !== undefined)
      assert.equal(
        entry.accepted,
        expectedAcceptance,
        `${tool.name}: ${fixture.id}: ${parsed.stderr}`,
      );
    if (entry.accepted && fixture.supported) {
      entry.postings =
        tool.name === 'ledger'
          ? csv(parsed.stdout).map(
              ([date, , description, account, commodity, q]) => ({
                date: date.replaceAll('/', '-'),
                description,
                account,
                commodity,
                quantity: quantity(q),
              }),
            )
          : JSON.parse(
              parsed.stdout.replace(
                /("decimalMantissa"\s*:\s*)(-?\d+)/g,
                '$1"$2"',
              ),
            )
              .sort((a, b) => a.tindex - b.tindex)
              .flatMap((t) =>
                t.tpostings.flatMap((p) =>
                  p.pamount.map((a) => ({
                    date: p.pdate ?? t.tdate,
                    description: t.tdescription,
                    account: p.paccount,
                    ...hledgerAmount(a),
                  })),
                ),
              );
      entry.postings.sort((a, b) => a.date.localeCompare(b.date));
      const report = run(tool, [
        ...prefix,
        'balance',
        '--flat',
        '--no-total',
        ...(tool.name === 'ledger'
          ? [
              '--format',
              '%(quoted(account)),%(quoted(quantity(amount))),%(quoted(commodity(amount)))\n',
            ]
          : ['-O', 'json']),
      ]);
      assert.equal(report.status, 0, report.stderr);
      // JSON mantissas and Ledger quantity expressions bypass localized display
      // punctuation and commodity precision; exact report quantities must not round.
      entry.balances =
        tool.name === 'ledger'
          ? csv(report.stdout).map(([account, q, commodity]) => ({
              account,
              commodity,
              quantity: quantity(q),
            }))
          : JSON.parse(
              report.stdout.replace(
                /("decimalMantissa"\s*:\s*)(-?\d+)/g,
                '$1"$2"',
              ),
            )[0].flatMap(([account, , , amounts]) =>
              amounts.map((a) => ({ account, ...hledgerAmount(a) })),
            );
      entry.balances.sort(
        (a, b) =>
          a.account.localeCompare(b.account) ||
          a.commodity.localeCompare(b.commodity),
      );
      if (fixture.hierarchy?.includes(tool.name)) {
        const rollup = run(tool, [
          ...prefix,
          'balance',
          '--no-total',
          '--empty',
          ...(tool.name === 'ledger'
            ? [
                '--flat',
                '--format',
                '%(quoted(account)),%(quoted(quantity(total))),%(quoted(commodity(total)))\n',
              ]
            : ['--tree', '--no-elide', '-O', 'json']),
        ]);
        assert.equal(rollup.status, 0, rollup.stderr);
        // Ledger projection covers explicitly posted accounts; hledger also
        // exposes the implicit parents. Neither projection sums report rows.
        entry.rollups =
          tool.name === 'ledger'
            ? csv(rollup.stdout).map(([account, q, commodity]) => ({
                account,
                commodity,
                quantity: quantity(q),
              }))
            : JSON.parse(
                rollup.stdout.replace(
                  /("decimalMantissa"\s*:\s*)(-?\d+)/g,
                  '$1"$2"',
                ),
              )[0].flatMap(([account, , , amounts]) =>
                amounts.map((a) => ({ account, ...hledgerAmount(a) })),
              );
        entry.rollups.sort(
          (a, b) =>
            a.account.localeCompare(b.account) ||
            a.commodity.localeCompare(b.commodity),
        );
      }
    }
    // Account classification is separate from posting/balance parity. Ledger's
    // tag system has no equivalent hledger type query, so do not imply parity.
    if (entry.accepted && fixture.accountTypes && tool.name === 'hledger') {
      entry.accountTypes = {};
      for (const type of ['A', 'L', 'E', 'R', 'X', 'C', 'V']) {
        const result = run(tool, [
          ...prefix,
          'accounts',
          '--used',
          `type:${type}`,
        ]);
        assert.equal(result.status, 0, result.stderr);
        entry.accountTypes[type] = result.stdout
          .trim()
          .split('\n')
          .filter(Boolean)
          .sort();
      }
    }
    observed[fixture.id] = entry;
  }
  const target = new URL(`${tool.name}-1.json`, root);
  if (capture) writeFileSync(target, JSON.stringify(observed, null, 2) + '\n');
  else
    assert.deepEqual(
      observed,
      JSON.parse(readFileSync(target, 'utf8')),
      `${tool.name} reference corpus changed`,
    );
  console.log(
    `${tool.name}: ${cases.length} fixtures ${capture ? 'captured' : 'verified'}`,
  );
}

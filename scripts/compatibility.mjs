// Synthetic fixtures only. Never point this capture tool at personal journals.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { add, parseAmount } from '../packages/core/dist/index.js';

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
const env = { ...process.env, LC_ALL: 'C', TZ: 'UTC' };
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
function amount(value) {
  const parsed = parseAmount(value);
  assert.ok(parsed, `Unsupported reference report amount: ${value}`);
  return { commodity: parsed.commodity, quantity: quantity(parsed.quantity) };
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
    if (fixture.supported)
      assert.equal(
        entry.accepted,
        true,
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
            ).flatMap((t) =>
              t.tpostings.flatMap((p) =>
                p.pamount.map((a) => ({
                  date: t.tdate,
                  description: t.tdescription,
                  account: p.paccount,
                  ...hledgerAmount(a),
                })),
              ),
            );
      const report = run(tool, [
        ...prefix,
        'balance',
        '--flat',
        '--no-total',
        ...(tool.name === 'ledger'
          ? ['--format', '%(quoted(account)),%(quoted(total))\n']
          : ['-O', 'csv']),
      ]);
      assert.equal(report.status, 0, report.stderr);
      const rows = csv(report.stdout);
      entry.balances = (tool.name === 'ledger' ? rows : rows.slice(1))
        .map(([account, value]) => ({ account, ...amount(value) }))
        .sort((a, b) => a.account.localeCompare(b.account));
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

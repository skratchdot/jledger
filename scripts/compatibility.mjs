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
    // Ledger's quoted() output backslash-escapes quotes/backslashes rather than
    // using RFC CSV doubling. Preserve the enclosed raw commodity representation.
    if (quoted && c === '\\' && ['"', '\\'].includes(text[i + 1])) {
      field += text[++i];
    } else if (c === '"') {
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
function ledgerCommodity(text) {
  // commodity(amount) renders necessary journal quotes; they are not name bytes.
  return text.startsWith('"') && text.endsWith('"') ? text.slice(1, -1) : text;
}
function quantity(text) {
  // Canonical decimal strings, preserving exactness without binary floating point.
  const value = add('0', text);
  return value.includes('.')
    ? value.replace(/0+$/, '').replace(/\.$/, '')
    : value;
}
function hledgerAmount(a) {
  const { decimalPlaces } = a.aquantity;
  let { decimalMantissa } = a.aquantity;
  if (/[eE]/.test(decimalMantissa)) {
    const [coefficient, exponent] = decimalMantissa.split(/[eE]/);
    const zeros = Number(exponent) - (coefficient.split('.')[1]?.length ?? 0);
    assert(
      Number.isSafeInteger(zeros) && zeros >= 0 && zeros <= 10000,
      'Invalid integer JSON mantissa exponent',
    );
    decimalMantissa = coefficient.replace('.', '') + '0'.repeat(zeros);
  }
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
// Opt-in exact evidence: print CSV preserves original amount precision, whereas
// hledger 1.52 JSON quantities round fractional digits after ten places. Retain
// JSON's effective dates/order, but replace quantities only after checking every
// CSV posting identity. CSV header dates alone cannot represent posting overrides.
function exactHledgerPostings(tool, prefix, postings) {
  const printed = run(tool, [...prefix, 'print', '--round=none', '-O', 'csv']);
  assert.equal(printed.status, 0, printed.stderr);
  const [header, ...rows] = csv(printed.stdout);
  assert.deepEqual(header, [
    'txnidx',
    'date',
    'date2',
    'status',
    'code',
    'description',
    'comment',
    'account',
    'amount',
    'commodity',
    'credit',
    'debit',
    'posting-status',
    'posting-comment',
  ]);
  assert.equal(rows.length, postings.length, 'CSV/JSON posting count differs');
  return postings.map((posting, i) => {
    const row = rows[i];
    assert.equal(row.length, header.length);
    assert.deepEqual(
      [row[5], row[7], row[9]],
      [posting.description, posting.account, posting.commodity],
      'CSV/JSON posting identity differs',
    );
    assert.match(row[8], /^-?\d+(?:\.\d+)?$/, 'Non-decimal CSV quantity');
    return { ...posting, quantity: quantity(row[8]) };
  });
}
function exactHledgerStyles(postings) {
  const scales = new Map();
  for (const { commodity, quantity: q } of postings) {
    const scale = q.split('.')[1]?.length ?? 0;
    scales.set(commodity, Math.max(scales.get(commodity) ?? 0, scale));
  }
  // Balances only add/subtract postings: their scale cannot exceed the greatest
  // posting scale for that commodity. Derive it from the reference, never core.
  return [...scales].flatMap(([commodity, scale]) => {
    assert(!/["\\\r\n]/.test(commodity), 'Unsupported style commodity');
    const example = `1${scale ? `.${'0'.repeat(scale)}` : ''}`;
    return [
      '--commodity-style',
      `${example}${commodity ? ` "${commodity}"` : ''}`,
    ];
  });
}
function exactHledgerBalances(tool, prefix, styles, options, identities) {
  const result = run(tool, [
    ...prefix,
    'balance',
    '--no-total',
    ...options,
    '--layout=bare',
    '-O',
    'csv',
    ...styles,
  ]);
  assert.equal(result.status, 0, result.stderr);
  const [header, ...rows] = csv(result.stdout);
  assert.deepEqual(header, ['account', 'commodity', 'balance']);
  if (identities)
    assert.equal(
      rows.length,
      identities.length,
      'CSV/JSON report count differs',
    );
  return rows.map((row, index) => {
    assert.equal(row.length, 3);
    let [account, commodity, q] = row;
    if (identities) {
      const identity = identities[index];
      assert.equal(commodity, identity.commodity);
      assert.equal(
        account.replace(/^\u00a0*/, ''),
        identity.account.split(':').at(-1),
        'CSV/JSON tree account differs',
      );
      account = identity.account;
    }
    assert.match(q, /^-?\d+(?:\.\d+)?$/, 'Non-decimal report quantity');
    return { account, commodity, quantity: quantity(q) };
  });
}
for (const tool of tools) {
  const version = run(tool, ['--version']);
  assert.equal(version.status, 0);
  assert.match(version.stdout, tool.version, 'Wrong reference version');
  const observed = {};
  for (const fixture of cases) {
    const inputFiles = (
      fixture.referenceFiles ?? [`${fixture.id}.journal`]
    ).flatMap((name) => ['-f', fileURLToPath(new URL(name, root))]);
    const prefix = [
      tool.name === 'ledger' ? '--args-only' : '--no-conf',
      ...inputFiles,
    ];
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
                commodity: ledgerCommodity(commodity),
                quantity: quantity(q),
              }),
            )
          : JSON.parse(
              parsed.stdout.replace(
                /("decimalMantissa"\s*:\s*)(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
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
      let exactStyles;
      if (tool.name === 'hledger' && fixture.exactHledger) {
        assert(
          !fixture.postingStatuses,
          'Exact status-query capture is not implemented',
        );
        entry.postings = exactHledgerPostings(tool, prefix, entry.postings);
        exactStyles = exactHledgerStyles(entry.postings);
      }
      entry.postings.sort((a, b) => a.date.localeCompare(b.date));
      // Some reference row selection uses inclusive totals even with a direct
      // amount expression. Marked fixtures request --empty to retain those rows.
      const report = run(tool, [
        ...prefix,
        'balance',
        '--flat',
        '--no-total',
        ...(fixture.emptyBalances ? ['--empty'] : []),
        ...(tool.name === 'ledger'
          ? [
              '--format',
              '%(quoted(account)),%(quoted(quantity(amount))),%(quoted(commodity(amount)))\n',
            ]
          : ['-O', 'json']),
      ]);
      assert.equal(report.status, 0, report.stderr);
      // JSON mantissas and Ledger quantity expressions bypass localized display
      // punctuation and commodity precision. JSON still has a ten-place limit;
      // exactHledger fixtures replace those quantities below with CSV evidence.
      entry.balances =
        tool.name === 'ledger'
          ? csv(report.stdout).map(([account, q, commodity]) => ({
              account,
              commodity: ledgerCommodity(commodity),
              quantity: quantity(q),
            }))
          : JSON.parse(
              report.stdout.replace(
                /("decimalMantissa"\s*:\s*)(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
                '$1"$2"',
              ),
            )[0].flatMap(([account, , , amounts]) =>
              amounts.map((a) => ({ account, ...hledgerAmount(a) })),
            );
      if (exactStyles)
        entry.balances = exactHledgerBalances(tool, prefix, exactStyles, [
          '--flat',
          ...(fixture.emptyBalances ? ['--empty'] : []),
        ]);
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
                commodity: ledgerCommodity(commodity),
                quantity: quantity(q),
              }))
            : JSON.parse(
                rollup.stdout.replace(
                  /("decimalMantissa"\s*:\s*)(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
                  '$1"$2"',
                ),
              )[0].flatMap(([account, , , amounts]) =>
                amounts.map((a) => ({ account, ...hledgerAmount(a) })),
              );
        if (exactStyles)
          entry.rollups = exactHledgerBalances(
            tool,
            prefix,
            exactStyles,
            ['--tree', '--no-elide', '--empty'],
            entry.rollups,
          );
        entry.rollups.sort(
          (a, b) =>
            a.account.localeCompare(b.account) ||
            a.commodity.localeCompare(b.commodity),
        );
      }
    }
    // hledger status queries are posting-scoped: explicit posting markers win,
    // otherwise transaction status applies. Capture membership separately from
    // complete postings/balances; no Ledger status-query parity is implied.
    if (entry.accepted && fixture.postingStatuses && tool.name === 'hledger') {
      const transactions = new Map(
        JSON.parse(
          parsed.stdout.replace(
            /("decimalMantissa"\s*:\s*)(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
            '$1"$2"',
          ),
        ).map((transaction) => [String(transaction.tindex), transaction]),
      );
      entry.statusPostings = {};
      for (const status of ['*', '!', '']) {
        const result = run(tool, [
          ...prefix,
          'register',
          `status:${status}`,
          '-O',
          'json',
        ]);
        assert.equal(result.status, 0, result.stderr);
        entry.statusPostings[status] = JSON.parse(
          result.stdout.replace(
            /("decimalMantissa"\s*:\s*)(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
            '$1"$2"',
          ),
        )
          .flatMap(([, , , posting]) => {
            const transaction = transactions.get(String(posting.ptransaction_));
            assert(
              transaction,
              'Status query refers to an unknown transaction',
            );
            return posting.pamount.map((amount) => ({
              date: posting.pdate ?? transaction.tdate,
              description: transaction.tdescription,
              account: posting.paccount,
              ...hledgerAmount(amount),
            }));
          })
          .sort((a, b) => a.date.localeCompare(b.date));
      }
    }
    // Account classification is separate from posting/balance parity. Ledger's
    // tag system has no equivalent hledger type query, so do not imply parity.
    if (entry.accepted && fixture.accountTypes && tool.name === 'hledger') {
      entry.accountTypes = {};
      for (const type of ['A', 'L', 'E', 'R', 'X', 'C', 'V', 'G']) {
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

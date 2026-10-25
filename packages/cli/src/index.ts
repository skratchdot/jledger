#!/usr/bin/env node
import { Command } from 'commander';
import { fileURLToPath } from 'node:url';
import {
  assertValid,
  balances,
  formatAmount,
  parseJournal,
} from '@jledger/core';
import { readSources, resolveFiles } from './files.js';
import { createJournalServer } from './server.js';

const program = new Command();
program
  .name('jledger')
  .description(
    'Private, local-first plain text accounting tools (early preview).',
  )
  .version('0.0.0');
program.option(
  '-f, --file <path>',
  'journal file; repeat to read multiple files (overrides LEDGER_FILE)',
  (file: string, previous: string[]) => [...previous, file],
  [],
);
program.addHelpText(
  'after',
  '\nFile precedence: explicit -f/--file > nonempty LEDGER_FILE > ~/.hledger.journal.\nLEDGER_FILE glob patterns select the alphabetically first matching file.\nInclude targets must also be explicitly selected with -f/--file. No files are discovered.\nUnsupported journal syntax is an error; see docs/compatibility.md.',
);

async function journal() {
  const files = await resolveFiles(program.opts<{ file: string[] }>().file);
  const result = parseJournal(await readSources(files));
  for (const d of result.diagnostics)
    process.stderr.write(`${d.file}:${d.line}: ${d.code}: ${d.message}\n`);
  assertValid(result);
  return result;
}
program
  .command('check')
  .description('Parse and validate selected journal files')
  .action(async () => {
    const result = await journal();
    console.log(
      `OK: ${result.sources.length} file(s), ${result.transactions.length} transaction(s).`,
    );
  });
program
  .command('balance')
  .alias('bal')
  .description('Print direct account balances, separated by commodity')
  .action(async () => {
    for (const b of balances(await journal()))
      console.log(`${b.amounts.map(formatAmount).join(' ; ')}  ${b.account}`);
  });
program
  .command('server')
  .description(
    'Serve the explorer and selected journals on loopback (read-only)',
  )
  .option('-p, --port <port>', 'local port', '3000')
  .action(async (options: { port: string }) => {
    if (
      !/^\d+$/.test(options.port) ||
      Number(options.port) < 1 ||
      Number(options.port) > 65535
    )
      throw new Error('Port must be an integer from 1 to 65535.');
    const files = await resolveFiles(program.opts<{ file: string[] }>().file);
    const directory = fileURLToPath(
      new URL('../../web/dist/client/', import.meta.url),
    );
    const server = await createJournalServer(files, directory).catch(
      (error) => {
        if (
          error instanceof Error &&
          'code' in error &&
          error.code === 'ENOENT'
        )
          throw new Error(
            'Journal or web build missing. Check the selected files and run pnpm build at the repository root.',
          );
        throw error;
      },
    );
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(Number(options.port), '127.0.0.1', resolve);
    });
    console.log(
      `jledger serving ${files.length} selected journal(s), read-only.\nhttp://127.0.0.1:${options.port}/?local=1\nPress Ctrl+C to stop. No data is uploaded.`,
    );
    const stop = () => {
      server.close();
      server.closeAllConnections();
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  });
try {
  await program.parseAsync();
} catch (error) {
  process.stderr.write(
    `jledger: ${error instanceof Error ? error.message : 'Unexpected error'}\n`,
  );
  process.exitCode = 1;
}

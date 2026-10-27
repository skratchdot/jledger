# jledger

Private, local-first plain text accounting tools in JavaScript and TypeScript.
The web explorer is the primary product: open journal files, understand your money,
and keep your financial data on your own device.

**[Open jledger →](https://skratchdot.github.io/jledger/)** ·
[Supported journal syntax](docs/compatibility.md) · [Run locally](#run-locally) ·
[CLI](#cli)

[![jledger explorer using synthetic sample data](docs/images/explorer.png)](https://skratchdot.github.io/jledger/)

**Early prototype:** this is a working foundation, not a Ledger or hledger replacement.
The parser implements a small, strict subset of hledger's journal format.
Unsupported input disables reports instead of silently dropping financial data.
Read the [compatibility contract](docs/compatibility.md) before using real journals.

## Get started

1. **[Open the explorer](https://skratchdot.github.io/jledger/)** in your browser. No installation or account needed.
2. Choose **Explore sample journal** to try it with synthetic data.
3. Import your own journals when ready. Files are processed on your device and are never uploaded.

The application shell works offline after the first successful load. Imported
journals stay in memory; reimport them after a reload.

### Run locally

Install [mise](https://mise.jdx.dev/getting-started.html) and activate it in your
shell. Node **26.x** is selected in `mise.toml`; mise reads pnpm's exact version from
`packageManager` in `package.json`. Local development and CI use the same setup.
Run these commands at the repository root:

```sh
mise trust
mise install
pnpm install --frozen-lockfile
pnpm build
pnpm dev
```

### Import journals

Import/drop one or more UTF-8 journals.
Imports replace the currently open set; choose all files together. The current
limit is 256 MiB total and 4,096 files. Literal relative includes resolve only
among selected files, including unquoted paths with spaces; select the root and
every referenced journal together.
For nested folders, choose **Import journal folder** where supported, preserving
relative paths. The folder picker imports every file: choose a journal-only folder.
A [progress indicator and Cancel import control](docs/imports.md) let you stop a
pending replacement while keeping the open journal and its filters. Missing targets,
cycles, ambiguous paths, and repeated includes disable reports.
Globs, quoted include paths, and automatic disk/network discovery are not supported.
See [include resolution](docs/includes.md) for the supported path subset.
The development server listens on all interfaces for cloud development; it serves
only the app and synthetic demo, and never automatically reads `LEDGER_FILE`.
Use the loopback CLI server below for personal journals.

## CLI

From the repository root:

```sh
pnpm jledger -f packages/examples/demo.journal check
pnpm jledger -f packages/examples/demo.journal balance
pnpm jledger -f packages/examples/demo.journal server
# The equivalent after building:
node packages/cli/dist/index.js -f packages/examples/demo.journal server
```

The server prints its local address. Open it in a browser on the same machine.
It serves the production explorer and only the selected journal files. Include targets must also be selected with
`-f`; no include target is discovered on disk. It binds
to `127.0.0.1`, is read-only, and has no arbitrary file browser or upload endpoint.
After editing a journal in your editor, choose **Reload files**. There is no file
watcher yet. The server requires a root-path web build (`pnpm build`).

File selection follows this precedence for **every CLI command**, including `server`:

1. Explicit `-f/--file` switches. Repeat them for multiple files; they replace the environment selection.
2. A nonempty `LEDGER_FILE`. An environment glob selects the alphabetically first matching file, as in hledger.
3. `~/.hledger.journal`.

```sh
LEDGER_FILE="$HOME/finance/main.journal" pnpm jledger server
pnpm jledger -f "$HOME/finance/2025.journal" -f "$HOME/finance/2026.journal" check
pnpm jledger server --file "$HOME/finance/personal.journal" --port 4000
```

`~/` expansion is supported. Quote shell glob patterns if you intend them to be
resolved by `LEDGER_FILE`; explicit `-f` arguments are literal file paths.
Duplicate files (including symlink aliases) are rejected. CLI source names retain
paths relative to the selected files’ common directory so nested includes resolve.
For example, select both `-f main.journal -f parts/child.journal` when the root
contains `include parts/child.journal`. A selected child is counted through its
include, rather than again as an independent root. A missing selected file
is an error; it never silently falls back to a different journal.
The `jledger` executable belongs to the CLI package; the root `pnpm jledger`
script is the source-development entry point. npm publication/standalone
installation is a later milestone.

## What works

- Browser-only imports and drag-and-drop, with no upload or account requirement.
- Exact decimal balances, separated by commodity; no floating-point money arithmetic.
  Closed accounts and zero commodity balances remain browsable with their transactions.
- [Explicit amount formats](docs/amount-formats.md): decimal marks, commodity format
  examples/blocks, and three-digit grouping, with canonical exact report amounts.
  [Quoted commodity names](docs/quoted-commodities.md) support literal spaces/digits
  in amounts, declarations, formats and balance assertions.
- [Literal account aliases](docs/account-aliases.md) normalize posting/declaration
  names with include scope, original-name search and source explanations.
- [Balance assertions](docs/assertions.md) with expected/calculated diagnostics;
  a failed assertion disables every report. Total `==` checks also require zero
  balances in all other direct-account commodities. Inclusive `=*` checks one
  commodity across an account and its descendants. Strict `==*` checks every
  inclusive commodity, with a documented hledger acceptance difference. Assignments
  remain unsupported.
- Interactive expense categories and monthly charts, plus inclusive [date ranges](docs/explorer-filters.md), status, commodity,
  account, and text filters. [Posting status](docs/posting-status.md) overrides
  transaction status, with inheritance explained in details. Income/spending follows [journal account types](docs/account-types.md),
  with inherited declarations, child overrides, and English-name defaults.
  Transaction details explain the classification source.
- [Previous-month comparisons](docs/explorer-filters.md#previous-calendar-month-comparison)
  and [equal-length custom-range comparisons](docs/explorer-filters.md#previous-equal-length-range-comparison)
  show exact income/spending changes under the same filters, with prior-period drill-down.
- [Filter undo/redo](docs/explorer-filters.md#undo-and-redo-filter-changes) restores
  recent scopes, including complete month shortcuts and preset applications.
- [Active filter chips and named presets](docs/explorer-filters.md) make report
  scopes visible and reusable. Presets stay in memory for the open journal only.
- [Explicit default commodities](docs/default-commodities.md) assign currencies and
  format fallback to bare posting/assertion quantities with file-local include scope
  and directive source explanations.
- [Explicit default years](docs/default-years.md) for month/day transaction headers,
  with include inheritance and directive source explanations. No clock-based year
  guess or automatic rollover is applied.
- [Primary posting dates](docs/posting-dates.md), including month/day overrides in
  the transaction year and attached continuation comments, for month filters, monthly charts,
  and assertion checks; transaction and posting dates remain visible in drill-down.
- [Income by account](docs/explorer-filters.md#income-by-account) shows exact net
  income, reversals and account drill-down in bounded, keyboard-accessible pages.
- [Spending data tables](docs/explorer-filters.md#charts-and-data-tables) with exact
  signed amounts, all matching categories, bounded pages and keyboard account/month
  drill-down alongside the charts.
- A transaction register with posting amounts and source references, transaction
  details, inferred amounts, and original source snippets.
- An [account hierarchy](docs/account-hierarchy.md) with exact inclusive parent
  balances, branch/all-account disclosure controls, account-name search with ancestor
  context, and a direct-posting toggle. Search preserves the prior folds and totals.
  Account rows are fetched from the worker in bounded windows. Both modes are full-journal views, independent
  of register filters; parent and child rows overlap and must not be added together.
- The same production client served statically or through the local CLI.
- An offline application shell after the first successful production load on
  HTTPS or loopback. Journal contents stay in memory and must be reimported after
  a reload. Local-server files can be reread while that server is running.

Charts use approximate floating-point dimensions only; displayed/report totals
use exact decimal strings. Parsing, indexing, search, and exact report totals run in a web worker. The register
and accounts use TanStack Virtual; every result is browsable without rendering
the entire journal into the DOM. Only visible transaction and account windows cross to the UI.
Search is debounced and stale searches are cancelled. See [performance](docs/performance.md).

## Workspace

| Package             | Responsibility                                                              |
| ------------------- | --------------------------------------------------------------------------- |
| `packages/core`     | Runtime-neutral parser, diagnostics, decimal arithmetic, balances           |
| `packages/web`      | React, Vite, TanStack Start SPA, Tailwind, shadcn/Base UI, TanStack Virtual |
| `packages/cli`      | Node file access, file-selection policy, reports, loopback server           |
| `packages/examples` | Synthetic journals shared by demos and tests                                |

The parser stays inside core initially. See the [roadmap](docs/roadmap.md) and
[architecture](docs/architecture.md) for milestones and open design decisions.

## Validate

```sh
pnpm check                   # lint, typecheck, unit/integration cases, production builds
pnpm exec playwright install chromium  # once, if a browser is not installed
pnpm test:browser            # production imports, filters, details, privacy, offline, server
pnpm format:check            # oxfmt; pnpm format applies formatting
```

The [compatibility corpus](docs/conformance.md) runs offline in `pnpm test`.
Use `pnpm test:compatibility` with pinned hledger 1.52 and Ledger 3.3.2
executables to verify live reference results.

To use an installed Chromium, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its path.
The browser suite starts its own loopback server. The standalone subpath check is:

```sh
JLEDGER_BASE_PATH=/jledger/ pnpm --filter @jledger/web build
JLEDGER_TEST_BASE_PATH=/jledger/ pnpm test:browser
pnpm build                   # restore the root-path build for jledger server
```

`pnpm typecheck` prepares core's declarations. On a fresh checkout, run `pnpm build`
before the first typecheck so TanStack can generate its route tree.

CI and Pages run browser tests in the official Playwright container, with browsers
and Linux dependencies preinstalled. The shared
[image resolver](.github/workflows/playwright-image.yml) derives the image tag from
the exact `@playwright/test` version in `package.json`; no image tag needs updating
when running `pnpm update @playwright/test`. The resolver uses the hosted runner’s
preinstalled Node and needs no mise or browser installation; project
checks still use mise-managed Node/pnpm in the selected container. Commit both `package.json` and
`pnpm-lock.yaml` after an update. Frozen lockfile installs enforce consistency,
and the resolver rejects version ranges. A new Playwright release must have its
matching `-noble` image published before CI can run it. Node still follows
`mise.toml`, independently of the image's bundled Node version.
Fresh installs resolve the latest available Node 26.x release. Run `mise upgrade node`
to update an existing installation within that major; no config edit is needed.
To change majors, run `mise use node@<major>` and commit `mise.toml`.
Mise reads pnpm updates directly from `package.json`.

All lint, type, unit, compatibility, formatting, root browser, and subpath browser
checks remain enabled. Superseded pull-request CI runs are canceled automatically.
Container pulls still take time on fresh runners; compare total job duration when
measuring the improvement.

## Static deployment

The [live explorer](https://skratchdot.github.io/jledger/) updates automatically
on every push to `main`, including merged pull requests. The
[Pages workflow](.github/workflows/pages.yml) runs project checks and browser tests
against the `/jledger/` production build before deploying. Failed validation leaves
the current site in place. Only `packages/web/dist/client` is published.

One-time repository setup: in **Settings → Pages → Build and deployment**, choose
**GitHub Actions** as the source. Follow deployments in
[Actions](https://github.com/skratchdot/jledger/actions/workflows/pages.yml).
To retry a deployment, use **Run workflow** with the `main` branch selected.
For a custom domain or a `*.github.io` root site, change the base path to `/`.
Keep personal journals outside this checkout or under ignored `private/`.
Never include them in a public directory, examples, build artifacts, or a commit.

The static application requests only its own bundled assets. No remote fonts,
analytics, market quotes, or third-party scripts are used. Offline support caches
only build-time application files (including the journal worker), never journal API responses or imported files.
Browser extensions, a compromised host, and other users on the same OS remain
outside this prototype's privacy boundary; see [architecture](docs/architecture.md).

## Contributing

Use a short, lowercase [Conventional Commit](https://www.conventionalcommits.org/)
subject and a detailed, helpful body explaining the change, why it is needed, and
how it was validated. For example:

```text
feat(web): add account drill-down

Connect expense category selections to the transaction register so people can
trace a chart total back to its postings and source journal lines.

Validate category filtering, clearing filters, and multi-commodity journals.
```

No project license has been selected yet. Choose one before public distribution;
links to other projects are references, not a grant to reuse their implementation.

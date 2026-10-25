# Product direction and roadmap

## North star

A helpful, private, offline-capable explorer for personal plain text journals.
The first priority is everyday income and spending: fast answers, interactive
visualizations, powerful filtering, and a clear path from every chart to its
underlying transactions. Investments and net worth are the next major track.

Two equal entry points should share one product:

- `jledger server` opens selected journals on your own machine.
- A static website (including GitHub Pages) imports journals on your device.

No sign-in, backend account, or upload should be necessary. Plain text files remain
the source of truth. Useful error explanations are a feature, not an afterthought.

## Milestone 0 — working foundation (bootstrapped)

- pnpm workspace, TypeScript, Vite, Vitest, React/TanStack Start SPA,
  Tailwind CSS, and shadcn components built on Base UI.
- Off-thread parsing/search/reporting and TanStack Virtual register/accounts;
  a 200,000-transaction browser regression for responsiveness and complete browsing.
- Browser-safe core with exact decimals, a strict journal subset, provenance,
  balancing, and explicit unsupported-syntax diagnostics.
- Read-only CLI check/balance/server, with `-f > LEDGER_FILE > ~/.hledger.journal`.
- Static imports, drag-and-drop, account balances, searchable register,
  status/month/commodity/account filters, and transaction inspection.
- Clickable spending categories and monthly charts.
- Offline app shell without persisting personal data.
- Unit/integration/browser checks and a manually triggered Pages workflow.

This milestone demonstrates the architecture. It does not establish broad journal
compatibility, investment valuation, npm distribution, or production-grade performance.

## Milestone 1 — real-world journals and trustworthy exploration

1. Establish a versioned fixture/conformance corpus. Compare parser results,
   balanced postings, and direct balances against hledger 1.52 and a pinned Ledger
   release; document intentional differences. Prioritize representative journals
   before adding many unrelated features.
   The initial [corpus v1](conformance.md) now covers 96 synthetic cases with
   pinned hledger 1.52 / Ledger 3.3.2 captures and a live differential command.
2. Add a lossless syntax tree and include graph. The initial read-only,
   [source-preserving line tree](syntax.md) now shares a streaming scanner with
   accounting interpretation. The [selected-source graph](includes.md) now expands
   literal relative includes in both adapters, with browser folder mapping, cycle/
   missing-target diagnostics, and no file discovery. Optional CLI discovery needs
   an explicit allowed-root policy; broader include syntax and root selection remain.
3. Implement commodity styles, grouping/decimal marks, balance assertions,
   aliases/default-year rules, and posting/secondary dates with tested semantics.
   [Plain assertions](assertions.md) with explicit amounts are now supported and
   tested against hledger 1.52. Assignment/total/inclusive forms remain errors;
   [inline full and month/day primary posting dates](posting-dates.md) now drive
   assertions and month reports. Secondary/continuation dates remain errors. Commodity
   [styles and decimal marks](amount-formats.md) now have an explicit parsing
   subset. [Explicit default years](default-years.md) now resolve month/day headers
   with inherited, file-local include scope and source provenance. Month/day posting
   dates now resolve from the transaction year with explicit Ledger differences;
   clock-based year inference remains an error. Quoted commodities, broader
   grouping, assignments and aliases remain compatibility work; canonical report
   display remains exact.
4. [Account hierarchy rollups](account-hierarchy.md) now provide exact inclusive
   parents and a direct-posting display option. [Journal-defined account types](account-types.md)
   now drive income/spending, with inheritance, child overrides, source explanations,
   and separate reference classification comparisons. Conflicting/ambiguous tags
   disable reports. UI overrides and financial statements remain future work;
   never guess all types from English labels for statements.
5. [Inclusive date ranges](explorer-filters.md) now work across charts and the
   register, using shared posting matching and month shortcuts. Active scope chips
   and bounded, in-memory named filter presets now support reusable exploration,
   keyboard save/apply/remove, and complete filter restoration. Account disclosures
   now fold branches in the worker with bounded row windows, preserved child state,
   and native keyboard controls. Account-name search now reveals matching paths
   with ancestor context while preserving folds and full-journal amounts. Next add
   broader keyboard navigation and accessible chart/table equivalents. Specify hledger
   query compatibility separately from simple free-text search.
6. Extend the existing worker and virtualization foundation with streaming/incremental
   parsing, indexed queries, realistic multi-file benchmarks, and memory budgets.
   Preserve exact totals and cancellation; add progress and import cancellation.

**Exit:** several realistic journal patterns are supported, every report explains
its scope, and every visible total can be traced back to source postings.

## Milestone 2 — a great everyday finance workspace

- Income/spending trends with period comparisons and merchant/category drill-down.
- Cash-flow timelines, recurring-payment exploration, and reconciliation views.
- Budgets using explicit supported semantics, with actual-vs-plan comparisons.
- Dashboard filters shared across charts and register; share/export _configuration_
  without accidentally embedding personal data in URLs or published artifacts.
- Read-only file watching and reload behavior for the CLI; clear stale-data indicators.
- Browser directory/project management and optional explicit local persistence.
- Accessible/mobile interactions, undoable filter changes, table exports,
  and an inspectable explanation for derived metrics.

A charting library should be chosen after a few concrete visualization requirements
are known. Start with interactive native HTML/SVG and evaluate accessibility,
large datasets, bundle size, and maintenance before adding a large dependency.

## Milestone 3 — investments and net worth

- Cost/price annotations, market-price directives, lots, and multi-commodity balancing.
- Explicit valuation dates, commodity selection, and missing/stale-price warnings.
- Account-type-aware balance sheets and net-worth history.
- Holdings, allocation, capital gains, and returns, with documented methodology.
- External price fetching only as an opt-in adapter with visible destinations and
  privacy implications. Offline valuations use prices already in the journal.

Paisa is useful inspiration for clarity, allocation, budgets, and financial planning.
jledger should develop its own implementation and visual language. Respect third-party
licenses; referencing a product does not authorize copying its code or assets.

## Milestone 4 — authoring and distribution

Lossless formatting, editor assistance, and safe transactional writes come after
read-only correctness. Authoring needs round-trip tests, backups/conflict detection,
and an explicit write-permission model. Also deliver a self-contained CLI artifact
with bundled static assets, npm/install smoke tests, release automation, and a
versioning policy for core/parser APIs.

## Decisions to make when evidence is available

- Which real journal features block the first users? Redacted/synthetic equivalents
  are preferable to sharing personal journals. More links and ideas can be collected
  in issues; categorize them by milestone and the user problem they solve.
- Which license fits the desired ecosystem? Decide before releasing packages.
- How closely should CLI flags and report text match hledger versus providing a
  smaller documented interface? Format compatibility and CLI parity are separate.
- How should browser includes and directory persistence work across Firefox,
  Safari, and Chromium? Avoid requiring one vendor's filesystem API.
- Is default persistence desirable at all? Keep memory-only behavior until an explicit
  privacy/forget-data design exists.

There is no need for a long specification before writing useful code. Keep a narrow
working slice, add representative fixtures and user scenarios, and plan the next
milestone in detail while leaving later implementation choices open.

## References

- [Plain Text Accounting](https://plaintextaccounting.org/): files as the portable
  accounting source, existing tools, community, and ecosystem.
- [hledger 1.52 journal manual](https://hledger.org/1.52/hledger.html#journal): primary
  format target and behavioral reference.
- [Ledger documentation](https://ledger-cli.org/docs.html): interoperability reference.
- [Paisa](https://paisa.fyi/): private personal-finance exploration and planning inspiration.
- [TanStack Start SPA mode](https://tanstack.com/start/latest/docs/framework/react/guide/spa-mode):
  one static client artifact for both distribution modes.

During bootstrap the documentation hosts were blocked by the environment proxy;
research used their official repository sources instead:
[PTA index](https://github.com/plaintextaccounting/plaintextaccounting/blob/master/src/index.md),
[hledger 1.52 manual](https://github.com/simonmichael/hledger/blob/1.52/hledger/hledger.m4.md),
[Ledger manual](https://github.com/ledger/ledger/blob/master/doc/ledger3.texi),
[Paisa docs](https://github.com/ananthakumaran/paisa/blob/master/docs/index.md),
[TanStack SPA guide](https://github.com/TanStack/router/blob/main/docs/start/framework/react/guide/spa-mode.md).

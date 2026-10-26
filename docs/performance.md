# Large-journal performance

Responsiveness is an architectural requirement. The application must accept input
and scroll while parsing/searching; virtualization alone does not make main-thread
parsing or aggregation acceptable.

## Implemented

- A dedicated module worker owns source text, the parsed journal, a normalized
  search index, sorted transaction IDs, and the current filtered result IDs.
- Plain assertion validation runs in the worker in effective posting-date order,
  only for journals containing assertions. It retains posting references and effective dates for a stable
  chronological sort and running direct balances; ordinary imports skip this pass.
- Explicit format state stays in the worker parser. Compiled amount patterns are
  reused; normalization removes grouping with string operations and uses exact
  decimals. Includes share commodity formats while copying the small file context.
- Account type declarations are indexed once per import in the worker. The type
  resolver caches account paths and inherited results rather than searching
  declarations for every posting. Classification metadata crosses to React only
  in on-demand details. Cached paths add memory proportional to distinct accounts
  and their ancestors; this is not a new account-count or memory guarantee.
- Explicit default years add a small source-bearing value to file context, inherited
  by includes. Yearless transactions reference that value rather than copying a
  directive object for every row. Calendar normalization stays in the worker; full
  headers retain their existing data shape. This adds no streaming or device-wide
  memory guarantee for yearless journals.
- Month/day posting dates normalize against the already resolved transaction year
  in the worker parser. They add no per-posting provenance object or new UI-thread
  computation; source comments and the transaction date remain available in details.
- Core streams source-span line nodes while parsing, without retaining an extra
  syntax tree or split-line array. Explicit syntax inspection can opt into a tree.
- Imports stage replacements in a separate worker so cancellation can terminate
  synchronous parsing without destroying the committed journal. At most two journal
  workers coexist, increasing peak replacement memory. Files decode serially and
  send count updates every 32 files plus completion; local fetch and parse/index
  phases are indeterminate. No financial computation moves to the UI thread.
- File decoding, local API fetching/JSON decoding, parsing, direct balances,
  substring searching, and exact filtered totals run in that worker.
- Full-journal direct and inclusive account arrays stay in the worker. A subtree
  index and collapsed-branch set build the visible account sequence there. Import
  summaries carry counts; account window responses contain at most 200 rows. The
  UI neither receives full account balance arrays nor flattens hidden branches. The added
  index uses memory proportional to nodes, so high account counts remain a concern.
- Account search scans cached normalized names in the worker. A reverse pass marks
  ancestor context in linear node order; direct mode uses a compact lookup into
  that same name cache. Debounce and stale-response guards avoid committing old
  queries; already-started projections run synchronously in the worker. Cached
  path text, parent/direct indices and match/context flags add memory. This is not
  a new account-count, latency or memory guarantee.
- React receives a summary and report aggregates, not the entire transaction set.
- Named filter presets retain at most 20 seven-field configurations with 80-character
  names per open journal. Copying/comparing this bounded metadata does not scan
  postings or compute totals on the UI thread. Applying uses the existing worker
  query path; chips and preset controls do not add mounted register/account rows.
  The register and account list request only visible windows, with a small overscan.
- TanStack Virtual renders the register and account balances. The register has no
  arbitrary first-200-result limit; the entire result set remains browsable.
- Search debounces for 100 ms. Queries yield every 8,192 records to allow newer
  requests to cancel stale scans; request IDs discard stale UI responses.
- Details and original source snippets are retrieved on demand.
- Charts show the top 30 expense categories. Spending tables expose all worker
  category aggregates and existing journal months in pages of at most 25 data rows
  each. React slices only the visible page and formats exact strings; it does not
  recompute financial totals. Aggregate arrays already cross the worker boundary,
  so pagination bounds mounted rows, not report-transfer size or worker memory.
  The account view separately exposes full-journal balances.
- A register row previews up to three matching postings. Details show all postings.

The current input guard is 256 MiB total, not a promise that every 256 MiB journal
fits comfortably in every browser. Parsing is still whole-file and in-memory;
parsed objects, indexes, raw sources, and transfers consume more memory than the
input file size. Browser memory and device speed remain real constraints. There is
no streaming parser, persisted index, or supported million-transaction SLA yet.

## Regression scenario

`pnpm test:browser` builds on the current production artifact and imports 200,000
synthetic two-posting transactions (14,888,890 bytes). It checks that:

1. Search input remains usable during import (less than 1 second for the tested action).
2. Animation frames continue while the import and first search complete.
3. A known final transaction can be found and the exact total is `2000.00 USD`.
4. Clearing filters exposes all 200,000 matches, with fewer than 50 mounted table rows.
5. A date range can exclude all rows, then restore the full 200,000-result set
   with the same exact total and bounded DOM.
6. Scrolling to the end reaches the final transaction, not a truncated first page.

Metrics are written to the current run's ignored `test-results/**/metrics.json` and
attached to the Playwright result. Test both the root build and the `/jledger/`
static deployment. A synthetic repeated transaction is a useful regression, not
a substitute for diverse real-world journals or a cross-device benchmark.

## Multi-file regression

The browser suite also imports a synthetic 13-file monthly include bundle with
24,000 transactions: grouped salary under an inherited explicit USD format,
monthly bank-balance assertions, explicit primary
posting dates on purchases, alternating
purchases/refunds, inline Unicode comments, block comments containing include-shaped
text, and mixed LF/CRLF/BOM inputs.
It checks exact full-year and monthly totals, bounded register rows, and a final
transaction's original file, line number, and source excerpt. The files are
all explicitly selected; a root manifest includes the 12 monthly children once.
Like the larger scenario, it is a regression case, not a memory budget or a
device-wide performance promise.

## Account hierarchy regression

A separate production-browser case loads 1,000 expense leaves plus their implicit
parents, verifies the exact inclusive expense total, scrolls to the final account,
and requires fewer than 50 mounted account rows. Switching to direct mode resets
the scroller. Core tests enforce depth and node limits without partial results; a
worker/browser case protects atomic failure when a new import exceeds the limit.
Additional browser cases fold/unfold a 10,003-row hierarchy from 5,000 synthetic
transactions, reach the final leaf, assert fewer than 50 mounted account rows and
at most 200 rows per worker response, and reject stale responses after replacement.
They also preserve nested fold state, source-context recovery and narrow-screen
controls. Search cases additionally browse the final match among 2,501 matching
paths from 5,000 transactions, reject stale view/window replies, retain full-journal
parent amounts and register totals, and keep input responsive with fewer than 50
mounted account rows. These cases do not establish a high-account-count memory SLA.

## Next improvements

Incremental/streaming parsing, source byte offsets, query indexes (date, account,
commodity), large account/commodity selector virtualization, finer parsing progress,
reduced replacement memory, realistic include graphs, and explicit
budgets for memory, time-to-first-result, and p95 input latency.

Changes to the parser or explorer should preserve this regression and add evidence
for any stronger performance claim. Never move heavy work back onto the UI thread
just because a demo journal is small.

## Spending table regression

Production-browser cases page through 62 expense categories and 61 journal months,
reach the final result with at most 25 data rows per table, and use keyboard
account/month filtering. They cover focus retention and fallback, refund signs,
posting dates, quantities larger than safe JavaScript integers, separate/unitless
commodities, empty results, invalid reports and long account names at narrow widths.
These are bounded-DOM regressions, not a guarantee for arbitrary aggregate counts;
large month dropdowns and the original monthly chart remain future performance work.

## Import cancellation regression

Worker lifecycle tests cover commit/cancel/supersession, late replies, failed startup,
failed imports and cleanup. Production-browser cases use a deliberately non-yielding
same-origin test worker to verify cancellation without a parser yield and retain the
old worker's exact reports, source drill-down, filters, presets and folded accounts.
They also test initial cancellation, replacing/closing a pending import, narrow
controls, stale progress/results and local-fetch cancellation/retry. The test worker
proves the termination mechanism; it is not a real-journal performance guarantee.

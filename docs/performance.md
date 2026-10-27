# Large-journal performance

Responsiveness is an architectural requirement. The application must accept input
and scroll while parsing/searching; virtualization alone does not make main-thread
parsing or aggregation acceptable.

## Implemented

- A dedicated module worker owns source text, the parsed journal, a normalized
  search index, sorted transaction IDs, and the current filtered result IDs.
- Assertion validation runs in the worker in effective posting-date order,
  only for journals containing assertions. Total checks lazily index nonzero commodities
  only in accounts using `==`, keeping repeated checks independent of that account's
  full commodity-map size. The first check scans its map; sets add temporary memory.
  Diagnostics show at most five extras plus their remaining count, while validating
  every balance. It retains posting references and effective dates for a stable
  chronological sort and running direct balances; ordinary imports skip this pass.
- Partial inclusive `=*` assertions index checked account/commodity scopes while
  collecting posting references.
  Each distinct posting account caches references to matching checked ancestors at
  colon boundaries. The chronological pass updates matching scopes without scanning
  all accounts at every check or building unrequested hierarchy rollups. This adds
  scope balances and per-account cached references; overlapping
  checked ancestors increase update work. Imports without inclusive assertions skip
  that path. A synthetic five-file/12,000-purchase browser case checks four parent
  statements, exact totals, responsive input, bounded rows and final drill-down;
  this does not establish a new depth, memory or device-wide latency guarantee.
- Quoted commodity tokenization and exact-name format lookup stay in the worker
  parser. Amount splitting preserves the original tail rather than rebuilding it.
  Report formatting adds quotes where necessary, without converting quantities to
  floats or adding a new scan/transfer of journals.
- Literal aliases use immutable file-local scopes and cached account resolution
  in the worker. Each distinct input is checked once per rule context against at
  most 128 active rules. Shared provenance avoids copying directive lists per
  posting; original-name search adds text to the existing index. Caches and metadata
  add memory; no aliased-journal latency or memory SLA is established.
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
- Calendar-month and closed custom-range comparisons check current and previous
  posting scopes in the same cancellable worker scan. They reuse the account-type resolver and exact decimal
  operations; only the current period populates register IDs/category/month data.
  Previous totals, deltas and count add bounded metadata. Matching two date scopes
  adds work for eligible queries; all-dates and open-ended ranges skip that
  comparison.
  This is not a new latency or memory guarantee.
- Effective posting status adds a marker/inheritance comparison to the shared
  worker posting matcher and the existing bounded register previews. Header-only
  status rejection is removed so split statuses remain correct. There is no new
  status index, journal transfer or UI-thread money computation. A 5,000-transaction
  browser case browses 2,500 pending results with bounded rows and final source
  drill-down; this is not a new latency/memory guarantee.
- React receives a summary and report aggregates, not the entire transaction set.
- Undo/redo retains at most 50 recent seven-field configurations across the two
  history stacks. Nearby typing coalesces into one step; no journal scan or money
  arithmetic runs in the reducer. Undo/redo changes use existing worker debounce,
  cancellation and row windows. Snapshot counts do not bound arbitrary string size.
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
- Expense categories sort in the worker using exact BigInt-backed decimal
  comparisons, avoiding floating-point ties at the top-30 cutoff. Sort cost grows
  with category count and decimal length; this is not a new latency guarantee.
  Charts show the top 30 expense categories. Spending tables expose all worker
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
large month dropdowns remain future performance work. The monthly chart now uses
pages of at most 12 bars.

## Import cancellation regression

Worker lifecycle tests cover commit/cancel/supersession, late replies, failed startup,
failed imports and cleanup. Production-browser cases use a deliberately non-yielding
same-origin test worker to verify cancellation without a parser yield and retain the
old worker's exact reports, source drill-down, filters, presets and folded accounts.
They also test initial cancellation, replacing/closing a pending import, narrow
controls, stale progress/results and local-fetch cancellation/retry. The test worker
proves the termination mechanism; it is not a real-journal performance guarantee.

## Monthly comparison regression

Worker tests cover calendar/leap/year boundaries, whole-month eligibility, combined
filters, split posting dates, signed refunds, exact large/unitless changes, empty
prior periods and cancellation without committing stale register results. Browser
cases exercise linked prior-month navigation, missing-month scope labels, keyboard
focus, commodity/search/status/account changes, narrow layout and invalid reports.
The existing 200,000-transaction regression remains a synthetic responsiveness
check rather than a guarantee for every month-comparison workload.

## Filter history regression

Reducer tests cover complete scope restoration, typing groups, no-op/branch behavior,
invalid date recovery, bounded long edit/undo/redo sequences and session resets.
Browser cases exercise native keyboard controls, month/comparison restoration,
atomic preset application, redo invalidation, failed/cancelled and same-name imports,
closing, narrow controls and offline refresh with no persisted private history.
The 200,000-transaction test continues to exercise responsive input during import.

## Custom-range comparison regression

Worker tests cover inclusive equal-length boundaries, leap years, UTC days, year
limits, effective split posting dates, same-posting account/commodity/status scopes,
exact large/unitless quantities, refunds, empty prior periods and cancellation.
Production-browser cases cover prior-range drill-down, atomic undo, preset reuse,
invalid/open-ended scopes, source details, focus and narrow layout. The existing
200,000-transaction regression also exercises closed ranges. Comparisons still
share one cancellable worker scan and add bounded metadata, without a new query
index or streaming/latency/memory guarantee.

## Exact category ranking regression

Core tests compare signed values, equal scales, quantities beyond safe integers and
floating-point range, and tiny residuals without rounding. Worker/browser cases
rank 32 near-equal large amounts, verify the true top-30 cutoff and bounded table
pages, then drill into the highest category's exact posting and original source.
Worker cases also retain stable numeric ties, zero/refund order and commodity
separation. The existing large-journal regressions remain required.

## Continuation posting-date regression

Attached date comments are parsed in the existing worker scanner using one pending
posting reference per file; no retained syntax tree or second date scan is added.
Only affected postings carry a separate source location. On-demand details extend
the existing source excerpt through the final date marker, without transferring
whole journals to React. Core/worker/browser cases cover effective report dates,
assertion order, source boundaries, malformed/duplicate/orphaned markers and final
inferred-posting source drill-down. Existing large-journal regressions remain
required; this does not establish a new latency or memory guarantee.

## Default commodity regression

D resolution adds a small commodity/format/source value to the existing file-local
worker parsing context. It performs no additional journal scan and does not round
quantities. Affected bare posting/assertion amounts reference the shared directive
location; explicit and balancing-inferred amounts carry no new provenance. Parser,
worker and browser cases cover exact totals, include restoration, separate
commodities, comparisons and directive drill-down. Existing large-journal tests
remain required; this is not an incremental parser or a new latency/memory guarantee.

## Total inclusive assertion regression

Scopes using `==*` retain every inclusive commodity in the existing checked-ancestor
index; partial-only scopes retain requested commodities. Lazy nonzero sets support
repeated checks with bounded diagnostic samples while checking every balance.
Overlapping total scopes add work and memory proportional to their descendant
commodities. Core/worker/browser cases cover exact values, repeated/overlapping
scopes, offsets, prefix boundaries, source drill-down and child-only extra failures.
This is not a new journal-depth, memory or latency guarantee. Existing large-journal
regressions remain required and computation stays in the worker.

## Income account breakdown regression

The existing cancellable query scan accumulates current-period income by canonical
account, then normalizes credit signs and sorts exact quantities in the worker.
An extra map and aggregate payload grow with the number of matching income accounts,
even while the disclosure is closed. No new journal scan or full-journal transfer
to React is added. The closed disclosure mounts no table; an open page mounts at
most 25 data rows. This bounds DOM size, not aggregate memory or transfer size.

Worker/browser cases cover close large quantities, exact small reversals, zero and
negative income, declared/inherited types, aliases, split posting dates, currencies,
status/search/account scopes, cancellation, both table pages, keyboard drill-down,
history, replacement reset and invalid reports. Existing large-journal regressions
remain required; this is not a new latency or memory guarantee.

## Pending report currency regression

Browser tests hold and release actual worker report messages without delaying query
delivery or replacing the financial engine. They verify metric/chart/table currency
labels across USD, EUR and unitless changes, then deliver a superseded reply after
a newer result to protect request-ID rejection. The fix reads existing bounded
report metadata and adds accessibility busy state; it adds no scan, financial
arithmetic, persisted data or journal transfer on the UI thread. Existing root,
subpath and large-journal checks remain required.

## Extreme chart scales

Visual percentages normalize decimal strings to a bounded approximate significand
and exponent before conversion to floating point. This avoids overflowing huge
quantities or losing an entire tiny-valued series. The maximum is found with a
loop instead of spreading all months into a function call. Values below one scale
to the actual series maximum; zero bars remain empty. Category bars retain a 1%
minimum for nonzero amounts, while monthly bars have no minimum and ratios below
floating-point resolution may be visually zero. Exact labels, totals, signs and
worker ranking remain independent of this approximate geometry.

Unit cases cover 400-place amounts, signed/zero values and a 150,000-value series;
production-browser cases verify category/month proportions and source drill-down
for huge and tiny journals. This adds no journal scan or financial arithmetic on
the UI thread. The monthly chart now mounts at most 12 bars per page; selectors still mount all
months. This establishes no new memory/latency guarantee.

## Monthly chart pagination regression

The monthly chart consumes existing worker aggregates in pages of at most 12 bars.
Approximate scale percentages are memoized per completed monthly series and shared
across pages; React does not compute financial totals or scan journal postings.
The full monthly aggregate payload remains in memory, so this bounds chart DOM,
not report-transfer size. Month selector virtualization remains future work.

Production-browser cases browse 121 months through the final result at narrow width,
verify page-independent proportions and empty zero bars, keyboard month toggling,
focus retention/fallback, scroll reset, source drill-down, empty/invalid reports and
same-name replacement. Existing root/subpath and large-journal regressions remain
required; these cases do not establish a device-wide latency or memory guarantee.

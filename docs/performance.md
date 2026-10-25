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
- Core streams source-span line nodes while parsing, without retaining an extra
  syntax tree or split-line array. Explicit syntax inspection can opt into a tree.
- File decoding, local API fetching/JSON decoding, parsing, direct balances,
  substring searching, and exact filtered totals run in that worker.
- Full-journal direct and inclusive account arrays are built in the worker. The
  hierarchy uses iterative traversal and explicit depth/node limits; both arrays
  still cross in the summary, so high account counts remain a memory concern.
- React receives a summary and report aggregates, not the entire transaction set.
  The register requests only the visible window, with a small overscan.
- TanStack Virtual renders the register and account balances. The register has no
  arbitrary first-200-result limit; the entire result set remains browsable.
- Search debounces for 100 ms. Queries yield every 8,192 records to allow newer
  requests to cancel stale scans; request IDs discard stale UI responses.
- Details and original source snippets are retrieved on demand.
- Charts show the top 30 expense categories; the account view exposes the others.
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
These cases do not establish a high-account-count memory SLA.

## Next improvements

Incremental/streaming parsing, source byte offsets, query indexes (date, account,
commodity), large account/commodity selector virtualization, import progress and
cancellation, reduced duplicate memory, realistic include graphs, and explicit
budgets for memory, time-to-first-result, and p95 input latency.

Changes to the parser or explorer should preserve this regression and add evidence
for any stronger performance claim. Never move heavy work back onto the UI thread
just because a demo journal is small.

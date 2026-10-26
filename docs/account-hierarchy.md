# Account hierarchy balances

The Accounts view now starts with **Include subaccounts** enabled. It shows an
indented hierarchy of posted accounts and any parent paths needed to connect them.
A parent row includes its own direct postings and all descendants, separately for
each commodity. Turning the option off restores the flat direct-posting view.
Closed accounts and zero commodity balances remain visible and searchable. Zero
parent subtotals retain their descendants and original direct postings; a zero
balance does not remove the transactions that produced it.

Separate disclosure buttons expand/collapse branches without filtering the register.
Account names and amounts remain drill-down buttons.

For example, if `assets:bank` has 8 USD of direct postings, checking has 2 USD and
savings has 3 USD, the inclusive bank row is 13 USD. Its direct-posting tooltip is
8 USD. `assets:banking` is a different branch and contributes nothing to that row.
Parent totals overlap their child rows: **do not sum the displayed rows together**.
No synthetic grand total, currency conversion, net-worth or account-type statement
is inferred from this display.

## Scope and drill-down

Both modes use the entire validated journal, independent of register date, account,
text, status and commodity filters. All commodity quantities remain separate, and
zero subtotals retain their commodity identity. Implicit parents can have no direct
postings while still showing a nonzero inclusive balance. Unused account declarations
are not added; this view covers posted accounts and their required parents.

Clicking an account filters that account **and its descendants** in either display
mode, using the existing segment-aware account filter. The register then applies
its other filters to individual postings. Its scope can be smaller than the full
balance above it. Details still show the complete original transaction and source.
The row display toggle does not change query scope, journal data or report totals.

Plain `=` balance assertions continue to check direct account balances, regardless
of the display option. Inclusive/total assertion forms are still unsupported.
Account typing is unchanged; no accounting category is guessed for these rollups.

## Folding and keyboard controls

A newly loaded journal starts fully expanded. Use the disclosure beside a parent
to hide or show its descendants; its inclusive amount always includes the complete
subtree. Closing/reopening an ancestor preserves its children's previous folds.
**Collapse all accounts** closes every branch and shows only top-level rows;
opening one then reveals its still-collapsed child branches. **Expand all accounts**
opens every branch. A counter distinguishes shown rows from total hierarchy rows.

Direct-posting mode is flat and shows all posted accounts. Switching back restores
the hierarchy's folds. Switching modes or using an all-accounts action resets the
scroller; a single-branch action keeps the parent in view. Folding and display mode
do not change any register filter or saved preset.

Native disclosure buttons support Tab, Enter and Space and expose `aria-expanded`.
The virtualized list exposes each mounted row's position and total visible row
count. Focus returns to the initiating disclosure after its updated row arrives,
unless the user moved focus elsewhere. Full account names remain in button text
and titles even when visually clipped. This is a disclosure list, not an ARIA tree
widget; arrow-key/roving-focus tree navigation is not claimed.

Fold state stays in the worker's memory for the loaded journal. Switching between
Overview/Accounts or changing report filters preserves it. Successful replacement,
closing/reloading journals, or a page refresh resets it, even with identical source
names. Failed reads/report construction retain the previous complete hierarchy and
its folds. There is no URL or browser-storage persistence.

## Finding accounts

**Find an account** searches full account paths by a literal, case-insensitive
substring. Surrounding query whitespace is ignored. Dots and other punctuation
are literal text, not regular expressions or hledger query syntax. Unicode case
matching uses JavaScript's lowercase rules; no accent folding is implied.

In inclusive mode, matches are shown with their ancestors for context. Ancestor
rows are labelled separately, and the result counter distinguishes matches from
context rows. A match inside a folded branch is temporarily revealed. Fold controls
are disabled while searching; clearing search restores the exact prior fold state.
A matching parent also matches its descendants because their full paths contain
that parent path. Direct mode searches only posted account names and adds no
implicit parents. Search persists when switching modes or Overview/Accounts.

Search changes **row visibility only**. Every amount, including ancestor amounts,
retains its full-journal direct/inclusive scope and all commodities. For example,
searching for checking can show a 2 USD checking match beneath its 13 USD bank
parent; that parent still includes its other children and direct postings.
Searching does not change register filters, transaction counts, totals, or saved
filter snapshots. Selecting a result still applies the usual account/descendant
register filter. **Clear account search** returns focus to the search field.

Queries stay in memory. Successful journal replacement/reload (including identical
source names), closing journals or a page refresh resets search. Failed reads/report
construction retain the prior session and query. An empty result has an explicit
message and can be cleared without reimporting. No search state enters URLs,
application storage, offline caches or network requests.

## Core API and worker behavior

`accountHierarchy(journal)` returns `direct` balances and `inclusive` rows. Each
inclusive row includes its full account name, depth, child presence, direct amounts
and inclusive amounts. It refuses every journal diagnostic through the existing
balance-report validation. `balances(journal)` and CLI `balance` retain their direct
semantics.

Core constructs a segment tree from **direct balances only**, adding each direct
amount once to each applicable ancestor. It does not aggregate already-inclusive
rows. Money uses exact decimal addition and quantities remain strings across worker
boundaries. Nodes are returned in deterministic segment preorder; descendants remain
contiguous even where a whole-path lexical sort would interleave sibling names.
Traversal is iterative rather than recursive.

The browser computes the hierarchy and presentation index in its worker. Import
summaries contain `accountCount` and `accountRollupCount`, not complete balance
arrays. The worker indexes contiguous subtrees in one iterative pass and uses
collapsed-branch indices to build the visible sequence without recalculating money.
Normalized names, parent indices and direct-to-inclusive lookup indices support
account search. A reverse pass propagates matching-node context to ancestors in
linear node order, without walking every match's full ancestor chain. Queries are
debounced for 100 ms; IDs are invalidated immediately so earlier replies cannot
replace a newer query while its debounce timer is pending. Already-started account
projections are synchronous within the worker; this is stale-result rejection,
not preemptive cancellation. Financial query cancellation remains independent.
React receives view metadata and requested account windows, with at most 200 rows
per response. This bounds a transfer, not the browsable result set; scrolling can
reach the final row. TanStack Virtual bounds the mounted rows with a small overscan.

The worker checks committed load IDs and active account-view IDs. The client also
checks the latest row-request ID, rejecting stale context/window responses.
Presentation requests do not cancel financial queries. The client tracks the committed load separately from a failed replacement
attempt, so the prior hierarchy remains interactive after a failed import. UI code
neither flattens the complete hierarchy nor performs accounting sums.

## Limits and failed imports

Hierarchy reports support at most 64 colon-separated account segments and 100,000
nodes, counting implicit parents. These are allocation safeguards, not a device-wide
performance or memory guarantee. The explorer builds both arrays on import, so
these limits apply in either display mode. Exceeding them throws a report error rather than
returning a partial hierarchy. Core journal parsing and direct CLI reports do not
acquire those hierarchy-specific limits.

The worker prepares a new import before committing its journal, index, summary and
result IDs. A hierarchy-limit failure retains the previous complete import with a
visible warning, like a failed file read; it cannot mix new transactions with old
balances. Preparing an import temporarily retains the old journal alongside the
new input, increasing peak memory. Financial diagnostics still commit a diagnostic-only import and disable
all reports. Both balance arrays and the new presentation index remain in the
worker. Subtree ends, visible indices, branch lookup and fold state add memory
proportional to account nodes. The normalized-name cache also retains text
proportional to the complete account paths; search adds temporary match/context
flags. Bounded windows avoid cloning the complete arrays
into React. This does not establish a lower overall-memory or device-wide limit.

## Evidence and remaining work

The pinned corpus compares hledger 1.52 `balance --tree --no-elide --empty` JSON
quantities, including implicit parents. Ledger 3.3.2 is checked for inclusive totals
of explicitly posted accounts via `total`, with its flat projection; implicit-parent
presentation and mixed-commodity Ledger hierarchy serialization are outside that
comparison. Direct captures still use `amount`, preventing accidental scope mixing.
Reference projections are sorted for value comparison, not a text-layout parity
claim. The [zero-report corpus](conformance.md#closed-accounts-and-zero-report-rows)
compares arithmetic values after excluding only exact zero report rows, while
retaining raw omission/label differences. Product reports still preserve zero
commodity identities and closed accounts.

Unit tests cover direct parent postings, deep nesting, prefix boundaries, case,
multiple commodities, large exact amounts, zero totals, diagnostics and limits.
Browser tests cover both modes, full-journal versus filtered scope, original source
drill-down, mixed quantities, final-account browsing with bounded DOM rows, atomic
failed imports, and the existing 200,000-transaction regression. The disclosure
cases also cover nested fold retention, keyboard focus, mode round trips,
same-name replacements, rejected stale responses, narrow layouts and a synthetic
5,000-transaction/10,003-hierarchy-row journal. They require fewer than 50 mounted
account rows, bounded worker payloads, and browsing through the final leaf after
collapse/expand cycles. These are regression scenarios, not device-wide guarantees.

[Journal-defined account types](account-types.md) and [saved filters](explorer-filters.md)
are implemented separately. Broader keyboard tree navigation, financial statements
and collapse/search-state persistence remain future work. Search regressions also
cover case/punctuation, implicit ancestors, preserved folds, exact context balances,
direct-mode parity, final-match paging, rapid queries, rejected old replies,
failed-read/same-name replacement recovery, narrow Unicode controls and an offline
refresh without persisted queries.

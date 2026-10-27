# Explorer filters and reusable scopes

The explorer's **From** and **Through** controls select an inclusive range of
primary posting dates. Leave either side blank for an open-ended range, or leave
both blank for all dates. Selecting the same date on both sides shows that day.
Native calendar controls enter calendar dates; comparisons use validated ISO date
strings without local-time or daylight-saving conversions.

The filters compose with text search, account drill-down, commodity, and [effective posting status](posting-status.md). A posting must match status,
account, commodity and complete date scope together.
Only matching postings contribute to income, spending, categories and monthly totals.
Rows count each matching transaction once, even if several postings match.

## Month shortcuts and clearing

Selecting a month in the dropdown or monthly chart replaces the date range with
that month's first and last days. Clicking the selected chart month again clears
the date scope. Leap years are handled explicitly by UTC calendar operations.
Editing either date clears the month shortcut so no hidden month restriction remains.

**Clear dates** removes both bounds and the month shortcut while retaining text,
account, commodity and status choices. **Clear filters** also resets the other
optional filters. Successful imports, demo selection, closing journals and local
reload reset the unchanged optional filters, including the date range. Values
changed during an import remain in place and apply to the replacement journal.

Monthly charts show the existing journal months that overlap the selected scope,
with totals calculated only from matching postings in those months. They do not
generate missing calendar months or imply that an entire boundary month is selected.
A custom range may therefore show a partial month's total.

## Previous calendar month comparison

Select a full month with the dropdown, a chart/table month button, or a saved month
scope to compare income, net spending and matching transaction counts against the
immediately preceding calendar month. The comparison uses the same search, account
(and descendants), commodity and effective posting status. Its date scope alone changes
to the full prior month; it never compares a partial month with a full one.

The main metric cards, charts, tables and register remain scoped to the selected
month. The comparison panel shows previous values and signed **current minus
previous** changes. Income uses the existing positive-credit convention. A positive
spending change means more net expense postings; a negative change means less.
Refunds, exact precision and separate commodities are retained. There is no price
conversion, percentage change, budget or claim of financial-statement parity.

Comparisons use effective primary posting dates. A transaction with postings in
both months can count once in each period, with each period summing only its own
matching postings. Account types and canonical alias names follow the same worker
resolver used by ordinary income/spending reports.

**Explore YYYY-MM** opens the previous month under the same non-date filters and
returns keyboard focus to the month dropdown. A month with no journal postings
gets an explicit temporary dropdown option so the selected scope stays visible.
Zero matching transactions produce zero prior totals and an explanation; this
does not establish whether the imported journals cover the period completely.

Manual From/Through edits clear the month shortcut and use the custom-range
comparison described below when both bounds are present. Worker requests combining
a month with narrower bounds still omit comparisons. All-dates
scopes and the earliest supported month (`0001-01`) have no comparison. Months
before year 0001 are outside the comparison feature. Invalid date ranges and
journal diagnostics hide reports; changing scope cannot bypass validation.

Comparison state is derived from the current filter scope, not a separate saved
setting. Restoring a saved full-month scope recreates it. It is hidden while a new
report is pending, and stale replies cannot replace the current comparison.
Calculations share one cancellable worker scan and exact decimal arithmetic; React
receives only a small set of totals/deltas. No comparison data is persisted,
exported in URLs, uploaded or added to offline caches.

## Previous equal-length range comparison

Set both **From** and **Through** to compare a custom range with the immediately
preceding, nonoverlapping range of the same number of inclusive calendar days.
For example, March 1–2, 2024 compares with February 28–29. A one-day range compares
with the prior day. UTC calendar arithmetic avoids local timezone and daylight
saving changes; leap days and year boundaries count as ordinary calendar days.

The panel names the exact prior bounds and uses the same search, account, commodity,
effective posting status, account types, exact totals and signed changes as month
comparisons. Current cards, charts, tables and register keep their current scope.
A split transaction can count once in each period, but each total includes only
postings matching that period and every other posting filter.

**Explore FROM through THROUGH** applies both prior bounds as one filter-history
step, keeps the non-date filters, and focuses **From**. Undo restores the original
range atomically. Saved custom-range filters recreate comparisons when reapplied.
The comparison is derived metadata, not an eighth saved filter or persisted state.

Open-ended and all-dates ranges have no comparison. If the entire preceding range
would extend before year 0001, the comparison is omitted rather than shortened.
Invalid ranges and journals still disable reports. Empty prior results show zero
values with the same journal-coverage caveat as month comparisons. Pending/stale
requests cannot leave a comparison for different date bounds visible.

Choosing a **Month** shortcut still compares full calendar months, which may have
different lengths. Manually entering the same month's dates instead requests equal
calendar-day counts: March 1–31, 2024 compares with January 30–February 29, rather
than the shorter February calendar month. The panel explains which rule applies.
These are explorer comparisons, not new hledger query or financial-statement parity.

## Charts and data tables

Expense categories rank by their exact signed net-spending quantities, descending.
The top-30 chart and the complete paginated category table share that worker order.
Close amounts beyond floating-point precision remain distinct, including the chart
cutoff; refunds and zero balances retain their numeric order. Numerically equal
values retain their existing encounter order, independently of decimal scale.
The order never changes the exact quantities, register membership or commodity scope.
Chart dimensions remain approximate; financial ranking and labels use exact values.

Choose **Tables** above the spending panels for native tables with captions,
column headers, row headers, exact signed net amounts, and the selected commodity.
**Charts** returns to the visual presentation without changing report filters.
Refunds keep their negative sign in either display; no currency conversion is used.

The expense table exposes every matching expense account, including accounts beyond
those displayed in the top-30 chart. Its order follows the same worker report as the
chart. It shows direct account postings, not inclusive hierarchy rollups. Choose
an account with Enter, Space, or a click to filter that account and its descendants,
just as in the chart. Full account names remain available and wrap on narrow screens.

The monthly table shows the same existing journal months and filtered values as the
monthly chart. Choose a month to replace the date range; choose that selected month
again to clear the date scope. Posting overrides and partial boundary months follow
the same matcher as all other reports. A zero month is a filtered result, not proof
that the journal contains all activity for that month.

Each table mounts at most 25 data rows with labelled Previous/Next controls and an
announced result range. Every result can be reached. A new worker report resets
pagination to the first page. Row controls retain keyboard focus during a pending
drill-down; if the new report removes the focused row, focus returns to the table
caption. It does not move focus away from another control used while waiting.
Tables are hidden with the other reports for invalid date ranges or journal errors.

Display choice and page state stay in memory, are not saved in filter presets, and
reset on refresh. Switching between charts/tables or leaving Overview resets table
pages. Tables format existing exact worker aggregates; they do not rescan journals,
perform money arithmetic, export data, or persist financial information.

## Visible scope and saved filters

Active filter chips show search text, an account and its descendants, dates/month,
effective posting status, and the selected commodity. Clear one optional chip without
changing the others. Removing a chip returns keyboard focus to the relevant
control (search for account/search chips, From for dates, or Status).
Dates are one scope: clearing that chip removes both bounds
and any month shortcut. The commodity chip is informational because report totals
always use one selected commodity; use the dropdown to change it.

Expand **Saved filters**, enter a name, and choose **Save current filters** (or
press Enter in the name field). Each preset snapshots all seven filter fields:
search, account, month shortcut, From, Through, commodity, and status. Applying it
restores the whole scope together, including the effective selected commodity,
then runs the existing worker query. Editing or clearing filters does not change
the saved snapshot. Matching presets indicate their active state. View selection
and the account hierarchy's display toggle are not part of a report filter.

Preset names are trimmed, limited to 80 characters, and must be unique ignoring
case. Duplicate names produce a correction message rather than replacing an
existing preset. At most 20 presets are kept for an open journal; remove one to
make room. Removing a preset leaves the current scope intact and returns keyboard
focus to the name field. Long names and filter text remain bounded on narrow
screens, with full text available to assistive technology and in titles.

Saving is disabled during processing or while the date range is invalid. An
existing valid preset can recover an invalid range. Applying a preset or clearing
a chip dismisses any selected transaction detail. Financial scans, cancellation,
and exact arithmetic still run in the worker; preset operations only copy the
small filter configuration.

Saved filters belong to the **currently open journal session**. A newly loaded
journal, closing journals, demo selection, a successful local file reload, or a
page refresh clears them, even if file names are unchanged. A failed file read or
cancelled import retains the prior complete journal, current filters and saved
filters. Clear filters clears optional filter values, not saved presets, and keeps
the selected commodity.

## Undo and redo filter changes

Use **Undo** and **Redo** in **Filter history** to restore recent report scopes.
Each step restores all seven fields together: search, account, month shortcut,
From, Through, commodity and effective posting status. Month shortcuts, chart/account
clicks, clearing filters/chips and applying a named preset are single steps, so
undoing a month selection also restores its date bounds. Month comparisons are
recomputed from the restored scope by the worker.

Consecutive edits in the same search/date field group while they are no more than
750 ms apart. A pause or another filter action starts a new step. A typing group
that returns to its starting scope disappears from history. No-op changes do not
add entries. A new change after Undo discards the redo branch. Up to 50 recent
steps are retained; older configurations age out as new changes are recorded.

The buttons support normal Tab/Enter/Space navigation and retain focus when a
history boundary is reached. Native text-editing shortcuts keep their normal input
behavior. Invalid date ranges are reversible: Undo can recover the previous valid
scope, while Redo restores the invalid range and its report-hiding correction state.
History does not bypass journal validation.

Saved preset contents, account search/folds, chart/table display, view choice and
scroll position stay outside report history. Applying a preset is undoable without
changing that preset. Clearing active filters leaves their earlier values
recoverable through history for the open session.

History belongs to the current journal. A committed replacement, even with the
same file names or with journal diagnostics, clears both directions. Closing or
refreshing clears it too. Failed reads and cancelled imports retain it alongside
the committed journal. Values typed during an import retain the existing commit
rules, but the replacement starts with a fresh history.

Snapshots contain only small filter configurations; financial matching and totals
still run through the debounced, cancellable worker query. History stays in memory
and is absent from URLs, browser storage, service-worker caches and uploads. Filter
strings can contain private data: closing/refreshing drops application references,
without guaranteeing secure erasure from browser/OS memory. The step count bounds
configurations, not the byte size of arbitrarily long search/account strings.

## Transaction and journal scope

A posting without an explicit date inherits its transaction date. A transaction
outside the range can still appear when one of its posting overrides falls inside
it. Register rows remain grouped and ordered by transaction date; visible amounts
use the same posting matcher as worker aggregates. Details retain every posting,
original transaction date and source reference, including postings outside the
current filter scope.

Direct and inclusive [account balances](account-hierarchy.md) keep their full-journal
scope, independent of date filters.
Parsing, include resolution, transaction balancing and assertions also validate the
whole journal before exploration. A range cannot hide an unsupported line or failed
assertion elsewhere in the source.

An invalid or reversed range shows an accessible correction message and hides the
report panels. The worker independently validates both bounds, rejects invalid
queries and clears their result rows. Fixing the range needs no reimport; the
journal remains valid. Date configuration errors are separate from import errors,
so changing dates does not discard an unrelated file-read warning.

## Responsiveness, privacy and limits

The shared `report-filters` module defines the range configuration, validation and
posting matching used by worker reports and visible register rows. Financial scans
and exact sums remain in the worker. Query IDs, cancellation/yield points, debounce,
on-demand details and virtualized result windows remain in place.

Range state stays in memory. It is not written to URLs, application storage,
service-worker caches or journals, and changing it causes no network request.
Saved filter names and configurations also stay in memory: no localStorage,
sessionStorage, IndexedDB, URL serialization, downloads, or network sync is used.
Offline app-shell caches contain no presets. There are no relative-to-today
presets, shared/exported scopes, or hledger query-language compatibility claims. Calendar/date syntax in journal files is
unchanged; see [posting dates](posting-dates.md) for source support.

Tests cover inclusive boundaries, open ends, leap day and century rules, refunds,
posting overrides, combined filters, invalid range recovery, preserved import errors,
month shortcuts, responsive controls, and filtering then browsing all 200,000
synthetic transactions. Production-browser tests also cover complete preset
restoration across combined filters and commodities, immutable snapshots,
month/date recovery, duplicate/blank names, bounded storage, keyboard controls,
narrow layouts, session replacement, local reload, failed reads, and an offline
refresh with no persisted presets. These scenarios are regressions, not device-wide
guarantees.

## Income by account

Open **Income by account** in the overview to inspect every matching income account
in pages of at most 25 rows. Credits appear positive and reversals reduce income,
using the same exact quantities and account-type classification as the Income card
(including declared gain accounts). Declared/inherited types, child overrides and English-name defaults follow the
existing Income metric.

Rows show direct posting totals by canonical account, ordered by exact signed net
income descending. Each posting contributes once at its own account; hierarchy
rollups remain in the Accounts view. Zero and negative
net accounts remain visible; equal numeric totals retain encounter order. Separate
commodities never mix. Search, account/subaccount, effective status and primary
posting-date filters match the same posting as ordinary reports. Prior-period
comparison totals do not enter this current-period breakdown.

Choose an account to apply the shared account filter and inspect its register and
original source. That filter includes descendants as usual and participates in
undo/redo and saved filters. The disclosure and its current table page are view
state, not additional saved filter fields. Successful journal replacement/reload
closes the disclosure and resets pagination. Invalid journals and date ranges hide
it with the other reports.

The worker owns aggregation, credit-sign normalization and exact ranking. React
receives account aggregates and the committed report's commodity label, so pending
currency changes do not relabel an old income result. The native keyboard disclosure
mounts no table rows when closed; an open table mounts at most 25 data rows. Paging
bounds the DOM, not aggregate payload size or worker memory. No journal or view
state is persisted or embedded in URLs.

## Currency labels while reports update

Changing filters starts a worker query while the previous completed figures may
remain visible. Commodity controls show the requested scope; metric cards, chart
values and table captions keep the commodity stored with their completed report
until the next result arrives. For example, 10 USD income remains labeled USD
while an EUR query is pending, then updates to that query's EUR value and label
together. Selecting No commodity follows the same rule; no conversion is implied.

The existing background-update status remains visible. Metric/chart regions expose
`aria-busy`, and the transaction metric says **Report updating** during the query.
Comparisons remain hidden while pending. Superseded replies cannot replace a newer
report's values or labels, and invalid date ranges or journals still hide reports.
These are display-state rules; financial calculations and saved filters are unchanged.

## Chart scales

Category lengths and monthly heights show absolute magnitudes relative to the
largest value in that chart, including when all values are smaller than one.
Refunds keep their signed exact labels. Category bars give nonzero values a 1%
minimum for visibility; zero amounts have empty bars. Geometry is approximate,
including for quantities beyond floating-point range; exact labels and tables
remain the source for close comparisons. Very small monthly ratios may be
visually zero. No currency conversion is applied.

## Monthly chart pages

The monthly spending chart shows up to 12 months per page in chronological order.
Previous/Next buttons and a month-count indicator make every report month reachable
without mounting the complete series. Heights use the full report's maximum,
so moving between pages does not rescale equal values. Zero months have empty bars.
Use the exact labels or Tables view to compare close values.

Selecting a month applies the shared date scope; selecting it again clears that
scope. A completed report resets the chart to its first page. The current page
stays mounted while a query is pending, with chart controls disabled and busy state
exposed. Keyboard focus stays on a surviving selected month; if the result removes
that month, focus returns to the chart region unless the user has moved elsewhere.
Page changes reset horizontal scrolling. Successful journal replacement resets page
state; failed/cancelled replacements retain the committed chart. Page state is
in-memory view state, excluded from filter history and saved presets.

## Monthly income

Open **Income over time** for exact monthly net income in chronological order,
with at most 25 data rows per page. Values use the same classified income postings
as the income metric: credits are positive, reversals reduce income, and negative
months remain negative. Declared/inherited revenue and gain types, aliases, effective
posting dates and every shared posting filter apply. No currencies are combined.

The series includes journal months inside the date scope, including zero-income
months where the journal has postings. It does not invent absent calendar months;
months containing only other commodities or account types may show zero. Boundary
months reflect only matching days/postings. Select a month to apply the shared
month shortcut, or select it again to clear that date scope; other filters remain.
Undo/redo, comparisons, presets and register/source drill-down use existing paths.

The disclosure starts closed and mounts no table until opened. Successful imports
reset it, while failed/cancelled replacements retain the open journal. Pagination
and disclosure state stay in memory and are excluded from history/presets. Pending
queries keep completed amounts and commodity labels with disabled table controls;
new reports reset pagination with the shared table's focus recovery.

## Register boundary navigation

**First transaction** and **Last transaction** scroll to the boundaries of the
current matching register, in its existing newest-first order. They do not change
filters, totals or the selected transaction. Keyboard users can Tab to either
button and activate it with Enter or Space; focus stays on the navigation control.
The controls are unavailable while a report is updating or has no matches.
Changing filters still resets the register to the beginning.

## Monthly income less spending

Open **Income less spending** for exact monthly income minus spending under the
current filters. Positive values mean income exceeded spending; negative values
mean spending exceeded income. Income reversals reduce income and expense refunds
reduce spending. The same journal account-type resolver, aliases, effective posting
dates and same-posting filters used by the overview apply here.

This is not a cash-flow statement, account balance, savings rate or net worth.
Transfers and unclassified accounts do not contribute. An account filter can exclude
income or spending, so read the active scope before interpreting the difference.
Journal months without matching income/expenses remain zero; missing calendar months
are not generated and boundary months may be partial.

The disclosure starts closed and mounts at most 25 data rows when open. Month
buttons use the existing shared filter, undo/redo and preset behavior; selecting
an active month again clears its date scope. Follow matching register transactions
to their original source. Pending queries retain completed values and commodity
labels while disabling drill-down. Successful imports/reloads reset the disclosure;
failed or cancelled replacements retain it. No report state is persisted.

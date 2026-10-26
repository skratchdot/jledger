# Explorer filters and reusable scopes

The explorer's **From** and **Through** controls select an inclusive range of
primary posting dates. Leave either side blank for an open-ended range, or leave
both blank for all dates. Selecting the same date on both sides shows that day.
Native calendar controls enter calendar dates; comparisons use validated ISO date
strings without local-time or daylight-saving conversions.

The filters compose with text search, account drill-down, commodity, and transaction
status. A posting must match the account, commodity and complete date scope together.
Only matching postings contribute to income, spending, categories and monthly totals.
Rows count each matching transaction once, even if several postings match.

## Month shortcuts and clearing

Selecting a month in the dropdown or monthly chart replaces the date range with
that month's first and last days. Clicking the selected chart month again clears
the date scope. Leap years are handled explicitly by UTC calendar operations.
Editing either date clears the month shortcut so no hidden month restriction remains.

**Clear dates** removes both bounds and the month shortcut while retaining text,
account, commodity and status choices. **Clear filters** also resets the other
optional filters. Imports, demo selection, closing journals and local reload reset
the optional filters, including the date range, using the existing reset flow.

Monthly charts show the existing journal months that overlap the selected scope,
with totals calculated only from matching postings in those months. They do not
generate missing calendar months or imply that an entire boundary month is selected.
A custom range may therefore show a partial month's total.

## Charts and data tables

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
transaction status, and the selected commodity. Clear one optional chip without
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
page refresh clears them, even if file names are unchanged. A failed file read
retains the prior complete journal and its saved filters. Clear filters clears
optional filter values, not saved presets, and keeps the selected commodity.

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

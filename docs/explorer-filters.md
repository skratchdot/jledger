# Explorer date ranges

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

## Transaction and journal scope

A posting without an explicit date inherits its transaction date. A transaction
outside the range can still appear when one of its posting overrides falls inside
it. Register rows remain grouped and ordered by transaction date; visible amounts
use the same posting matcher as worker aggregates. Details retain every posting,
original transaction date and source reference, including postings outside the
current filter scope.

Direct account balances keep their full-journal scope, independent of date filters.
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
There are no relative-to-today presets, saved filters or hledger query-language
compatibility claims in this slice. Calendar/date syntax in journal files is
unchanged; see [posting dates](posting-dates.md) for source support.

Tests cover inclusive boundaries, open ends, leap day and century rules, refunds,
posting overrides, combined filters, invalid range recovery, preserved import errors,
month shortcuts, responsive controls, and filtering then browsing all 200,000
synthetic transactions. That scenario is a regression, not a device-wide guarantee.

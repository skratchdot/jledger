# Primary posting dates

A posting can have its own primary date instead of inheriting the transaction date.
This is useful when money leaves one account in one month and reaches another later:

```journal
2026-01-31 Transfer
  assets:savings  100 USD ; [2026-02-01]
  assets:checking
```

jledger supports one inline full-date override per posting:

- A bracket date, such as `[2026-02-01]`, anywhere in the inline semicolon comment.
- A lowercase `date:2026-02-01` tag at the start of that comment or immediately
  following a comma-separated tag. Whitespace after the colon is allowed.

Full `YYYY-M-D`, `YYYY/M/D`, and `YYYY.M.D` dates are calendar-validated and stored
as ISO dates. Bracket contents must contain only the date, without inner whitespace.
An inferred posting amount can still have an explicit date. Original comments,
transaction dates, source names and line numbers remain available unchanged.

## Explorer and accounting scope

Monthly expense charts and [inclusive date ranges](explorer-filters.md) use each
posting's primary date, falling
back to the transaction date. The account, commodity, and month must match the same
posting. Only matching postings contribute to filtered amounts. A transaction with
matching postings in different months can appear in each month, once per result set;
it does not duplicate its spending when all months are selected.

The register remains grouped and ordered by transaction date. Its date column is
labelled accordingly; explicit posting dates appear beside the amounts. Date filters
can show only part of a transaction, while details show every original posting and
both date contexts. Full-journal direct and inclusive account balances are independent of date filters.

Plain balance assertions also follow effective posting dates. The checker sorts
individual postings by effective date, retaining expanded source/posting order for
equal-date ties. Overrides can therefore reorder postings within one transaction.
Transaction balancing still uses the entire transaction regardless of posting dates.
An invalid or unsupported date anywhere disables all reports, as do failed assertions.

Parsing, date matching, assertion validation, and chart totals remain in the worker.
Only visible rows and on-demand details cross to the UI. Ordinary postings omit the
optional date field; core's `effectivePostingDate` helper provides the shared fallback.

## Unsupported date forms

Partial dates/default-year inference, secondary dates (`date2:`, `[=DATE]`, or
`[DATE=DATE2]`), multiple date markers, and dates on continuation comment lines are
explicit errors. Secondary bracket syntax is detected instead of being silently
ignored. Date-shaped malformed comments are conservative errors; jledger does not
try to guess whether they are intended as inert prose. Embedded `date:` tokens that
do not follow the supported tag placement are errors too. Other transaction date
forms and secondary transaction dates remain unsupported.

## Reference evidence

The pinned corpus checks acceptance, exact posting quantities with effective dates,
and full direct balances against hledger 1.52 and Ledger 3.3.2.

- Both tools agree on the sampled inline primary bracket dates and included sources.
- hledger applies `date:` tags; Ledger 3.3.2 accepts them as comments but leaves
  posting dates at their transaction dates. The tag fixture records this difference
  explicitly and compares both expected date projections; it does not claim parity.
- hledger validates assertions in effective posting-date order. Ledger's parsing
  order causes the sampled date-shifted assertion cases to fail. Acceptance
  differences are declared and verified, not skipped silently.
- The reference tools accept some partial, secondary, continuation, or repeated
  date-marker forms that jledger intentionally rejects in this slice.

hledger's JSON print output is returned in transaction-date order, so the capture
runner first restores expanded source order using transaction indices and then
normalizes postings by effective date with a stable sort. Core tests separately
check original parse order and equal-date tie behavior. Ledger's CSV already exposes
its effective primary posting dates. Reports remain direct full-journal balances;
no reference query-language or general filtered-report parity is implied.

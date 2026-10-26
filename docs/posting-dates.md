# Primary posting dates

A posting can have its own primary date instead of inheriting the transaction date.
This is useful when money leaves one account in one month and reaches another later:

```journal
2026-01-31 Transfer
  assets:savings  100 USD ; [2026-02-01]
  assets:checking
```

jledger supports one primary-date override per posting, in an inline comment or
an attached continuation comment:

- A bracket date, such as `[2026-02-01]`, anywhere in the semicolon comment.
- A lowercase `date:2026-02-01` tag at the start of that comment or immediately
  following a comma-separated tag. Whitespace after the colon is allowed.

Full `YYYY-M-D`, `YYYY/M/D`, and `YYYY.M.D` dates are calendar-validated and stored
as ISO dates. Bracket contents must contain only the date, without inner whitespace.
Month/day overrides (`[2/1]`, `[02-01]`, `[2.1]` or `date:2/1`) use the
containing transaction's year. No year directive is needed for a full-date header;
a yearless header must first resolve using an explicit [default year](default-years.md).
The transaction year wins even when the active year directive differs. January
following December does not advance a posting to the next year: use a full date
for a cross-year override. Leap days are validated against the transaction year.

An inferred posting amount can still have an explicit date. Original comments,
transaction dates, source names and line numbers remain available unchanged.

## Continuation comments

An indented semicolon comment directly after a posting can supply its date:

```journal
2024-03-01 Transfer
  assets:savings  100 USD
    ; ordinary note
    ; [2/29]
  assets:checking
    ; date:3/2
```

Both full and month/day forms use the same rules as inline dates, including the
transaction year and restricted lowercase tag placement. Other indented semicolon
notes may precede or follow the marker. The date attaches to the immediately
preceding posting, including a final posting with an inferred amount. Exactly one
marker is allowed across that posting's inline and continuation comments; duplicate
markers are errors even when their dates agree.

The continuation chain ends at a blank line, another posting, an unindented or hash
comment, a directive, a block comment or a source boundary. Date-shaped indented
semicolon comments without an attached posting are errors, including transaction
header comments. This deliberately excludes reference header-comment semantics.
A child include or another selected root can never change a previous file's posting.

The posting's `source` still names its original amount line. A separate optional
`dateSource` names the continuation marker's file/line; inline dates need no extra
location. Details show that provenance and include the marker in the source excerpt,
even when it follows the final posting. Malformed date diagnostics point at the
comment; failed balance assertions still point at the assertion posting.

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

Balance assertions also follow effective posting dates. The checker sorts
individual postings by effective date, retaining expanded source/posting order for
equal-date ties. Overrides can therefore reorder postings within one transaction.
Transaction balancing still uses the entire transaction regardless of posting dates.
An invalid or unsupported date anywhere disables all reports, as do failed assertions.

Parsing, date matching, assertion validation, and chart totals remain in the worker.
Only visible rows and on-demand details cross to the UI. Ordinary postings omit the
optional date field; core's `effectivePostingDate` helper provides the shared fallback.

## Unsupported date forms

Single-day posting dates, secondary dates (`date2:`, `[=DATE]`, or
`[DATE=DATE2]`), multiple date markers, and unattached continuation markers are
explicit errors. Secondary bracket syntax is detected instead of being silently
ignored. Date-shaped malformed comments are conservative errors; jledger does not
try to guess whether they are intended as inert prose. Embedded `date:` tokens that
do not follow the supported tag placement are errors too. Other transaction date
forms and secondary transaction dates remain unsupported, except the explicit
[default-year/month-day transaction header subset](default-years.md). A resolved
month/day header supplies its year to month/day posting overrides.

## Reference evidence

The pinned corpus checks acceptance, exact posting quantities with effective dates,
and full direct balances against hledger 1.52 and Ledger 3.3.2.

- Both tools agree on the sampled full primary bracket dates and included sources.
- hledger uses the transaction year for month/day posting dates. Ledger 3.3.2 uses
  its active default year for partial brackets, which can produce a different year
  or leap-day acceptance. The corpus explicitly captures this difference while
  retaining exact posting-quantity and direct-balance comparisons. Prefer full
  bracket dates when sharing journals with Ledger.
- hledger applies `date:` tags; Ledger 3.3.2 accepts them as comments but leaves
  posting dates at their transaction dates. The tag fixture records this difference
  explicitly and compares both expected date projections; it does not claim parity.
- hledger validates assertions in effective posting-date order. Ledger's parsing
  order causes the sampled date-shifted assertion cases to fail. Acceptance
  differences are declared and verified, not skipped silently.
- The reference tools accept some single-day, secondary, header-comment, or repeated
  date-marker forms that jledger intentionally rejects in this slice.

hledger's JSON print output is returned in transaction-date order, so the capture
runner first restores expanded source order using transaction indices and then
normalizes postings by effective date with a stable sort. Core tests separately
check original parse order and equal-date tie behavior. Ledger's CSV already exposes
its effective primary posting dates. Reports remain direct full-journal balances;
no reference query-language or general filtered-report parity is implied.

The continuation slice adds 12 corpus cases and promotes the original
`posting-date-continuation` case, bringing the corpus to 206. Complete accepted
posting/direct-balance captures cover full/partial dates, tags, ordinary comment
chains, inferred final postings, inherited format/include scope and date-ordered
assertions. Ledger tag/year/acceptance differences remain explicit. Unsupported
secondary, duplicate, header, invalid and separated/orphaned cases retain acceptance
only. Among the previous 194 captures, only the promoted case changes.

# Explicit default years and yearless headers

Declare a year before month/day transaction headers:

```journal
Y2024

2/29 ! Leap-day coffee
  expenses:coffee  0.20 USD
  assets:cash

year 2025

1/2 Salary
  assets:cash  1000 USD
  income:salary
```

The headers resolve to `2024-02-29` and `2025-01-02`. The explorer uses those full
ISO dates for transaction order, month/date filters, monthly charts and assertions.
Original source text stays unchanged. Transaction details show the directive's
file and line when it supplied a year, including directives in an including file.

## Supported subset

- Column-zero `Y2024`, `Y 2024`, and `year 2024`. Whitespace before the numeric
  value is allowed for Y and required for the `year` keyword. Keywords are
  case-sensitive. Use a four-digit year from `0001` through `9999`.
- Month/day headers with `/`, `-`, or `.`, such as `2/29`, `02-29` or `2.29`.
  Existing status, code, description and inline-comment handling still applies.
- An earlier explicit directive is required. jledger does not use the machine's
  current year, and a full transaction header does not establish a default.
- Full calendar validation applies after year resolution: leap days, month lengths
  and zero/out-of-range components are checked before reports are enabled.

A full header always uses its own year without changing the active directive.
Months moving backwards do **not** advance the year. For example:

```journal
Y2024
12/31 December
  expenses:food  1 USD
  assets:cash

1/1 January
  expenses:food  1 USD
  assets:cash
```

Both transactions are in 2024. Use another explicit directive for 2025. Source
order remains intact in core; reports/registers use their existing date ordering.

Month/day [posting overrides](posting-dates.md), such as `[3/1]`, inherit the
resolved transaction year rather than the active directive. A full posting date
still uses its own year. Secondary dates, single-day headers, short years,
`apply year` blocks, joined `year2024`, and wider year forms remain outside this subset. Invalid or
unsupported syntax disables all reports rather than omitting its data.

## Includes and independent files

Default years are file-scoped and follow source order. A selected include inherits
its parent's current year. A directive in that child changes the child and its
nested includes, then the parent's original year resumes after returning. A child
cannot establish a missing year in its parent. Independent selected roots start
without a year; each root must declare its own before using month/day headers.
A directive later in a file does not retroactively resolve earlier headers.

Year state follows the same copied file context as decimal marks. Commodity formats
continue to use their separately documented shared include state. Includes still
resolve only among the explicitly selected source allowlist; dates add no discovery.

## Accounting and source provenance

`Transaction.date` remains a full ISO string. Yearless headers additionally retain
an optional `inferredYear` containing the declared year and directive location.
Transactions from a common directive share that immutable context while parsing;
full-date transactions do not carry inferred-year metadata. The streaming syntax
scanner recognizes supported header/directive shapes without deciding financial
validity or requiring the year context; retained trees still reconstruct the original
BOM, line endings, comments and text exactly.

Core never consults the clock to resolve a year. Financial parsing, indexing,
assertion checks and reports remain in the worker in the explorer. Posting-date
overrides resolve from the normalized transaction year; full posting-date
overrides retain their semantics. Assertions compare exact balances in
effective posting-date order after normalization, not inferred source chronology.
No source files, caches or URLs are written by this feature.

## Pinned reference evidence and Ledger interoperability

The [184-case corpus](conformance.md) includes 18 default-year cases. Supported
fixtures compare resolved posting dates, exact quantities and direct balances with hledger 1.52,
and Ledger 3.3.2 where it accepts the fixture. Includes, independent roots, year
changes, mixed full/partial headers, boundary years and full posting overrides are
covered separately from unsupported-form acceptance.

Both tools agree on sampled explicit directive forms, lack of automatic rollover,
unchanged defaults after full headers, and include inheritance/restoration. The
following restrictions/differences remain explicit:

- Both reference tools can infer a current year without a directive. jledger
  deliberately requires one for reproducible imports. Unsupported unanchored
  fixtures capture acceptance only, so their snapshots do not depend on a clock.
- hledger accepts an inline semicolon comment on the sampled Y directive; Ledger
  rejects that fixture. Omit the inline comment for that interoperability case.
- Ledger rejects the sampled `0001` year while hledger and jledger accept it.
- hledger accepts `Y0000` and `Y10000`; jledger rejects both directive values.
- The out-of-source-date assertion case follows hledger's effective-date ordering;
  Ledger rejects the source-ordered assertion sample. This is not assertion parity.

These samples establish a narrow contract, not general date syntax or report parity.

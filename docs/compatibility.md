# Journal compatibility contract

The target is [hledger 1.52 journal format](https://hledger.org/1.52/hledger.html#journal),
with explicitly documented [Ledger](https://ledger-cli.org/docs.html) interoperability.
Those formats overlap but are not identical. **This prototype is not fully compatible
with either tool**. A small [versioned corpus](conformance.md) is differentially
tested against hledger 1.52 and Ledger 3.3.2; only its sampled posting semantics
and explicitly captured direct/inclusive balances have parity evidence.

| Feature                                                  | Current behavior                                                                                                                                        |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UTF-8, BOM, LF/CRLF                                      | Supported; CLI rejects invalid UTF-8                                                                                                                    |
| Full dates                                               | `YYYY-M-D`, `YYYY/M/D`, `YYYY.M.D`; calendar-validated                                                                                                  |
| Transaction description, status, code                    | Supported; descriptions retain payee/note text                                                                                                          |
| Indented postings, colon-separated account names         | Supported, including single spaces in names                                                                                                             |
| Account/amount separator                                 | Two or more spaces or a tab                                                                                                                             |
| Posting status                                           | Preserved                                                                                                                                               |
| Decimal quantities                                       | Exact signed integers/fractions; strict dot decimals by default, explicit dot/comma marks supported                                                     |
| Commodities                                              | Unquoted identifier/symbol prefixes or suffixes; also no commodity. Quoted names remain errors                                                          |
| One omitted amount                                       | Inferred when explicit amounts use exactly one commodity                                                                                                |
| Explicit multi-commodity postings                        | Accepted only if each commodity independently sums to zero                                                                                              |
| Line comments, inline semicolon comments, block comments | Accepted; original source retained; no general tag query semantics                                                                                      |
| Simple `account NAME` declarations                       | Account type tags with inheritance and child overrides; see [supported subset](account-types.md); no declaration enforcement                            |
| Multiple independently selected files                    | Supported; no inference across file boundaries                                                                                                          |
| Includes                                                 | Selected-source literal relative paths; see [include policy](includes.md)                                                                               |
| Primary posting date override comments                   | Full inline bracket dates and restricted lowercase `date:` tags; see [posting dates](posting-dates.md). Partial/secondary/continuation forms are errors |
| Grouping separators and decimal commas                   | Require compatible explicit formats; three-digit groups only; see [amount formats](amount-formats.md)                                                   |
| Quoted commodities                                       | Error                                                                                                                                                   |
| Commodity and decimal-mark directives                    | Simple unquoted declarations, numeric examples and matching format blocks; file/include scope is documented in [amount formats](amount-formats.md)      |
| Default-year directives                                  | Error                                                                                                                                                   |
| Costs (`@`, `@@`), market prices, lots                   | Error                                                                                                                                                   |
| Plain balance assertions (`=`)                           | Explicit posting amounts; exact direct-account, single-commodity checks in effective posting-date order; see [semantics](assertions.md)                 |
| Balance assignments, total/inclusive assertions          | Error                                                                                                                                                   |
| Virtual/balanced virtual postings                        | Error                                                                                                                                                   |
| Secondary/partial dates, automatic/periodic transactions | Error                                                                                                                                                   |
| Aliases, apply blocks, expressions                       | Error                                                                                                                                                   |

Include graph roots are inferred from selected files without incoming includes;
other selected sources are expanded once at their directive location. This differs
from passing both parent and child as independent `-f` entry points to a reference
tool. Repeated includes are an intentional error, even where hledger/Ledger would
accept them and count the child again. Missing targets, invalid paths, cycles,
normalized source collisions, and graph limits disable all reports. Include support
does not enable unsupported directives or financial syntax in any child.

Primary posting dates drive monthly reports and plain assertion ordering, while
the register stays grouped by transaction date. Ledger ignores hledger `date:` tags;
see [date interoperability](posting-dates.md).

Plain assertions follow hledger effective posting-date ordering and commodity-specific semantics.
Ledger 3.3.2 differs on the sampled out-of-order and mixed-commodity cases; see the
[assertion interoperability notes](assertions.md). No broad assertion parity is implied.

Amount formats are applied in source order. Decimal marks are file-local and
inherited by includes; commodity format changes flow through the expanded include
stream. Independent roots start fresh. Ledger can accept some directives but
produce different values; the corpus declares those differences explicitly. The
explorer displays canonical exact quantities rather than localized report styles.

Unknown syntax yields source-located diagnostics. Core report functions refuse any
journal containing diagnostics, and the web hides all reports for that import.
Partial valid transactions may exist in the parse result for inspection, but they
are not a usable financial report. Empty input is valid and has zero transactions.

Reports expose direct balances, [inclusive account rollups](account-hierarchy.md)
by commodity, and a transaction register. Hierarchy values are full-journal totals;
parent and child rows overlap. CLI balance remains direct. There is no conversion to a base currency, lot accounting, balance sheet,
net-worth calculation, or investment return calculation. No hledger query-language
compatibility is implied by the explorer's substring search.

Income/spending reports use [journal-defined account types](account-types.md),
including parent inheritance and child overrides. Otherwise common English account
names supply defaults. Unrecognized names remain in balances/registers without
being counted as income/spending. Invalid/ambiguous type tags and conflicting
repeated declarations disable reports. The corpus compares sampled hledger type
queries separately from postings and balances; Ledger tag acceptance does not imply
classification parity. General financial statements remain unsupported.

Implementation choices, such as stricter date validation or omitted-amount handling,
are tested as jledger behavior today. The corpus documents which cases have been compared with pinned reference tools.
Uncovered behavior remains jledger-specific; never infer parity from superficial syntax.

The current status filter selects transaction status; posting statuses are preserved
but do not yet override that filter.

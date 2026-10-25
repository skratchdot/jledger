# Journal compatibility contract

The target is [hledger 1.52 journal format](https://hledger.org/1.52/hledger.html#journal),
with explicitly documented [Ledger](https://ledger-cli.org/docs.html) interoperability.
Those formats overlap but are not identical. **This prototype is not fully compatible
with either tool**, and has not yet been differentially tested against their binaries.

| Feature                                                  | Current behavior                                                                  |
| -------------------------------------------------------- | --------------------------------------------------------------------------------- |
| UTF-8, BOM, LF/CRLF                                      | Supported; CLI rejects invalid UTF-8                                              |
| Full dates                                               | `YYYY-M-D`, `YYYY/M/D`, `YYYY.M.D`; calendar-validated                            |
| Transaction description, status, code                    | Supported; descriptions retain payee/note text                                    |
| Indented postings, colon-separated account names         | Supported, including single spaces in names                                       |
| Account/amount separator                                 | Two or more spaces or a tab                                                       |
| Posting status                                           | Preserved                                                                         |
| Decimal quantities                                       | Exact signed decimal integers/fractions; dot decimal mark only                    |
| Commodities                                              | `$`, `€`, `£` prefixes, or unquoted suffix identifiers/symbols; also no commodity |
| One omitted amount                                       | Inferred when explicit amounts use exactly one commodity                          |
| Explicit multi-commodity postings                        | Accepted only if each commodity independently sums to zero                        |
| Line comments, inline semicolon comments, block comments | Accepted; original source retained; no general tag query semantics                |
| Simple `account NAME` declarations                       | Accepted; no declaration enforcement or account type tags yet                     |
| Multiple independently selected files                    | Supported; no inference across file boundaries                                    |
| Includes                                                 | Error, even if all related files were selected manually; resolution is next       |
| Posting date override comments                           | Error; not silently treated as inert comments                                     |
| Grouping separators, decimal commas, quoted commodities  | Error                                                                             |
| Commodity/decimal/default-year directives                | Error                                                                             |
| Costs (`@`, `@@`), market prices, lots                   | Error                                                                             |
| Balance assertions and assignments                       | Error                                                                             |
| Virtual/balanced virtual postings                        | Error                                                                             |
| Secondary/partial dates, automatic/periodic transactions | Error                                                                             |
| Aliases, apply blocks, expressions                       | Error                                                                             |

Unknown syntax yields source-located diagnostics. Core report functions refuse any
journal containing diagnostics, and the web hides all reports for that import.
Partial valid transactions may exist in the parse result for inspection, but they
are not a usable financial report. Empty input is valid and has zero transactions.

Reports currently expose direct account balances by commodity and a transaction
register. There is no conversion to a base currency, lot accounting, balance sheet,
net-worth calculation, or investment return calculation. No hledger query-language
compatibility is implied by the explorer's substring search.

The spending UI recognizes English account prefixes (`expenses`, `income`, `revenue`,
case-insensitive). Other account names are still available in balances and the
register, but are not classified into income/spending cards. Configurable account
types and hledger type-tag semantics are required before general financial statements.

Implementation choices, such as stricter date validation or omitted-amount handling,
are tested as jledger behavior today. They become compatibility claims only after
comparison with the pinned reference tools. Never infer parity from superficial syntax.

The current status filter selects transaction status; posting statuses are preserved
but do not yet override that filter.

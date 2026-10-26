# Compatibility corpus v1

The synthetic fixtures in `packages/core/fixtures/compatibility` are a narrow,
versioned conformance corpus, not a claim of general journal compatibility.
Reference captures use **hledger 1.52** and **Ledger 3.3.2**. No personal journals
are used. The ordinary `pnpm test` suite needs neither executable.

Three separate questions are tested:

1. **Acceptance:** can each reference read and validate the journal? A failure
   can be syntax or accounting validation; exit codes alone do not distinguish
   them. jledger rejects every unsupported fixture and disables balance reports.
2. **Accounting semantics:** supported fixtures compare the ordered posting date,
   description, account, commodity, and exact quantity, including inferred amounts.
3. **Report parity:** supported fixtures compare flat, direct, commodity-specific
   balances; marked fixtures also compare inclusive rollups with explicit scope.
   Marked cases separately compare hledger account classification query sets.
   General hierarchical presentation, query languages, valuation, text layout,
   status inheritance, and rounding/display precision are outside this comparison.

| Cases                                                                                                                                              | jledger                                                   | hledger 1.52 | Ledger 3.3.2                   |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------ | ------------------------------ |
| Salary, refunds, exact quantities, currencies, simple/nested includes, common plain assertions; bracket posting dates; compatible explicit formats | Posting and direct-balance parity                         | Accepted     | Accepted                       |
| Out-of-source-date, single-commodity, or posting-date assertion differences                                                                        | hledger semantics                                         | Accepted     | Rejected                       |
| Costs, repeated includes, balance assignment; secondary/continuation/duplicate date samples                                                        | Reports disabled                                          | Accepted     | Accepted                       |
| Month/day brackets with differing default/transaction years                                                                                        | hledger dates; exact quantities and direct balances agree | Accepted     | Accepted, different year       |
| Hledger `date:` posting tag                                                                                                                        | hledger dates; explicit Ledger difference                 | Accepted     | Accepted, tag ignored          |
| Some inline commodity examples and decimal-mark cases                                                                                              | hledger quantities; explicit Ledger difference            | Accepted     | Accepted, different quantities |
| Conflicting format example                                                                                                                         | Reports disabled                                          | Accepted     | Accepted                       |
| Irregular grouping; total/inclusive assertion samples                                                                                              | Reports disabled                                          | Accepted     | Rejected                       |
| Unbalanced postings, failed/precision/unitless assertions, missing include                                                                         | Reports disabled                                          | Rejected     | Rejected                       |

Account-type fixtures additionally distinguish supported declarations/defaults from
conflicting repeated declarations, duplicate/alternate tags, and ambiguous spacing
that jledger deliberately rejects. Invalid type values fail in hledger but are
accepted as tags by Ledger. Only hledger classification sets are compared; ordinary
posting/balance comparisons against both tools remain separate.

Posting projections use a stable effective-date sort. hledger transaction indices
restore expanded source order before normalization; core tests separately check
that original parse order is preserved. The captured `date` is a primary posting
date, defaulting to the transaction date when no override exists.

Quantities are canonical decimal strings; scale differences such as `0.30` and
`0.3` are ignored. hledger JSON mantissas are read as strings before JSON parsing,
never rounded through JavaScript numbers. hledger balance quantities are read from
exact JSON mantissas, independently of localized display precision. Ledger direct reports use `quantity(amount)` and
`commodity(amount)`, bypassing localized punctuation and inclusive `total`. The
Ledger report cases currently have single-commodity accounts; hledger-only mixed
account cases use its JSON capture. Zero omission, broader commodity styles, and
more date/status variants remain gaps. Include cases compare selected-source bundles with reference
execution of the root journal. Unsupported cases normally record acceptance only. Marked account-type cases
also capture hledger classification queries, separately from posting/balance parity.
Supported marked cases compare used-account sets for A/L/E/R/X/C/V/G; unsupported
ones retain evidence without implying jledger support. See [account types](account-types.md).

## Reproduce

Install the pinned executables and run:

```sh
HLEDGER_BIN=/absolute/path/to/hledger LEDGER_BIN=/absolute/path/to/ledger pnpm test:compatibility
```

The command builds core and compares both live tools with committed captures.
Missing tools, wrong versions, timeouts, and changed results fail the command.
It does not silently skip differential checks. `pnpm test` independently compares
jledger against both captures, so references cannot drift away from core unnoticed.
Reference processes ignore tool configuration and inherited `LEDGER_*`/`HLEDGER_*`
settings and use the `C.UTF-8` locale so non-ASCII account names are decoded
consistently. They receive only explicit synthetic fixture paths.

The CI reference job uses Debian trixie, `ledger=3.3.2-1+b4`, and the upstream
hledger Linux x64 release archive:

- URL: `https://github.com/hledgerorg/hledger/releases/download/1.52/hledger-linux-x64.tar.gz`
- SHA-256: `153e1e69696d5e75b2a13bf23983a0355c35999db713910615c6a536a4cd0a41`
- Debian Ledger package SHA-256 (local validation): `ca99b16a054be8d6f325df2ddd30b1971b3ebb61b45fd322e2a458964b00383b`

To deliberately recapture after reviewing fixture or reference changes, use the
same environment variables with `node scripts/compatibility.mjs --capture` after
building core. Review every capture diff and run both test commands. Capture files
are evidence from the tools, never generated from jledger's own expected results.

## Selected-source includes and remaining scope

The [source-preserving syntax layer](syntax.md) and [selected-source include graph](includes.md)
are implemented. The corpus now contains 145 cases, including posting and direct
balance parity for simple and nested includes, plus acceptance-only captures for
missing and repeated includes. Included sources are supplied explicitly in fixture
metadata; references read the root journal and follow its real relative paths.
The independent-root account-type case explicitly lists `referenceFiles` to pass
both files with repeated `-f` switches. Ordinary tests supply the same named bundle
to core. This preserves the distinction between selected includes and independent roots.

Repeated includes are deliberately rejected even though both reference tools accept
the sample repeated-child case. This is a documented restriction, not parity.
Cycle, path, ambiguity, and graph-limit tests are jledger safety checks rather than
claims about every reference edge case.

The first adapters use a selected-file allowlist, which is narrower than automatic
filesystem traversal under a permitted root. Optional CLI directory discovery would
need explicit allowed-root authorization and additional containment tests. Globs,
quoted names, repeat-inclusion semantics, and explicit root selection remain future
work. No authoring feature is enabled by retaining source text or resolving includes.

## Plain assertions and explicit reference differences

The [plain assertion slice](assertions.md) adds valid/failed checks, split postings,
direct accounts with subaccounts, precision failures, commodityless assertions,
assertions across includes, and continued rejection of assignment/total/inclusive
forms. Two accepted jledger cases explicitly declare `referenceAcceptance`:
hledger accepts their chronological or single-commodity checks, while Ledger 3.3.2
rejects them. The live command enforces these declared acceptance results; ordinary
core tests compare accepted cases with the accepting reference captures. These
cases establish hledger behavior and documented differences, not Ledger parity.

## Primary posting dates

The [posting-date slice](posting-dates.md) adds full inline primary bracket dates,
restricted hledger `date:` tags, include provenance, date-sensitive assertions, and
explicit date-form rejection. `ledgerUsesTransactionDates` marks the tag fixture:
Ledger accepts that comment but ignores its date meaning. Tests compare Ledger's
transaction-date projection and hledger's effective-date projection explicitly,
while still checking exact quantities and direct balances against both captures.
Date-shifted assertion cases declare their acceptance differences using the existing
reference metadata. Worker tests cover posting-scoped filters/totals separately;
no general hledger query/report parity is implied.

## Explicit amount formats

The [format slice](amount-formats.md) adds decimal marks, unquoted commodity
examples/blocks, exact grouping normalization, and include/source-order checks.
`ledgerParity: false` distinguishes known value differences from acceptance
failures: core checks the hledger result, requires the Ledger capture to differ,
and the live runner still verifies every captured Ledger value. Agreement for the
sample format block is tested rather than inferred from inline-declaration behavior.
Report captures now bypass localized display strings and precision. UI reports
remain canonical, with source formatting preserved separately.

## Account hierarchy values

Two [hierarchy cases](account-hierarchy.md) add parent postings plus descendants,
similar prefix names, implicit parents, and separate commodity quantities. Fixture
`hierarchy` metadata selects the live report projections: hledger tree JSON includes
implicit nodes, while Ledger's flat `total` projection covers posted accounts for
the single-commodity case. Core compares matching inclusive nodes and keeps all
existing direct comparisons. This does not claim Ledger implicit-parent layout or
mixed-commodity hierarchy parity, and zero omission remains a corpus gap.

## Explicit default years

The [default-year slice](default-years.md) adds 18 cases covering Y/word directives,
three month/day separators, leap years, explicit year resets, no automatic rollover,
unchanged defaults after full headers, nested includes, independent roots, canonical
year boundaries and full posting overrides. Supported fixtures compare resolved
posting dates and exact direct balances. Inline directive comments, year 0001 and
out-of-source-date assertions explicitly mark Ledger rejection; supported hledger
projections still compare completely. Y0000/Y10000, short years, missing defaults
and invalid leap days keep reports disabled. Unanchored reference samples record acceptance only, without clock-dependent date captures.

## Month/day posting dates

Seven additional cases extend primary overrides to month/day bracket dates and
`date:` tags. The former partial-posting rejection samples now compare complete
postings and balances; their directives make the Ledger captures independent of
the clock. New cases cover transaction/default-year disagreement, no rollover,
all separators, tags, include-local year scope, leap validation, assertion ordering,
and continued rejection of single-day syntax.

`ledgerPostingDatesDiffer` marks bracket samples where Ledger uses its default
year while hledger and jledger use the transaction year. Ordinary tests require
the Ledger date projection to differ, still compare all posting descriptions,
accounts, commodities and exact quantities, and compare full direct balances.
The live runner checks both entire captured date projections. Tag dates retain
the separate `ledgerUsesTransactionDates` comparison because Ledger ignores them.
No capture depends on the reference machine's current year.

## Quoted commodity names

The [quoted-name slice](quoted-commodities.md) adds 18 cases with literal decoded
identities, explicit format/quote aliases, significant spaces and exact assertions.
Ledger's CSV transport escaping and rendered commodity quotes are normalized before
comparison; the original 96 captures remain unchanged. Inline-style and include-reset
quantity differences use the existing explicit `ledgerParity: false` contract.
Unsupported empty, malformed, escaped, delimiter-containing names and costs retain
acceptance-only evidence and disable every jledger report.

## Literal account aliases

The [alias slice](account-aliases.md) adds 17 cases covering exact/descendant
matching, source order, case and name boundaries, multiword names, duplicates,
chaining, clearing, include scope, independent roots, declarations and assertions.
Three `ledgerParity: false` cases capture Ledger's different chaining and scope
semantics. Two supported cases explicitly mark Ledger rejection of end/identity
forms. Unsupported regex, empty-target, semicolon and invalid-name cases retain
acceptance-only evidence. Previous captures remain unchanged; the corpus now has
131 cases, with original names and provenance checked separately in core/browser tests.

## Direct total assertions

The [total assertion slice](assertions.md#total-assertion-evidence) adds 14 cases and
promotes the original `assertion-total` sample. Total checks validate every direct
commodity without summing currencies together; all extra balances must be zero.
Ledger rejects the sampled supported `==` forms, so acceptance differences are
explicit and complete supported projections compare against hledger. Assignment,
inclusive and failed checks retain separate acceptance-only evidence. Other
pre-existing captures remain unchanged.

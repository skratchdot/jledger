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
   General hierarchical presentation, query languages, valuation, text layout,
   status inheritance, and rounding/display precision are outside this comparison.

| Cases                                                                                                                                              | jledger                                        | hledger 1.52 | Ledger 3.3.2                   |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------ | ------------------------------ |
| Salary, refunds, exact quantities, currencies, simple/nested includes, common plain assertions; bracket posting dates; compatible explicit formats | Posting and direct-balance parity              | Accepted     | Accepted                       |
| Out-of-source-date, single-commodity, or posting-date assertion differences                                                                        | hledger semantics                              | Accepted     | Rejected                       |
| Costs, repeated includes, balance assignment; partial/secondary/continuation/duplicate date samples                                                | Reports disabled                               | Accepted     | Accepted                       |
| Hledger `date:` posting tag                                                                                                                        | hledger dates; explicit Ledger difference      | Accepted     | Accepted, tag ignored          |
| Some inline commodity examples and decimal-mark cases                                                                                              | hledger quantities; explicit Ledger difference | Accepted     | Accepted, different quantities |
| Conflicting format example                                                                                                                         | Reports disabled                               | Accepted     | Accepted                       |
| Irregular grouping; total/inclusive assertion samples                                                                                              | Reports disabled                               | Accepted     | Rejected                       |
| Unbalanced postings, failed/precision/unitless assertions, missing include                                                                         | Reports disabled                               | Rejected     | Rejected                       |

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
execution of the root journal. Unsupported cases record acceptance only, with no
suggestion their financial semantics are supported.

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
settings. They receive only explicit synthetic fixture paths.

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
are implemented. The corpus now contains 51 cases, including posting and direct
balance parity for simple and nested includes, plus acceptance-only captures for
missing and repeated includes. Included sources are supplied explicitly in fixture
metadata; each reference still reads the root journal and follows its real relative
paths. Ordinary tests supply that named bundle to core.

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

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
   account balances. Hierarchical reports, query languages, valuation, text layout,
   status inheritance, and rounding/display precision are outside this comparison.

| Cases                                                                                          | jledger                           | hledger 1.52 | Ledger 3.3.2 |
| ---------------------------------------------------------------------------------------------- | --------------------------------- | ------------ | ------------ |
| Salary, refunds, exact quantities, currencies, simple/nested includes, common plain assertions | Posting and direct-balance parity | Accepted     | Accepted     |
| Out-of-source-date or single-commodity assertion differences                                   | hledger semantics                 | Accepted     | Rejected     |
| Commodity format, costs, posting dates, repeated includes, balance assignment                  | Reports disabled                  | Accepted     | Accepted     |
| Total/inclusive assertion samples                                                              | Reports disabled                  | Accepted     | Rejected     |
| Unbalanced postings, failed/precision/unitless assertions, missing include                     | Reports disabled                  | Rejected     | Rejected     |

Chronological posting projections use a stable date sort; original source order
is tested separately in core. Quantities are canonical decimal strings; scale
differences such as `0.30` and `0.3` are ignored. hledger JSON mantissas are read as
strings before JSON parsing, never rounded through JavaScript numbers. Ledger CSV
and both flat balance reports are decoded separately. The corpus includes a
mixed-commodity account in the hledger assertion cases. Supported mixed amounts
are decoded separately from CSV, and Ledger direct reports use `amount` rather
than inclusive `total`. Zero omission, broader commodity styles, and more
date/status variants remain gaps. Simple and nested include cases compare
selected-source bundles with reference execution of the root journal. Unsupported
cases record acceptance only, with no suggestion their financial semantics are
supported.

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
are implemented. The corpus now contains 25 cases, including posting and direct
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

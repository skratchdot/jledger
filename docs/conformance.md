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

| Cases                                                                                | jledger                           | hledger 1.52 / Ledger 3.3.2 |
| ------------------------------------------------------------------------------------ | --------------------------------- | --------------------------- |
| Salary, groceries, refund; exact decimals; separate currencies; large exact quantity | Posting and direct-balance parity | Accepted                    |
| Relative include, commodity format, valid assertion, cost, posting date              | Reports disabled                  | Accepted                    |
| Unbalanced postings, failed assertion                                                | Reports disabled                  | Rejected                    |

Quantities are canonical decimal strings; scale differences such as `0.30` and
`0.3` are ignored. hledger JSON mantissas are read as strings before JSON parsing,
never rounded through JavaScript numbers. Ledger CSV and both flat balance reports
are decoded separately. The first corpus uses one commodity per account and
nonzero final balances; mixed-commodity account report formatting, zero omission,
more date/status variants, and multi-file input remain gaps. Unsupported cases
record acceptance only, with no suggestion their financial semantics are supported.

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

## Next focused milestone: safe include graphs

The first [source-preserving syntax layer](syntax.md) is implemented: ordered nodes
for transaction headers, postings, directives, comments, blank lines, and unknown
syntax, with original text and source spans. Unsupported nodes and errors remain
visible, and financial interpretation still fails closed. Exact decoded-text round
trips are tested; a full grammar and safe transformation API are still required
before exposing any editing feature.

Then add relative include graph resolution through injected adapters. Core receives
named sources and explicit entry points; it performs no filesystem or network reads.
Browser imports must map user-selected relative paths, report ambiguous names and
missing files, and never fetch includes. CLI resolution needs an explicit allowed
root and realpath containment, including symlink checks. Both adapters need cycle,
repeat-include, traversal, depth/size, and source-order tests against these pinned
references. Define glob and duplicate semantics from reference evidence before
supporting them. Keep decoding, graph traversal, parsing, and reports in the worker
for the browser, and extend the large-journal regression with a multi-file scenario.

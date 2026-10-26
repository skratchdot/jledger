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
3. **Report arithmetic parity:** supported fixtures compare nonzero flat, direct,
   commodity-specific balances; marked fixtures also compare inclusive rollups with explicit scope.
   Marked cases separately compare hledger account classification and effective
   posting-status query membership.
   General hierarchical presentation, query languages, valuation, text layout,
   zero-row presentation and rounding/display precision are outside this comparison. Only exact zero report rows are excluded; complete
   posting projections retain all amounts, accounts and commodity identities.

| Cases                                                                                                                                              | jledger                                                   | hledger 1.52 | Ledger 3.3.2                   |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------ | ------------------------------ |
| Salary, refunds, exact quantities, currencies, simple/nested includes, common plain assertions; bracket posting dates; compatible explicit formats | Posting and direct-balance parity                         | Accepted     | Accepted                       |
| Direct total / partial inclusive assertions; out-of-source-date or single-commodity assertion differences                                          | hledger semantics                                         | Accepted     | Rejected                       |
| Costs, repeated includes, balance assignment; secondary/header/duplicate date samples                                                              | Reports disabled                                          | Accepted     | Accepted                       |
| Month/day brackets with differing default/transaction years                                                                                        | hledger dates; exact quantities and direct balances agree | Accepted     | Accepted, different year       |
| Hledger `date:` posting tag                                                                                                                        | hledger dates; explicit Ledger difference                 | Accepted     | Accepted, tag ignored          |
| Some inline commodity examples and decimal-mark cases                                                                                              | hledger quantities; explicit Ledger difference            | Accepted     | Accepted, different quantities |
| Conflicting format example                                                                                                                         | Reports disabled                                          | Accepted     | Accepted                       |
| Irregular grouping; total-inclusive assertion samples                                                                                              | Reports disabled                                          | Accepted     | Rejected                       |
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
JSON mantissas, independently of localized display precision, up to the output
limit documented below. Ledger direct reports use `quantity(amount)` and
`commodity(amount)`, bypassing localized punctuation and inclusive `total`. The
Ledger report cases currently have at most one nonzero commodity per account;
hledger-only mixed account cases use its JSON capture. Canceled commodities may
remain as zero rows in hledger and disappear in Ledger. Broader commodity styles,
multi-nonzero-commodity Ledger serialization and more date/status variants remain
gaps. Include cases compare selected-source bundles with reference
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
are implemented. The corpus now contains 226 cases, including posting and direct
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
assertions across includes, and initially rejected assignment/total/inclusive
forms. Later slices below add direct total and partial inclusive checks. Two accepted
jledger cases explicitly declare `referenceAcceptance`:
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
Report captures bypass localized display strings and commodity display precision,
subject to the JSON output limit below. UI reports remain exact and canonical,
with source formatting preserved separately.

## Account hierarchy values

Two [hierarchy cases](account-hierarchy.md) add parent postings plus descendants,
similar prefix names, implicit parents, and separate commodity quantities. Fixture
`hierarchy` metadata selects the live report projections: hledger tree JSON includes
implicit nodes, while Ledger's flat `total` projection covers posted accounts for
the single-commodity case. Core compares matching inclusive nodes and keeps all
existing direct comparisons. This does not claim Ledger implicit-parent layout or
mixed-commodity hierarchy parity. The zero-report slice below adds arithmetic
comparison while keeping raw zero-row representation differences explicit.

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

## Single-commodity inclusive assertions

The [inclusive assertion slice](assertions.md#inclusive-assertion-evidence) adds 16
cases and promotes the original `assertion-inclusive` sample, bringing the corpus
to 161 cases. Parent checks include descendant postings exactly once at colon
boundaries, in effective posting-date order, and only in the asserted commodity.
Supported projections agree with hledger; each sampled Ledger rejection is explicit.
Assignments, total-inclusive syntax and malformed operators remain unsupported.
Only the promoted sample's hledger capture changes among the previous 145 cases.

## Closed accounts and zero report rows

The zero-report slice brought the corpus to **177 cases**, adding 16 zero/residual cases. Existing
161-case captures remain unchanged. New cases cover closed accounts, canceled USD
and EUR, unitless/quoted commodities, zero parents with nonzero direct postings,
aliases/includes, refunds, direct/total/inclusive assertions, large exact offsets,
and a small residual below the declared commodity display precision.

Default reference reports can omit accounts with zero balances. `emptyBalances`
selects `balance --empty` for marked fixtures only; hierarchy captures already use
`--empty`. Ledger can also omit a directly nonzero parent whose inclusive total is
zero, even with `--flat` and the direct `amount` expression. The marked parent case
uses `--empty` to retain its full direct values rather than weaken their comparison.
Ledger zero rows from this query have no commodity name; hledger retains names.
Captures preserve all these observed rows, quantities and omissions unchanged.

The offline comparison projects **report rows only**, excluding quantities that
are exactly zero using decimal-string arithmetic. It does not sum rows, convert
currencies, round, use tolerances, or remove any posting. Every nonzero account,
commodity, sign and exact quantity still has to match. An omitted or rounded-away
nonzero balance fails. This establishes arithmetic parity, not account-presence,
zero commodity-label or text-layout parity with the reference presentation.
Mutation checks protect that distinction. Raw captures still have full live
verification, including all zero rows and their names/omissions.

This projection never runs in product code. jledger retains closed accounts and
zero commodity identities in direct/inclusive reports. Core/browser checks protect
zero accounts beside nonzero commodities, purchase/refund drill-down, full-journal
account scope under date filters, and exact finer residuals.

### Reference JSON precision limit

Pinned hledger 1.52 JSON quantity output limits fractional precision to ten decimal
places, even though its internal validation and plain/CSV printing retain finer
quantities. Observed probes of `0.010000000000000001` print a JSON quantity of
`0.0100000000`; a `0.000000000000000001` assertion against zero still fails.
The differential residual case uses ten places (`0.0000000001`), below a declared
two-place display style, and both pinned captures retain it exactly. It would fail
comparison if a report rounded it away. This is not parity evidence beyond the
JSON output limit. The opt-in CSV capture below provides separate finer-precision evidence.
Core/browser checks separately protect `0.000000000000000001` in jledger. The failed
assertion case records reference rejection at that finer precision. No production
money arithmetic is rounded to accommodate reference output.

## Effective posting status

The [posting-status slice](posting-status.md) adds seven cases, bringing the corpus
to 184. Both tools accept the journals, and complete posting and direct-balance
projections still compare. Each marked `postingStatuses` case also captures three
hledger register membership queries: Cleared (`status:*`), Pending (`status:!`) and
Unmarked (`status:`). The comparison checks selected effective dates, descriptions,
accounts, commodities and exact quantities without dropping any selected posting.
These 21 captures establish the sampled hledger status semantics separately from
report parity. No Ledger status-query parity is claimed. All previous 177 reference
captures remain unchanged. General hledger query parsing remains unsupported.

## Exact high-precision reference quantities

Four `exactHledger` fixtures bring the corpus to **188 cases**. They compare both
pinned tools for a `0.000000000000000001` residual below a declared two-place USD
style, a unitless 25-place residual beside an amount larger than JavaScript's safe
integer range, a quoted commodity and CSV-quoted description, and full primary
posting dates with exact inclusive rollups. All previous 184 captures are unchanged.

For these marked cases, hledger `print --round=none -O csv` supplies exact posting
quantities. JSON still supplies expanded source order and effective posting dates:
print CSV's date column contains the transaction date, not each posting override.
The harness checks row counts and every ordered description/account/commodity
identity before substituting CSV quantities. Unexpected CSV headers, shapes or
non-decimal quantities fail rather than silently weakening comparison.

Tree CSV renders indented leaf names rather than full account paths. For inclusive
captures the harness pairs rows with the JSON report's full identities, checking
row counts, ordered leaf names and commodity names before retaining CSV quantities.

Direct and inclusive reports use `balance --layout=bare -O csv` with an explicit
`--commodity-style` for each reference commodity, including the unitless one.
Each style's precision is the largest canonical posting scale **from the reference
CSV**, not from jledger. Addition/subtraction cannot require finer scale than the
input postings, so this retains exact balances while overriding narrower journal
display styles. Commodity identities remain separate; no totals are reconstructed
from core or from summed report rows. This method covers the current additive,
unvalued subset only, not costs, conversions, averaging or arbitrary reference
reports. Marked status-query captures still use JSON and cannot also select this
path; the harness rejects that combination until exact membership capture exists.

Large JSON mantissas may use scientific notation. The harness quotes the entire
numeric token before JSON parsing and expands integer mantissas with string
operations, preserving all emitted digits. This does not restore digits already
rounded by hledger JSON. Ordinary fixtures retain the existing JSON path and its
ten-place fractional limit; selecting exact capture is explicit. Ledger continues
to use its existing quantity expressions and CSV postings. The fine residuals and
large quantities agree with core, and mutation checks reject rounded-away balances.
No product behavior, arithmetic, display precision or storage policy changes.

## Literal include paths with spaces

Six cases bring the corpus to **194**. Supported cases cover a spaced filename,
Unicode and spaced directories, doubled internal spaces, nested parent traversal,
inline comments, and inherited commodity formats/default years with exact assertions.
Complete postings and direct balances compare against both tools when accepted.
The inline-comment case explicitly records Ledger 3.3.2 rejection: it treats the
semicolon suffix as part of the path, unlike hledger 1.52. Missing and double-quoted
targets retain rejection evidence from both tools and disable jledger reports.
All previous 188 captures remain unchanged. This slice grants no discovery, glob,
quote-unescaping, URL, tilde or environment-expansion semantics. See [include
resolution](includes.md) for the selected-source policy and adapter validation.

## Continuation primary posting dates

Twelve cases bring the corpus to **206**, alongside promotion of the original
`posting-date-continuation` sample. Supported cases compare full and month/day
markers, lowercase tags, ordinary comment chains, inferred final postings,
inherited format/include scope and date-ordered assertions. The existing explicit
Ledger tag-date, partial-bracket-year and assertion acceptance differences apply.
Secondary, duplicate, header, malformed and separated/orphaned markers remain
unsupported, with acceptance-only evidence. Header markers can have different
reference meaning; jledger rejects them instead of silently interpreting them as
posting dates. Only the promoted case changes among the original 194 captures.
See [posting dates](posting-dates.md#continuation-comments) for attachment and source
provenance; no secondary-date, authoring or general comment-grammar support is implied.

## Explicit default commodities

Twenty cases bring the corpus to **226**, with all previous 206 captures unchanged.
The [D directive slice](default-commodities.md) covers bare quantities, explicit
currency overrides, grouping/comma/quoted styles, bare assertions, exact fine
quantities, source order, include/root scope and file-local format restoration.
D's fallback format also affects explicit currencies without their own style and
survives a bare commodity declaration; dedicated cases protect those semantics.
Supported complete projections compare against hledger. Ledger bare-quantity/style
differences use explicit `ledgerParity: false`; its bare-assertion rejection is
separate. The explicit-currency case compares fully against both tools. Unsupported
integer/empty/unitless/conflicting directives and costs retain acceptance-only
captures. Directive provenance is jledger metadata checked in core/worker/browser
cases, separately from reference arithmetic. No valuation or currency conversion is added.

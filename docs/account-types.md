# Journal-defined account types

Income and spending follow explicit hledger-style account type declarations,
including inherited parent types. Configure types in the journal; no browser
settings, external service, or persistence is required.

```journal
account dépenses  ; type:X
account revenus
  ; type:revenue
account expenses  ; type:A
account dépenses:other-income  ; type:R

2026-01-01 Synthetic meal
  dépenses:repas  0.10 USD
  assets:cash
```

The meal contributes exactly `0.10 USD` to spending. Postings to `expenses` and its
children are assets, despite their English name. The explicitly typed
`dépenses:other-income` subtree is income rather than spending. Untyped/unrecognized
accounts still appear in balances and the register, but not income/spending totals.
Transaction details show each posting's type, its declaration account and source
line, or that an English-name default was used.

## Supported declaration subset

Use `account NAME` with one lowercase `type:` tag. Inline comments require **two
spaces or a tab** before `;`. A contiguous, indented semicolon continuation comment
also works. Blank lines, hash comments, top-level comments, block comments, and other directives
end the declaration's continuation context. Ordinary comma-delimited tags and notes
can share a comment; general tag queries and account declaration enforcement are
not implemented.

| Code | Accepted word (case-insensitive) | Classification          |
| ---- | -------------------------------- | ----------------------- |
| A    | asset                            | Asset                   |
| L    | liability                        | Liability               |
| E    | equity                           | Equity                  |
| R    | revenue                          | Income                  |
| X    | expense                          | Expense                 |
| C    | cash                             | Cash; also an asset     |
| V    | conversion                       | Conversion; also equity |
| G    | gains                            | Gain; also income       |

Code values are also case-insensitive. `income`, plural `expenses`, and singular
`gain` are not accepted type values by the pinned hledger parser. In particular,
use `G` or `gains`. Supporting a type does not enable costs, conversions, valuation,
or investment reports; unsupported financial syntax still disables all reports.

Declarations apply to the **whole loaded journal**, including earlier transactions,
expanded includes, and independent selected roots. The nearest explicit declaration
on the exact account or an ancestor wins, with case-sensitive account matching and
colon segment boundaries. A child declaration overrides its parent. Untyped
redeclarations do not erase an earlier type. Repeating the same type is accepted;
transaction details retain its first declaration's provenance.

Invalid values, single-space inline type comments, alternate tag key spellings,
duplicate tags (including across continuation lines), and conflicting repeated
account declarations produce source-located diagnostics and disable every report.
Conflicts identify the earlier declaration as well as the current source line.
These are deliberate restrictions: hledger accepts some ambiguous/duplicate forms.
Repeated X/R declarations in either order classify as X in the captured reference
cases; this must not be interpreted as a general first-declaration-wins rule.

## English-name defaults

Explicit declarations take precedence over all name defaults. Otherwise common
English names are recognized case-insensitively, including singular/plural
`asset(s)`, `debt(s)`, `liability`/`liabilities`, `equity`, `income(s)`/`revenue(s)`,
and `expense(s)`. Cash/bank/checking/saving descendants under assets, conversion
children under equity, and gain/loss children under income/revenue have subtype
defaults. These conventions are a convenience, not a substitute for declarations
for other languages or personal naming schemes.

As in the pinned reference, explicitly declaring a subtype elsewhere can suppress
its name inference: declaring a `C` account makes otherwise undeclared `assets:cash`
inherit asset type A; similarly V and G defaults fall back to equity E and income R.
This does not change ordinary income/spending totals because gains are income.
The corpus covers these sampled rules; no general financial statement parity is
implied.

## Core, worker and reference checks

`Journal.accountDeclarations` retains account names, declaration source locations,
and optional canonical types/tag locations. `createAccountTypeResolver(journal)`
refuses diagnostics and builds an isolated cached resolver. It uses declarations
once, walks account paths iteratively, and shares cached ancestor classifications.
`matchesAccountType` includes subtype membership (C in A, V in E, G in R).
The explorer creates its resolver in the worker on import, uses it for exact
filtered reports, and returns classification metadata only with on-demand details.
Changing imports replaces the resolver; no financial configuration is cached on disk.

The [145-case conformance corpus](conformance.md) captures hledger 1.52 classification
queries independently from posting and balance parity. Marked supported cases
compare jledger's used-account sets for A/L/E/R/X/C/V/G against those captures.
Ledger 3.3.2 acceptance, postings and direct balances are compared where supported;
its tag system does not imply equivalent account classification.

Fixtures cover all codes and word values, English defaults, inheritance, child
overrides, same/conflicting repeated declarations, whitespace, non-ASCII accounts,
late included declarations, independent roots, and subtype inference. Unsupported
cases retain acceptance/classification evidence without claiming jledger support.
The live runner ignores tool configuration and uses `C.UTF-8` for reliable decoding.

A configurable account-type UI, general tag queries, statement reports, and broader
conflicting declaration compatibility remain future work.

[Literal account aliases](account-aliases.md) apply to subsequent account declarations
as well as postings. Types attach globally to the resulting canonical name; a type
declared before an alias is not retroactively renamed. Existing conflict diagnostics
still apply when different source declarations resolve to the same account.

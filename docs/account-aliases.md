# Literal account aliases

Use a column-zero directive to normalize account names while reading a journal:

```journal
alias meals = dépenses:repas
account meals  ; type:X

2024-01-01 Lunch
  meals:coffee  0.10 USD
  assets:cash
```

The posting and declaration resolve to `dépenses:repas:coffee` and `dépenses:repas`.
The declared expense type therefore applies to the posting. Original source text
is unchanged. The explorer uses canonical names for balances, account filters,
rollups and income/spending classification; details explain the original account
and the file/line of every matching alias. Free-text search also indexes original
posting account names, so searching `meals` can still find the transaction.

## Matching and ordering

`alias OLD = NEW` matches a complete account name or an ancestor followed by `:`.
It is case-sensitive: `food` matches `food:coffee`, but neither `foodie` nor `Food`.
Single spaces inside names are allowed; leading/trailing directive whitespace is
trimmed. Use literal, valid account names with nonempty colon-separated segments.

Aliases affect subsequent postings and account declarations, not earlier ones.
Each active rule runs **once, newest first**, against the previous rule's result.
For example:

```journal
alias meals = expenses:food
alias food = meals
```

A following `food:coffee` becomes `meals:coffee`, then `expenses:food:coffee`.
Reversing those declarations leaves `meals:coffee`. There is no recursive expansion
or fixed-point loop. Repeated source names usually give the newest mapping priority,
but an older rule can still match the rewritten result. Identity/cyclic mappings
are finite because each rule is evaluated only once.

`end aliases` clears every active alias in the current file, including inherited
ones. It does not clear commodity formats, default years or account declarations.
Completed account-type declarations remain global under their resolved names, as
in the existing account-type contract. Conflicting declarations after aliasing
still disable reports rather than selecting an ambiguous type.

## Includes, limits and unsupported forms

Includes inherit the current alias rules. A child's added/cleared rules are local
and the parent's rules resume on return. Independent selected roots begin without
aliases. Fresh imports also start without previous alias state.

The subset rejects regex/apply aliases, quotes, backslashes, `/`, control characters,
empty names/segments, double-space separators inside names and extra `=` operators.
Inline semicolon comments on alias/end directives are unsupported: hledger treats
semicolons in an alias as literal target text, so silently stripping them would
rewrite an account incorrectly. Put comments on separate lines.

At most 128 aliases may be active in a file, counting inherited rules. Alias sides
and rewritten names are limited to 4,096 UTF-16 code units. Exceeding a limit or
using unsupported alias syntax produces a source-located diagnostic and disables
every report. Existing hierarchy depth/node limits still apply independently.
Plain assertions check canonical direct accounts in effective posting-date order;
aliases cannot hide a failed assertion or unsupported financial annotation.

## Accounting, memory and reference evidence

Resolution stays in the worker parser. Immutable rule contexts cache each input
account's canonical name and shared provenance. Inactive alias scopes add no
per-posting metadata; active scopes add cached names/provenance proportional to
distinct inputs and rule contexts. Original names add text to the existing worker
search index. Bounded transaction windows/details carry optional alias metadata.
This adds memory, not an incremental parser or a new performance guarantee.
No journal, alias, query or provenance data is persisted or uploaded.

The 131-case corpus adds 17 synthetic alias cases. Supported samples compare
canonical posting accounts, exact quantities and direct balances against hledger
1.52 and Ledger 3.3.2 where their semantics agree. One case separately compares
hledger account-type classification after aliasing a declaration. Original parse
order, provenance, limits and fail-closed behavior have independent core tests.

Ledger differs in the sampled chained-alias case and keeps alias state across
included/independent files where hledger restores/isolates it. Those three cases
explicitly declare `ledgerParity: false`; jledger follows hledger and the live
runner still verifies both complete captures. Ledger rejects the sampled
`end aliases` and identity-alias fixtures; their acceptance differences are explicit.
Regex, empty-target, semicolon and invalid-name samples retain acceptance evidence
without claiming jledger support. The previous 114 captures remain unchanged.

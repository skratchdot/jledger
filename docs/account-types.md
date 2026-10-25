# Account types: reference evidence and current restriction

jledger does not yet interpret hledger account type declarations. Inline `type:`
tags on `account` directives and indented continuation comments now produce an
`account-type` diagnostic at the tag's source line. All reports are disabled,
including direct balances. This closes a gap where declarations were ignored and
English-prefix spending classification could contradict the journal.

For example, this journal must not show an expense total:

```journal
account expenses  ; type:A

2026-01-01 Synthetic transfer
  expenses:clearing  2 USD
  assets:cash
```

Ordinary account declarations and comments remain accepted. Transaction and posting
tags named `type` are not account declarations. The guard deliberately also rejects
single-space inline type tags; users should resolve ambiguous syntax before reports.
There is no configurable account-type UI or financial-statement support yet.

## Pinned reference observations

Eight synthetic fixtures extend the hledger 1.52 / Ledger 3.3.2 corpus. hledger
classification is captured with `accounts --used type:CODE` for A, L, E, R, X, C,
and V, independently of financial report projections. Cash also matches asset
queries, so these sets are not mutually exclusive. Ledger acceptance is recorded;
its tag system does not imply the same classification semantics.

The committed cases establish:

- Two spaces before inline `; type:X`, or an indented continuation comment,
  classify the declared account's posted descendants as expenses.
- The word `expense` is accepted in the sampled case.
- A child `type:R` overrides its parent's `type:X`.
- The first of repeated X/R declarations wins in the sampled case.
- One space before `; type:X` does not classify the posted descendant as X.
- An invalid Q type is rejected by hledger but accepted by Ledger.
- The child-override sample gives the same classification with or without a blank
  separator before the transaction.

These are sampled observations, not a complete type specification. Ordinary tests
check the selected observations and fail-closed behavior. The live differential
command verifies every captured classification set against the pinned executable.
All fixtures are synthetic, including the non-ASCII account names; the runner uses
`C.UTF-8` rather than ASCII `C` for reliable decoding.

## Next implementation slice

Add browser-safe account declaration metadata with source locations, then a cached
core type resolver shared by worker reports. Test explicit declarations against
name inference, include/independent-root ordering, all accepted code/word forms,
and conflicting/duplicate tags before enabling them. Preserve exact arithmetic,
worker execution, and diagnostics for any remaining unsupported forms. Implement
income/spending classification first; statements and UI overrides remain separate.

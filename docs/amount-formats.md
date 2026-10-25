# Explicit amount formats

Amounts remain exact decimal strings internally. Journals can now declare how dots
and commas are read, without converting quantities through floating point:

```journal
commodity EUR
  format 1.000,00 EUR

2026-01-01 Opening
  assets:cash  2.000,00 EUR = 2.000,00 EUR
  equity:opening
```

A compact `commodity 1.000,00 EUR` declaration is supported too. An unquoted bare
`commodity EUR` declaration resets that commodity to the default parsing style.
A simple `format` subdirective must immediately follow its commodity declaration
(or ordinary line comments) and name the same commodity. Other indented attributes are errors.

Alternatively, `decimal-mark ,` or `decimal-mark .` selects a mark for all amounts
read in that file, including commodityless amounts. Later declarations affect later
amounts only. Without an explicit mark or commodity format, amounts retain the
existing strict dot-decimal interpretation: commas and grouping are not guessed.

## Supported subset

- Exact signed integers and fractions with an integer part. Suffix commodities and
  unquoted identifier prefixes require whitespace; `$`, `€`, and `£` prefixes can
  be adjacent to quantities. Quoted commodities remain unsupported.
- A numeric commodity example must contain a fractional separator. Its last dot or
  comma determines the decimal mark; any other separator is grouping. Its numeric
  precision does not round postings, assertions, balances, or explorer totals.
- Under an explicit mark, the opposite separator can group the integer part in
  three-digit groups, with one to three digits in the first group. Ungrouped
  integers can be any length. Fractions cannot contain grouping separators.
- Leading-fraction forms, trailing separators, space/apostrophe grouping, Indian
  grouping, integer-only format examples, expressions, costs, and other financial
  syntax outside the compatibility contract remain errors.
- A format example must agree with an active `decimal-mark`. Conflicting examples
  are rejected rather than interpreted with a guessed style. hledger can accept
  some such conflicts or irregular grouping; these are intentional restrictions.

For example, with comma as the explicit mark, `1.234 EUR` means exactly `1234 EUR`,
while `1,234 EUR` means exactly `1.234 EUR`. Without an explicit format, `1.234 EUR`
retains its dot-decimal meaning and `1,234 EUR` is rejected. Both posting amounts
and assertion quantities use the context active when their source line is read.

## Includes and independent roots

These rules follow the sampled hledger 1.52 behavior:

- `decimal-mark` is local to a file, inherited by its included children. A change
  made in a child does not change its parent's mark on return.
- Commodity format changes flow through expanded includes in source order. A
  child's declaration can affect amounts read later in the parent. A bare commodity
  declaration clears the corresponding format, including an inherited format.
- An explicit file-local mark takes precedence over commodity-specific formats.
- Independently selected graph roots start with independent parsing contexts, as
  hledger does when reading independent `-f` files. Select a shared definitions
  file through an include when it must affect a root's input interpretation.

The selected-file include policy is unchanged: no directory discovery or network
reads. Source strings, comments, paths, and line numbers remain authoritative;
format state is temporary parser state in the worker, not data sent to React.

## Display, interoperability, and validation

The explorer and CLI still show canonical exact dot-decimal quantities with suffix
commodities. These declarations control reading; their display precision, grouping,
and prefix preferences are not applied to reports. Original formatting remains in
source drill-down. A failed declaration, amount, or assertion disables every report.

The pinned corpus now covers explicit marks, inline examples, format blocks, named
and symbol prefixes, declaration changes, includes, and precision beyond a declared
format's display scale. It distinguishes acceptance from accounting parity: Ledger
3.3.2 can accept hledger inline declarations or `decimal-mark` yet interpret some
amounts differently. Cases with `ledgerParity: false` compare jledger against the
hledger capture and require evidence that the Ledger capture differs. Live checks
still verify both complete reference captures. The sampled simple format block
agrees with both tools; no broader Ledger-format compatibility is implied.

Reference balances are captured independently of localized presentation. hledger's
JSON mantissas preserve exact quantities even when display styles round, and Ledger
uses direct account `quantity(amount)` / `commodity(amount)` expressions. The
Ledger report capture currently covers single-commodity account balances; mixed
account cases accepted only by hledger are compared with its JSON capture. Zero
omission and broader mixed-commodity Ledger formatting remain corpus gaps.

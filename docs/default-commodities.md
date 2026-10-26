# Explicit default commodities

A `D` directive assigns a commodity to later quantities that omit one:

```journal
D 1.00 USD
2024-01-01 Groceries
  expenses:food  12.34 = 12.34
  assets:cash
```

Both the posting and its assertion mean USD. The other posting still gets its
amount through ordinary transaction balancing. The sample quantity in `D` is a
format example: it neither scales amounts nor rounds them to its precision.

## Supported subset

Use uppercase `D`, whitespace and an unsigned numeric format example containing a
supported commodity and decimal separator, such as `D 1.00 USD`, `D $1.00`,
`D 1.000,00 EUR` or `D 1.00 "Meal Credits"`. The existing [amount-format](amount-formats.md)
and [quoted-name](quoted-commodities.md) restrictions apply. Inline semicolon
comments are allowed. Integer-only, signed or missing examples, commodityless
reset/no-op forms, expressions, costs, and a following indented `format` block
remain errors. A bare `D` never clears the default silently.

Defaults apply in source order to explicit bare posting quantities and bare
assertion quantities, including zero and negative values. Earlier quantities stay
unchanged. An explicit commodity keeps its identity. Before a `D`, a bare quantity
retains the literal empty commodity. An omitted posting amount is still inferred
from transaction balancing, including an explicit different currency; `D` does not
supply an amount or enable balance assignments.

The `D` format is also the fallback punctuation style for **any** commodity without
its own format, even one named explicitly. For example, under `D 1.000,00 EUR`,
`1.234 USD` means exactly `1234 USD`, not EUR and not `1.234 USD`. Precedence is an
explicit `decimal-mark`, then a commodity-specific format, then the active `D`
format, then strict dot decimals. Grouping still requires valid three-digit groups.
A bare `commodity EUR` removes its specific format; it does not remove the `D`
fallback. Quantities and displayed financial totals remain exact decimal strings.

To avoid ambiguous directive examples, this slice requires new `D`, `commodity`
and `format` examples to agree with the active `decimal-mark` or `D` fallback;
a `D` example must also agree with an existing format for its named commodity.
Conflicting style switches disable reports, including some forms accepted by
hledger. Broader style-switch interpretation remains compatibility work. Previously
declared commodity-specific formats still take precedence when reading amounts.

## Files and provenance

A child include inherits the parent's default commodity **and default format**.
Changes to either in the child stay local; both restore on return. Independent
selected roots start without either default. A `D` does not install a global
commodity-specific format. Ordinary `commodity` format declarations still flow
through includes as documented separately. Missing targets, unsupported child
syntax and any diagnostic disable every report; includes still use selected files.

`Amount.commoditySource` records the directive file/line only when a bare posting
or assertion quantity inherited its commodity. Explicit commodities and amounts
inferred by balancing omit this optional metadata. Parser amounts share the
location object, and ordinary aggregate balances contain only quantities and
commodity identities. Transaction details explain both amount and assertion
provenance. Original journals are unchanged, and parsing remains in the worker.
Runtime-neutral `parseAmount` callers can pass `defaultCommodity`,
`defaultCommodityFormat` and optional `defaultCommoditySource` in `AmountContext`.

## Reference evidence

Twenty new synthetic cases bring the corpus to **226**. hledger 1.52 captures compare
complete postings and direct balances for supported defaults, symbols/quotes,
grouping/comma formats, assertions, source order, include/root scope and format
fallback/restoration. A marked exact-CSV case protects quantities beyond JSON's
ten-place output limit. All previous 206 captures remain unchanged.

Ledger 3.3.2 accepts many sampled directives, but its captured bare postings remain
commodityless and some punctuation interpretations differ. Those cases declare
`ledgerParity: false` while live checks still verify their complete raw captures.
The bare-assertion sample declares Ledger rejection. The explicit-currency sample
retains posting and balance parity against both tools. Unsupported forms retain
acceptance-only evidence; a reference accepting one does not make jledger support
it. No conversion, valuation, automatic price fetching or general Ledger `D`
compatibility is implied.

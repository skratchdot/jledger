# Quoted commodity names

Double quotes allow a commodity name to contain spaces, digits or punctuation:

```journal
commodity "Meal Credits"
  format 1.000,00 "Meal Credits"

2024-02-29 Lunch
  expenses:food  0,10 "Meal Credits" = 0,10 "Meal Credits"
  assets:credits
```

Amounts, plain assertions, commodity declarations and numeric format examples use
the same decoded name. Reports retain exact quantities and separate commodities.
This enables everyday voucher/credit names without adding prices, costs, conversion
or investment accounting.

## Supported subset

- One ASCII double-quoted, nonempty name containing at least one non-whitespace
  character. Unicode and punctuation are literal, with the exceptions below.
- Both prefix and suffix amounts, with or without whitespace between the quoted
  name and quantity: `"Meal Credits"1.20`, `1.20"Meal Credits"`, and
  `1.20 "Meal Credits"`. Prefix signs can precede the quote or quantity;
  double signs remain errors.
- Bare declarations (`commodity "Meal Credits"`) reset that commodity's parsing
  format. Inline numeric examples and following `format` blocks use the existing
  explicit decimal/grouping rules, including include scope and source order.
- Quoting does not create a new identity: `"USD"` and `USD` name the same commodity.
  Case and all internal/leading/trailing spaces are significant. `"US Dollar"`
  and `"US  Dollar"` remain distinct and never combine their balances.
- Posting account/amount splitting preserves the entire amount tail. It no longer
  rejoins amount tokens and collapses whitespace inside a name. Original text,
  BOM, line endings, comments and source locations remain unchanged.

Escaped quotes, backslashes, control/format characters, empty or whitespace-only
names, and names containing `;` or `=` remain errors. Comment/assertion delimiters
are not reinterpreted inside these unsupported quoted forms. A malformed name,
invalid format/assertion, or cost/other unsupported syntax outside the quotes
disables every report. The subset does not add quoted account/include syntax,
expressions or general string-escape compatibility.

## Display and exploration

The shared exact formatter quotes a decoded name when it cannot be represented by
the supported unquoted commodity syntax: `1,234.50 "Meal Credits"` or `1 "123"`.
Names that can be unquoted retain canonical display, so `"USD"` uses the existing
currency formatting. Common currency symbols retain their existing prefix display.
These are read-only report strings, not an authoring/round-trip serialization API.

The explorer's commodity selector uses decoded names as values. Register filters,
charts, spending tables, account balances and drill-down use the same identity;
financial work remains in the worker. Amount displays preserve literal spaces.
No names or data are written to browser storage, URLs, caches or external services.

## Pinned reference evidence

The 161-case corpus includes 18 new quoted-name cases. Supported samples compare
posting identities, exact quantities and direct balances against hledger 1.52 and
Ledger 3.3.2, except explicitly declared Ledger quantity differences. Samples cover
prefix/suffix adjacency, numeric names, Unicode/comma punctuation, significant
spaces, quoted/unquoted identity, format blocks, assertions and includes. Separate
unsupported cases capture acceptance without claiming accounting parity.

Ledger's CSV output backslash-escapes quoted strings, and `commodity(amount)` can
return a rendered, quoted commodity representation. The capture adapter decodes
that transport escaping and strips representation quotes before comparison. This
normalizes report presentation; it does not change the name or financial quantity.
All previous 96 captures remain unchanged.

Ledger's sampled inline format declaration reads `1.234` differently from hledger,
and its bare declaration in the included file retains a previous style instead
of resetting it. Both cases declare `ledgerParity: false`; tests require real
capture differences and the live command still verifies every Ledger value.
Use compatible full format blocks and verify quantities when sharing journals.

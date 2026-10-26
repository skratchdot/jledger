# Balance assertions

jledger supports hledger-style direct `=` / `==` and single-commodity inclusive
`=*` balance assertions on postings
with an explicit amount, using supported [amount formats](amount-formats.md):

```journal
2026-01-01 Opening
  assets:bank  1000.00 USD = 1000.00 USD
  equity:opening

2026-01-02 Groceries
  expenses:food  12.34 USD
  assets:bank  -12.34 USD = 987.66 USD
```

The posting amount moves money; the assertion only checks a running balance. It
never creates an adjustment or changes a posting amount. A failed assertion gives
the original posting file/line, account, expected quantity, and calculated quantity.
Every report is disabled for the entire import. A failed total check also lists up
to five other nonzero balances and counts any remainder; all extras participate in
validation. Transaction details identify the scope of valid total and inclusive
checks and retain the original source.

## Semantics

- Validation follows **hledger 1.52**: individual postings are checked in ascending
  [effective primary posting-date](posting-dates.md) order, with expanded source/
  posting order breaking ties. A posting without an override inherits its
  transaction date. Overrides can reorder postings within a transaction. Parsing
  preserves source order; the validation pass does not reorder the public transaction array.
- All postings count, including amounts inferred by ordinary transaction balancing.
  Assertions are checked only after syntax, include graph, and transaction balancing
  succeed. Unsupported syntax anywhere still disables all reports.
- Plain `=` checks the **direct account**, excluding subaccounts, and only the
  assertion's commodity. The Accounts view's inclusive display does not change
  assertion scope. Other commodities in that account are unchecked. An absent
  commodity has a zero balance; a quantity without a commodity checks the literal
  empty commodity, not an inferred currency from the posting.
- Total `==` checks that same direct account and asserted commodity, and also
  requires **every other commodity balance to be exactly zero**. Subaccounts are
  still excluded. Quantities from different commodities never offset each other.
  Zero balances in other commodities and an absent asserted zero balance are valid.
  Use `==` when a bank/credit statement should describe the complete commodity set.
- Inclusive `=*` checks the asserted commodity in **this account and all its
  descendants**, after the posting. Names match at colon boundaries: `assets:bank`
  includes `assets:bank:checking` but excludes `assets:bankruptcy`, its parents and
  siblings. Other commodities are unchecked. Direct and descendant quantities in
  the same commodity can offset each other; distinct commodities never do. This
  check does not depend on the Accounts view's direct/inclusive display option.
  The `*` must directly follow `=`; spaced `= *` is rejected, as in hledger.
- Comparisons use exact decimal arithmetic. There is no rounding, tolerance, or
  floating-point comparison; `9.90` equals `9.900`, but `0.004` does not equal `0.00`.
- Running balances cover all selected roots and expanded include children. Filters
  in the explorer do not change validation scope or turn an invalid journal valid.

The checker retains posting references with effective dates and running balances
only when an assertion is present. The browser performs this work in its existing
worker. Large journals still consume memory and CPU; this is not a streaming or
incremental assertion algorithm. For accounts checked with `==`, a lazily created
nonzero-commodity set is updated as postings are processed. The first total check
scans that account's commodity map; repeated checks use the set's size and inspect
only the bounded diagnostic sample. Plain-only accounts allocate no such set.

For `=*`, collecting posting references also records checked accounts and their
asserted commodities.
Each distinct posting account caches its matching checked ancestors using exact
colon boundaries. The chronological pass updates only those scopes and commodities;
it never sums all account maps for each check or rolls up an inclusive subtotal
again. Matching paths, scope maps and cached references add temporary memory;
processing cost grows with the number of checked ancestors of each posting. Journals
with no inclusive assertions skip this path. This is not a new depth/memory SLA.

## Unsupported forms

Balance assignments (an omitted posting amount before an assertion operator),
total inclusive assertions (`==*`), costs and expressions remain errors. `==*` needs
separate compatibility work; do not substitute a direct `==` or partial `=*` check.
Grouped/comma quantities require a compatible [explicit amount format](amount-formats.md)
on both sides; undeclared grouping is not guessed. These forms change semantics and are never treated
as plain assertions or ignored. Unsupported format directives, secondary or unattached continuation posting dates and other
unsupported financial syntax remain errors too. Supported full and month/day primary
posting dates retain their documented meaning.

## Ledger differences and evidence

The pinned corpus compares acceptance, ordered posting quantities, and direct
balances with **hledger 1.52** and **Ledger 3.3.2**. Common assertion cases agree.
Sampled differences are explicit rather than hidden behind a parity claim:

| Case                                                                                | hledger / jledger                   | Ledger 3.3.2                                                           |
| ----------------------------------------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------- |
| Direct total `==` and partial inclusive `=*` assertions                             | Supported with explicit amounts     | Sampled forms rejected                                                 |
| A later-dated assertion appears before an earlier opening transaction in the source | Checks in date order; sample passes | Checks during file reading; sample fails                               |
| A USD assertion on a new EUR posting in an account holding USD                      | Checks USD alone; sample passes     | Sample fails because the other commodity is also relevant to its check |

The fixtures declare expected reference acceptance for these differences, and live
verification enforces those expectations. Ledger rejection does not disable the
hledger-compatible jledger import. For comparisons, posting projections are sorted
by effective date with stable same-date source/posting order; original source order has separate
core coverage. Direct Ledger reports use its `amount` expression rather than the
inclusive `total` expression. Supported mixed-commodity CSV amounts are decoded
separately; no currency conversion occurs.

Coverage also includes same-account split postings, direct account/subaccount
separation, exact precision failures, commodityless assertions, selected includes,
direct total and partial inclusive assertions, and deliberate rejection of
assignments/total-inclusive forms. Unit tests cover large quantities beyond JavaScript's safe integer range and unsupported forms.
Browser tests verify successful inspection, failure disabling reports, the existing
200,000-transaction regression, and a 24,000-transaction include bundle with a
checked bank balance at the start of each month.

## Total assertion evidence

The total-assertion slice brought the corpus to 145 cases, adding 14 cases and
promoting the original total sample to supported status. Accepted hledger captures compare complete postings and
exact direct balances; Ledger rejection is explicitly declared for every supported
`==` fixture. Failure cases separately record reference acceptance. The checks cover
other nonzero/zero commodities, unitless balances, direct/descendant scope, absent
zero targets, quotes/formats, aliases/includes, posting-date order, exact precision
and assignment/inclusive rejection at that stage. Partial inclusive support is
described below. Only the promoted original total
capture changes among the previous 131 cases.

Ledger 3.3.2 rejects the sampled `==` forms even for a simple single-commodity
account. This feature establishes the documented hledger subset, not Ledger total
assertion interoperability. Those initial zero-check samples used later nonzero
activity for full report capture. The [zero-report slice](conformance.md#closed-accounts-and-zero-report-rows)
adds genuinely closed accounts and zero assertions without padding activity,
comparing arithmetic values while retaining raw reference presentation differences.

## Inclusive assertion evidence

The inclusive slice brought the corpus to 161 cases, adding 16 cases and promoting
the original `assertion-inclusive` sample. Complete accepted projections compare postings and
exact direct balances with hledger 1.52; Ledger 3.3.2 rejection is explicit for each
supported `=*` case. The checked values are running inclusive balances, distinct
from the corpus's final direct reports. Failure cases have acceptance-only evidence.

Coverage includes nested/overlapping scopes, exact prefix boundaries, other and
unitless commodities, absent zero targets, inferred amounts, date/source ordering,
quoted formats, aliases/includes, exact failures, and assignment/operator rejection.
Core tests additionally cover large quantities and source retention. Production
browser tests inspect scope and failures and import a synthetic five-file bundle
with 12,000 purchases and four checked parent statements, exact totals, bounded
rows, responsive input and final source drill-down. This is regression evidence,
not a device-wide performance guarantee. Among the previous 145 reference cases,
only the promoted sample's hledger capture changes.

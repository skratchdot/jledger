# Posting status filters

The explorer's **Status** control selects the effective status of each posting:

- An explicit posting `*` is **Cleared** and an explicit `!` is **Pending**.
- A posting without a marker inherits its transaction's status.
- **Unmarked** selects only unmarked postings in unmarked transactions. An
  unmarked posting under a cleared/pending header inherits that header; it does
  not override the header back to Unmarked.
- **All statuses** removes the status restriction.

For example:

```journal
2024-01-01 * Groceries
  ! expenses:food  12.34 USD
  assets:bank
```

The expense is pending; the inferred bank posting inherits cleared status. Pending
includes the expense but not the bank posting. Cleared includes the bank posting
but not the expense. Status does not alter journal balancing or assertion scope.

## Shared exploration scope

The **same posting** must match status, account/descendants, commodity and effective
posting-date filters together. Text search still matches the whole transaction's
indexed text. Income, spending, category/month charts and data tables use only
matching postings. The register counts a matching transaction once and previews
only matching postings, up to the existing three-posting bound. A transaction can
match a status through a bank posting while contributing no income or spending.
Filtered postings need not form a balanced transaction; full journal validation
still runs first, and diagnostics disable every report for every filter choice.

Previous-month comparisons keep this same status scope in both periods. Presets,
active chips and undo/redo retain the existing seven-field filter configuration;
status needs no new setting. These configurations remain in memory for the open
journal. Account hierarchy values keep their full-journal scope, independent of
status and the other register filters.

Register icons show the **transaction** status, even when a matching posting has a
different status. Their titles identify that scope. Transaction details show all
postings for context and label each effective status as coming from a posting or
its transaction. Original markers, transaction status, inferred amounts and source
text remain unchanged. A filter never rewrites the journal or marks it reconciled.

## Core API and implementation

`effectivePostingStatus(posting, transactionStatus)` returns the posting's explicit
marker when present, otherwise the transaction status. Raw `Posting.status` remains
the original marker (including the empty string). Resolving status does not mutate
postings or infer a new transaction-wide status from its children.

The worker's shared posting matcher applies status alongside dates, account and
commodity. It no longer rejects whole transactions solely by header status. The
bounded register window uses that same matcher for previews; React performs no new
journal scan or money arithmetic. Exact aggregation, cancellation and stale-response
protection remain in the worker. This adds a per-posting comparison, with no status
index or new memory/latency guarantee.

## Compatibility evidence

The corpus now has 184 cases, including seven status cases. Each marked
`postingStatuses` case separately captures hledger 1.52 `register status:*`,
`register status:!` and `register status:` membership. The projections retain
selected dates, descriptions, accounts, commodity identities and exact quantities;
they compare independently of full posting/direct-balance projections. Captures
use transaction references from hledger JSON to recover header context for sparse
register rows. The documented JSON precision limit still applies.

Cases cover inherited and overridden markers, split/inferred postings, dates,
multiple separate commodities and unitless amounts, aliases/includes, income and
refunds. Both tools accept the complete fixture journals and their complete posting
and balance projections compare as usual. Only hledger status-query membership is
compared; no Ledger status-query or general hledger query-language parity is implied.
Previous 177-case reference captures are unchanged.

Core tests cover all nine posting/transaction marker combinations and source/raw
marker retention. Worker tests cover matching one posting across combined scopes,
comparison periods, exact large/fine/unitless quantities and diagnostic-only imports.
Production-browser tests exercise exact filtered totals, previews and source details,
saved scopes/history, narrow controls and 2,500 pending results from 5,000 synthetic
transactions with bounded rows and final source drill-down. The existing
200,000-transaction regression remains a synthetic responsiveness check.

# Source-preserving syntax

Core exposes a read-only source syntax layer alongside the accounting parser.
The syntax layer underpins selected-source includes and eventual authoring.
Source classification itself does not validate accounting or provide editing/
writing commands.

```ts
import { parseJournalSyntax, printJournalSyntax } from '@jledger/core';

const syntax = parseJournalSyntax({
  name: 'example.journal',
  text: '\uFEFF; note\r\ninclude child.journal\r\n',
});
printJournalSyntax(syntax); // exactly the original decoded string
```

`JournalSyntax` contains a snapshot of the source name/text pair and ordered
`SyntaxLine` children. Each child has a kind, one-based line number, and half-open
`start`/`end` offsets into the original text. Those full spans partition the source,
including its original BOM and LF/CRLF endings. `bodyStart`/`bodyEnd` exclude the
first-line BOM and line terminator for interpretation. Offsets count JavaScript
UTF-16 code units, not UTF-8 bytes or Unicode code points. Empty input has one empty
logical line; a final LF adds a zero-width final logical line. A lone CR remains
body text. These conventions preserve the accounting parser's line numbering.

The kinds distinguish blank lines, line comments, block-comment delimiters and
bodies, transaction-shaped headers, indented posting-shaped lines, selected known
directive names, and unknown text. Classification describes source shape only:

- Invalid calendar dates can still be transaction-shaped.
- Indented metadata can be posting-shaped without being a supported posting.
- Recognizing `include` or `commodity` does not implement those directives.
- Comments, whitespace, tags, unsupported syntax, and spelling remain in the
  original text; they are not normalized, discarded, or semantically interpreted.

This is a line-level syntax tree, not a complete hledger grammar or a stable editor
API. It does not yet group transactions or expose amount/tag tokens. Unknown input
is always retained. Validating a source still requires `parseJournal`, and any
financial diagnostic still disables reports. Exact round trips apply to the
original decoded string, not arbitrary original byte encodings or malformed UTF-8.

## Integration and memory

`scanJournalLines(source)` yields the same line nodes incrementally.
`parseJournal` consumes that iterator directly, so parsing and comment handling
share the source layer without retaining another complete tree or a split-line
array. Accounting transactions, diagnostics, inference, and exact amounts keep
their existing interfaces. The browser still performs all parsing in its worker;
no source tree or whole journal is transferred to React.

`parseJournalSyntax` explicitly opts into retaining the line-node array. Its source
snapshot references immutable string values rather than copying line text into
nodes. `printJournalSyntax` reconstructs from full spans, making dropped trivia or
unknown text detectable by round-trip tests. Read-only types are an API contract,
not a runtime security boundary. There is no supported transformation/write API.

## Validation and next slice

Tests cover source partitioning, exact reconstruction across all corpus files,
Unicode offsets, BOM/CRLF and EOF boundaries, generated unsupported text,
block-comment context, source locations, and continued fail-closed interpretation.
The pinned compatibility corpus protects the existing accounting behavior.
Production browser tests exercise the 200,000-transaction scenario and a synthetic
13-file monthly include bundle with refunds, comments, Unicode, and mixed line endings.

The [selected-source include graph](includes.md) now resolves literal paths within
explicitly supplied sources, preserving ordered edge spans and rejecting invalid
graphs. The accounting parser expands those edges without flattening/rewriting
source strings, keeping diagnostics and transaction drill-down tied to the original
files and lines. Broader include syntax, optional disk discovery, a full grammar,
and authoring remain separate work.

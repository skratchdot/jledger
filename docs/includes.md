# Selected-source include resolution

Literal relative includes now work in both the static explorer and CLI. Every
referenced file must be explicitly selected. Core resolves names from an in-memory
bundle; includes never cause a filesystem read or a network fetch.

For a sibling bundle, import `main.journal` and `child.journal` together:

```journal
; main.journal
include child.journal
```

For nested journals, use **Import journal folder** where supported. It preserves
`webkitRelativePath` in the worker. The picker reads every file in that folder;
choose a folder containing only journals. Multiple-file selection and ordinary
drag-and-drop remain available for flat bundles; they do not infer dropped folder
hierarchies. A replacement import forgets the previous bundle, including its targets.

For CLI check, balance, or server, select every target explicitly:

```sh
pnpm jledger -f main.journal -f parts/child.journal check
pnpm jledger -f main.journal -f parts/child.journal server
```

The CLI supplies canonical selected files with names relative to their common
directory. That directory is a virtual naming root, not permission to read anything
else there. File precedence is unchanged. Reload rereads the original allowlist;
editing an include to reference another file does not grant access to that file.
Selected-path symlink substitution is rejected on reread, and final symlink opens
are refused. Hostile same-user filesystem races remain outside the local-tool
privacy boundary described in architecture.md.

## Supported subset and accounting behavior

- Paths use `/` and are case-sensitive. Targets contain only letters, numbers,
  dots, underscores, hyphens, and slashes. `./` and `../` are allowed when they stay
  within the selected hierarchy. Intermediate directories must be evidenced by
  selected paths; a missing directory or file cannot be normalized away.
- A semicolon comment may follow whitespace after the target. Quoted names,
  spaces in target names, glob patterns, environment/tilde expansion, URLs,
  absolute paths, drive letters, and backslashes are errors. Nothing is fetched,
  expanded, decoded from URLs, or matched by basename.
- Unreferenced selected files are entry points, in selection order. Children are
  expanded at the include directive, in directive order. Selecting a child makes
  it available; it does not also count it as a second entry point. This source
  bundle policy differs from reference CLI commands with independently repeated
  parent/child `-f` entry points.
- Repeated includes, including aliases or a shared child reached from different
  roots, are errors. Both pinned references accept the repeated-child sample;
  jledger intentionally rejects it to avoid unexpected double counting. Repeat
  semantics and explicit root selection need a separate implementation.
- Transactions do not span include/file boundaries. Unknown directives, costs,
  assignment/total/inclusive assertion forms, posting dates, and other unsupported
  financial syntax in children still disable every report. Plain `=` assertions validate across the expanded
  bundle in date order. Includes do not make incomplete totals usable.

Core first validates the complete graph, including rootless cycles. Missing targets,
normalized path collisions, file/directory ambiguity, cycles, repeats, and limits
produce source-located diagnostics. Invalid graphs are not financially interpreted.
Valid graphs retain original source names and line numbers, without concatenating
or rewriting source text. The browser performs mapping, graph traversal, parsing,
indexing, and reports in its worker; React still receives only summaries and rows.

## Limits and evidence

Adapters retain the 256 MiB total input limit and accept at most 4,096 files. Core
limits include depth to 32 files and total directives to 8,192. These are safety
limits, not performance or memory guarantees. Graphs with no include-shaped text
avoid an extra syntax scan; graphs with includes retain only edges, not full trees.

The pinned corpus compares ordered postings and exact flat balances for simple
and nested includes against hledger 1.52 and Ledger 3.3.2. Unit/integration cases
cover path restrictions, missing/ambiguous targets, cycles, repeats, limits,
unsupported child syntax, symlink substitution, and selected-only reload. Browser
cases cover flat imports, real folder imports, replacement forgetting targets,
source drill-down, and a 13-file, 24,000-transaction include bundle. The existing
200,000-transaction regression is preserved.

Automatic disk discovery under an explicitly authorized root, quoted/glob paths,
reference repeat semantics, and explicit root selection remain future work.

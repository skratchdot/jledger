# Import progress and cancellation

Import files, choose a journal folder, or reload the explicitly selected journals
from `jledger server`. The status area reports the current phase:

- **Reading journal files** shows a completed-file count. Files decode serially in
  the worker, with progress updates after every 32 files and at the final file.
  The count describes file reading, not parsing or validation.
- **Reading selected local journals** covers the local server request and JSON
  decoding. The server supplies only the journals explicitly selected at startup.
- **Parsing journals and building indexes** covers parsing, include expansion,
  accounting validation, hierarchy construction and indexing. This phase is
  indeterminate: there is no percentage, ETA, or claim of incremental parsing.

Choose **Cancel import**, including with Enter or Space, to stop the pending
import worker. Cancellation does not wait for the parser to yield. Keyboard focus
returns to the sidebar import button. The previous journal, filters, named presets,
account search and folded branches remain available. With no journal open,
cancellation returns to the empty explorer. You can import again immediately.

Starting another import supersedes the pending one. Closing journals also discards
a pending replacement. Replies already queued by cancelled, replaced or retired
workers cannot commit data or progress. Cancellation applies until a replacement
commits; once that happens, use Close journals or import another set.

## Replacement semantics

The worker that owns the open journal stays alive while a separate worker prepares
the replacement. Only a completed load swaps workers. Successful replacements,
including imports with the same file names, reset unchanged optional report filters,
presets, account search and folds. Report filter values changed while importing
remain in place, so a search typed during a long import still runs on the new
journal. A completed journal with syntax/accounting diagnostics replaces the prior journal and disables every report; cancellation is not a way to
ignore unsupported data.

Unreadable files, failed local requests, worker startup/import failures and hierarchy
construction failures leave the previously committed journal open and show a warning.
Cancelled or unreadable browser replacements of a local-server session retain its
Reload files control. Successful browser replacements switch to browser mode.
The current report refresh resumes after a failed or cancelled attempt.

The explorer retains the previous report during processing; report queries wait
for import completion/cancellation. This does not provide simultaneous querying
of both journals or partial totals from the pending import.

## Memory and privacy

There is at most one committed worker and one pending import worker. Keeping the
old journal available means both sets can coexist in memory during replacement;
this increases peak memory. The 256 MiB/4,096-file input guards are not a promise
that every allowed import fits every device. There is no streaming parser or
reduced-memory guarantee. Serial file decoding avoids issuing all selected file
reads at once, but decoded source text and parsed objects still stay in memory.

Terminating a worker releases application references to that pending import; it
is not a guarantee of secure erasure from browser/OS memory. An already-started
local server disk read can still finish after browser cancellation. Source files
remain read-only. Progress includes only phase/file counts, stays in memory, and
is never stored in URLs, browser storage, logs or offline caches. Offline caches
still contain application assets only; financial data is never uploaded.

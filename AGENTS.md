# Working on jledger

- Use the existing checkout. Cloud tasks already run in isolated environments;
  do not create a Git worktree unless the user explicitly asks.
- Use mise to install Node 26 from mise.toml and pnpm from package.json.
  Keep the lockfile committed.
- The primary product is an excellent private/offline-capable journal explorer.
  Everyday income and spending comes first; investments and net worth follow.
- Keep core browser-safe: no filesystem, Node-only dependencies, network calls,
  or browser globals. Put environment adapters in web and CLI.
- The web stack is React, TypeScript, TanStack Start, Tailwind CSS, and shadcn
  components on Base UI. Use TanStack Virtual for large result lists.
- Keep parsing, indexing, search, and report computation off the UI thread. Do not
  send whole journals to React or render entire result sets into the DOM. Preserve
  cancellation/stale-response protection and the large-journal browser regression.
- Money arithmetic must be exact. Use decimal strings at serialization boundaries;
  never use JavaScript floating-point arithmetic for accounting totals.
- Treat unsupported financial syntax as a diagnostic. Do not skip it and present
  incomplete reports as valid. Keep docs/compatibility.md accurate.
- Never add personal journals, secrets, uploads, analytics, external fonts or
  automatic external quote fetching to the default application. Fixtures are synthetic.
- Journals are read-only in the first milestone. Offline caches may contain the
  public application shell, never journal API responses or user-imported data.
- File precedence is explicit -f/--file > nonempty LEDGER_FILE > ~/.hledger.journal.
- Verify accounting changes with relevant Vitest cases. For explorer/import changes,
  run Playwright against the production artifact. Include subpath validation when
  changing assets, routing, deployment, or offline behavior.
- Build before a fresh typecheck to generate TanStack's route tree. Run pnpm check,
  pnpm test:browser, and pnpm format:check as appropriate.
- Commit messages use Conventional Commits: short, lowercase initial subject
  (prefer <=72 characters), then a blank line and a detailed, helpful body with
  rationale and validation. Example: feat(web): add spending filters
- GitHub Pages deploys automatically on pushes to main after validation. Keep
  manual workflow dispatch available on main for recovery.
- Complete implementation tasks by committing the changes, pushing a task branch,
  and opening a ready-for-review pull request unless the user explicitly requests
  local-only work or a draft. Update an existing task PR when applicable. Include
  validation results and the PR link in the final response. Do not stop after local
  edits or ask for separate permission to submit the PR. If access prevents
  submission, report the specific blocker. Do not merge without an explicit request.

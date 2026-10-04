# Sanchay: Fix Prompts for Code Review Issues

How to use: give the agent `Sanchay_spec.md` and `AGENTS.md` once, then paste **one prompt at a time**, in this order. Merge and run `pnpm typecheck && pnpm lint && pnpm test && pnpm build` after each before starting the next. Prompts 1 to 3 block everything else.

Common preamble (prepend to every prompt):

> Follow `AGENTS.md` and `Sanchay_spec.md`. Keep the change small and focused on this task only. Add or update tests in the same change. Do not change the data model or sync protocol beyond what is described here; if you think a change is needed, write an ADR in `docs/adr/` and stop. At the end, list the files changed and the commands you ran with their results.

---

## Priority 1: Blocking

### Prompt 1: sync_push drops all updates and deletes (critical)

> **Problem:** In `supabase/migrations/20260101000002_sync_rpcs.sql`, `sync_push` handles an existing row with an `UPDATE` that sets only `updated_at`, followed by `INSERT ... ON CONFLICT (id) DO UPDATE SET updated_at = excluded.updated_at`. No other column is ever written, so edits and soft deletes (`deleted_at`) never reach the server after a row's first push, yet the row is reported as accepted. Devices silently diverge.
>
> **Task:** Write a **new migration** (do not edit the old one) that replaces `sync_push` so that when the incoming row wins the LWW check, **all mutable columns** are written. Build the column list dynamically from `information_schema.columns` for the target table, excluding `id`, `user_id`, `created_at`, `server_seq`, and `version` (the trigger owns the last two). Keep: `security invoker`, per-user advisory lock, 500-row cap, timestamp clamp to now()+5 minutes, LWW with the same tie-break, and per-row exception handling. Remove the redundant first `UPDATE`.
>
> **Also fix in the same function:** (a) return each accepted row's real `server_seq` and `version` using `RETURNING` rather than `currval('sync_seq')`, which is wrong across rows and errors when nothing was inserted; (b) when the client row has a stale `updated_at` and is rejected, return the server row as today.
>
> **Acceptance:** Add pgTAP tests in `supabase/tests/` (create the folder) proving: insert; edit of amount, category, note; soft delete sets `deleted_at` and a second client pulls the tombstone; stale write rejected; equal `updated_at` tie-break; clamp of far-future timestamps; `accepted[].server_seq` equals the stored row's value. Also add a TypeScript integration test with two simulated clients against local Supabase (`supabase start`) showing edit and delete converge on both. `supabase db reset && supabase test db` must pass.

### Prompt 2: Production build fails (missing Workbox packages)

> **Problem:** `pnpm build` fails with "Rollup failed to resolve import workbox-precaching". `apps/web/src/pwa/sw.ts` imports `workbox-precaching`, `workbox-routing`, `workbox-strategies`, and `workbox-expiration`, but `apps/web/package.json` only lists `workbox-window`.
>
> **Task:** Add `workbox-precaching`, `workbox-routing`, `workbox-strategies`, `workbox-expiration`, and `workbox-core` as devDependencies of `apps/web`, matching the version of `workbox-window` (7.x). Update `pnpm-lock.yaml`. Confirm `sw.ts` compiles and the generated `dist/sw.js` contains the precache manifest. If `pnpm install --frozen-lockfile` is used in CI, make sure the lockfile is committed and in sync.
>
> **Acceptance:** `pnpm build` succeeds from a clean checkout (`rm -rf node_modules dist && pnpm install --frozen-lockfile && pnpm build`). `dist/manifest.webmanifest` and `dist/sw.js` exist.

### Prompt 3: PWA icons missing, app not installable

> **Problem:** `vite.config.ts` references `/icons/icon-192.png`, `/icons/icon-512.png`, `/icons/icon-512-maskable.png`, and `/icons/shortcut-expense.png`, `shortcut-income.png`, `shortcut-reports.png` (96x96), but `apps/web/public/` only contains `_headers`.
>
> **Task:** Using `sanchay-icon.svg` (teal rounded square, white "S", gold coin), generate all six PNGs into `apps/web/public/icons/` with a small script `scripts/generate-icons.mjs` (use `sharp` as a devDependency) so they can be regenerated. The maskable icon must have **no rounded corners** (full-bleed teal gradient background) and the S and coin scaled to about 70% of the canvas so Android cropping does not clip them. Shortcut icons are the same mark with a small glyph badge (plus for expense/income, bars for reports) or the plain mark if simpler. Also add `public/favicon.svg` (copy of the icon), `apple-touch-icon.png` (180x180, no transparency), and link them in `index.html`.
>
> **Acceptance:** Lighthouse PWA "installable" checks pass on the built app (`pnpm build && pnpm preview`). Manifest has no missing icon warnings in Chrome DevTools > Application.

---

## Priority 2: Sync correctness and security

### Prompt 4: sync_pull ignores page_size and can skip rows

> **Problem:** In `sync_pull` the `LIMIT $3` sits on a query that returns a single aggregated row (`jsonb_agg`), so paging does nothing and every call returns the whole backlog (plus the 1000-sequence overlap) for each table. The cursor is the max `server_seq` across tables, so if paging is fixed per table, a table with more rows can be skipped past. The reset check only inspects `transactions` and compares against the wrong value.
>
> **Task:** New migration replacing `sync_pull`:
> 1. Page correctly: select from each table inside a subquery with `ORDER BY server_seq LIMIT page_size`, then aggregate.
> 2. Make paging safe across tables by one of: a single ordered query over a `UNION ALL` of the requested tables (preferred), or per-table cursors returned and stored by the client. Pick one, document it in an ADR, and update `syncEngine.ts` and `syncState` accordingly.
> 3. Keep the overlap window and idempotent apply.
> 4. Replace the reset check with a small table `sync_purge_state(user_id, purged_through_seq)` updated by the purge job; return `reset_required` when `cursor < purged_through_seq`.
> 5. Create the nightly `purge-tombstones` logic (SQL function plus `pg_cron` schedule) that hard-deletes tombstones older than 90 days and updates `purged_through_seq`.
>
> **Acceptance:** pgTAP tests: pagination returns at most `page_size` rows and `has_more` is accurate; seeding 1,200 rows across three tables and looping until `has_more=false` returns every row exactly once (ignoring the overlap duplicates); reset is returned only after a purge past the cursor. Client test: a fresh device syncing 5,000 seeded transactions completes in pages without duplicates.

### Prompt 5: Whitelist tables in sync RPCs

> **Problem:** `sync_push` and `sync_pull` use `format('%I', v_table)` with a table name supplied by the client. Quoting prevents injection, but any table in the `public` schema becomes addressable.
>
> **Task:** In a new migration, add an allowed-tables check at the top of both functions using the synced table list from the spec (profiles, accounts, loan_terms, categories, tags, recurring_rules, recurring_overrides, goals, goal_contributions, transactions, transaction_tags, attachments, budgets, saved_filters, notifications). Raise an error with a clear message for anything else. Also check that `push_subscriptions` and `fx_rates` are rejected.
>
> **Acceptance:** pgTAP tests that pushing or pulling `fx_rates`, `push_subscriptions`, `pg_catalog.pg_class`, or a nonexistent table raises the error.

### Prompt 6: Weak PIN hashing and lockout

> **Problem:** `apps/web/src/lib/crypto.ts` hashes PINs with one round of salted SHA-256. A 4 to 6 digit PIN falls to brute force in milliseconds if the local database is copied. The spec requires PBKDF2 or Argon2 and escalating delays after failed attempts.
>
> **Task:** Replace `hashPin`/`verifyPin` with PBKDF2-HMAC-SHA-256 via Web Crypto (at least 310,000 iterations, 16-byte random salt, 32-byte output), storing `{ v: 2, iterations, salt, hash }` in `db.kv`. Compare hashes in constant time. Add a migration path: if a stored value is the old format, verify with the old method once, then re-hash and store in the new format. Implement and persist (in `db.kv`) an attempt counter with escalating delays: after 5 wrong attempts, delays of 30 s, 1 min, 5 min, 15 min, then 1 hour; the counter resets on success. Enforce the delay in `useAppLock` and show the remaining time in `AppLockModal`. Make clear in the Settings text that app lock protects the UI only and does not encrypt local data.
>
> **Acceptance:** Unit tests for hash/verify, constant-time compare helper, old-format migration, lockout schedule (use an injected clock), and persistence across reloads.

### Prompt 7: Floating-point math in money code

> **Problem:** `apps/web/src/lib/money.ts` uses `parseFloat` for amount parsing (lines around 73 and 231) and for FX rates (around 158 and 257). The spec forbids float math on money: parse decimal strings directly into integer minor units and use decimal arithmetic for FX.
>
> **Task:** Rewrite these functions to operate on strings and integers: parse a decimal string by splitting at the locale decimal separator, validating digits, padding or rounding to the currency exponent with half-away-from-zero, and building a `bigint`/safe integer. Implement FX conversion as integer arithmetic: represent the rate as a scaled integer (for example 10^12) from its decimal string, multiply using `bigint`, divide with half-away-from-zero rounding, and adjust for differing currency exponents. Keep the calculator-expression evaluator, but evaluate with scaled integers or a small decimal type, not floats. No behavior change for existing valid inputs.
>
> **Acceptance:** Table-driven and property-based tests (add `fast-check`): parse/format round trip for INR (2), JPY (0), KWD (3); `0.1+0.2` equals exactly `0.30`; very large amounts keep full precision; FX conversion matches a reference decimal implementation across random inputs; half-away-from-zero for negative values; grep confirms no `parseFloat` or `Number(` on monetary strings remains in `lib/money.ts` or `domain/`.

### Prompt 8: Loan rate unit ambiguity

> **Problem:** `apps/web/src/domain/loans.ts` (around lines 127 and 133) guesses units with `annualRate > 100 ? annualRate / 10000 : annualRate / 100`. A rate of exactly 100 basis points (1.00%) would be treated as 100%.
>
> **Task:** Remove the heuristic. The only unit is `annualRateBps` (integer basis points) everywhere in the domain layer, matching the schema. Trace every caller and UI form, and convert percent inputs to bps at the UI boundary only. Rename parameters to `annualRateBps`. Add types so that mixing units is a compile error (for example a branded `Bps` type).
>
> **Acceptance:** Tests: 1.00% (100 bps), 0.50% (50 bps), 12.00% (1200 bps), 0% produce correct EMI and schedules; last installment brings outstanding to exactly zero; flat and reducing types covered; prepayment variants covered.

---

## Priority 3: Hygiene, spec gaps, and tests

### Prompt 9: Repo hygiene and secrets

> **Task:** Add a root `.gitignore` (node_modules, dist, coverage, playwright-report, test-results, `.env`, `.env.*.local`, `.DS_Store`, supabase `.branches` and `.temp`). Remove `apps/web/.env` from version control (keep `.env.example`); confirm it contains only local development values, and if it contains anything else, rotate that key. Remove personal absolute paths (for example `c:\Users\...`) from `implementation_plan.md` and any other docs. Add secret scanning to CI (gitleaks action) and make the CI service_role check also scan `apps/web/dist` for strings starting with `eyJ` that decode to a `service_role` claim.
>
> **Acceptance:** `git status` shows no ignored files tracked; gitleaks passes; docs contain no machine-specific paths.

### Prompt 10: Storage policies, seed data, and RLS tests

> **Problem:** Receipt bucket policies exist only as comments in `sync_rpcs.sql`, so they never run. `supabase/seed.sql` and `supabase/tests/` do not exist even though the implementation plan marks them done.
>
> **Task:**
> 1. New migration creating the private `receipts` bucket (1.5 MB limit, `image/webp` and `image/jpeg`) and real Storage policies: select, insert, update, delete only where `(storage.foldername(name))[1] = auth.uid()::text`.
> 2. An RPC `check_attachment_quota(size_bytes)` enforcing 100 MB per user, used before uploads.
> 3. `supabase/seed.sql` with a demo user, accounts, categories, and a few hundred transactions for local development (clearly marked dev-only).
> 4. pgTAP test that iterates every synced table and proves user A cannot select, insert (with B's `user_id`), update, or delete user B's rows; plus Storage policy tests for the bucket.
>
> **Acceptance:** `supabase db reset && supabase test db` passes; uploading to another user's folder fails; update `implementation_plan.md` to reflect reality.

### Prompt 11: Sync engine tests

> **Problem:** The sync engine has no tests; the spec requires at least 90% coverage on `sync/`, plus convergence tests.
>
> **Task:** Refactor `syncEngine.ts` minimally so the clock, network client, and lock are injectable. Add tests covering: outbox coalescing, dependency-ordered push batches, handling of `rejected` rows (server row overwrites local unless a newer pending local change exists), idempotent apply of overlap rows, backoff with jitter, offline/online transitions, single-tab leadership with Web Locks mocked, `reset_required` flow with export-first, and the recurring materialization hook after sync. Add a property test: two replicas applying the same set of changes in any order converge to identical state.
>
> **Acceptance:** Coverage for `src/features/sync` and `src/db` is at least 90% lines; property test passes with at least 200 runs.

### Prompt 12: Accessibility: clickable divs and autofocus

> **Problem:** ESLint reports `click-events-have-key-events` and `no-static-element-interactions` in `ui/Modal.tsx`, `NotificationCenter.tsx`, `CalendarScreen.tsx` (two places), and `TransactionListScreen.tsx`, plus `autoFocus` in `SettingsScreen.tsx` and another screen.
>
> **Task:** Replace clickable `div`s with real `button` or `a` elements (or use Radix primitives), with visible focus rings and `aria-label`s where text is absent. Modal backdrop click should be handled by Radix Dialog's overlay, with Escape support and focus trapping/return. Replace `autoFocus` with managed focus (focus on open via ref in an effect where truly needed). Make the calendar grid keyboard navigable (arrow keys move between days). Fix remaining `no-explicit-any` warnings by typing them properly. Change the ESLint config so `jsx-a11y` rules are **errors**, not warnings.
>
> **Acceptance:** `pnpm lint` reports 0 warnings from jsx-a11y; add axe checks to Playwright for every route in light and dark themes with zero serious/critical violations.

### Prompt 13: Bundle budget and FX path

> **Task A (bundle):** Measure the actual first-route JavaScript (gzip) with `pnpm analyze` and a script that reads `dist`. Target at most 200 KB gzip for the first route. Candidates: lazy-load the Supabase client until sign-in or first sync, lazy-load i18n locale files other than the active one, make sure `recharts` is only in report routes, and drop `manualChunks` entries that force eager loading. Report before and after numbers.
>
> **Task B (FX):** Read `features/fx/services/fxService.ts`. The CSP currently allows direct browser calls to `open.er-api.com` and `api.frankfurter.app`, but the spec routes FX through the server-side `fx-refresh` function writing to `fx_rates`. Make the client read rates from `fx_rates` via Supabase (cached locally) and remove direct third-party calls and their CSP entries, unless an ADR justifies keeping them. Keep manual per-transaction rate override and offline fallback to the last known rate.
>
> **Acceptance:** A CI step fails if first-route gzip JS exceeds 200 KB; CSP `connect-src` lists only the app origin and the Supabase project; FX unit tests cover cached, missing, and overridden rates.

### Prompt 14: Missing e2e flows

> **Task:** Expand Playwright tests beyond the 4 smoke tests to cover the spec's list: onboarding; add, edit, delete and undo a transaction; transfer between accounts (balances change, totals do not); budget threshold alert on entry; recurring auto-post (including month-end clamping); loan EMI recording; CSV import with preview and undo; JSON export and import round trip; add transaction offline then reconnect and verify it syncs to a second browser context; PIN lock and lockout; PWA update prompt. Run on Chromium, with WebKit and Firefox smoke tests. Use deterministic seeding helpers instead of clicking through onboarding every time.
>
> **Acceptance:** All specs pass locally against `supabase start`; CI e2e job runs them on main with the Supabase local stack (not secrets) so forks can run it.

---

## Priority 4: New feature

### Prompt 15: Money Manager (.mmbak) importer

> **Context:** Add F-081 to `Sanchay_spec.md`: "Import a Money Manager backup (.mmbak / .sqlite)". A `.mmbak` from the Android app is a ZIP-wrapped SQLite database (main table `INOUTCOME`, column names vary by app version). The iPhone export is a bare Core Data SQLite file with `Z*` tables. Backups sent by email or cloud have a `.sqlite` extension.
>
> **Task:** In `features/import`, add a parser that runs **entirely in the browser** (SQLite WASM such as `sql.js` plus a ZIP reader like `fflate`; lazy-load them only on the import screen, and add `'wasm-unsafe-eval'` handling consistent with the existing CSP). Steps: accept `.mmbak`, `.sqlite`, `.db`; detect ZIP vs raw SQLite by magic bytes; inspect `sqlite_master` to choose a layout adapter (Android, iOS); map columns through an alias table so version drift does not break the import; skip rows flagged deleted; map accounts, categories with subcategories, income, expense and transfer rows to Sanchay entities with integer minor units, currency from the backup, and `occurred_on` dates; tag rows `source='import'` with an import batch id for one-click undo. Reuse the existing import preview, duplicate detection, and account/category mapping UI.
>
> **Do not guess the schema.** First write a script `scripts/inspect-mmbak.mjs` that prints tables, columns, and row counts for a sample file, and base the alias table on its output. Do not log amounts, notes, or payees. Treat budgets, recurring items, loans, and photos as out of scope for this task unless found in the sample; list what was skipped in the import summary shown to the user.
>
> **Acceptance:** Unit tests with small fixture databases built in tests (one Android-style, one iOS-style, one with deleted rows, one with transfers and a second currency); import of 5,000 rows completes within 5 seconds; undo removes exactly the imported batch; the file never leaves the device (verify no network requests during import in Playwright).

---

## Final step: truth-in-docs

### Prompt 16: Update the implementation plan

> **Task:** Rewrite the status table in `implementation_plan.md` to reflect the real state after the fixes above. For each of the 14 streams list: done, partially done (with what is missing), or not started, based on checks you actually ran (commands and results), not on intent. Remove claims that are not backed by code or tests. Add a "Known limitations" section (for example: budget alerts run on the device only; app lock does not encrypt local data; iOS push requires the installed PWA).
>
> **Acceptance:** Every "done" item points to the test or command that proves it.

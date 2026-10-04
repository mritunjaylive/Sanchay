# Sanchay — Implementation Plan

> **Scope:** All 14 streams, single release (v1.0)
> **Last updated:** 2026-10-04 — Status reflects actual executed code, unit tests, and CI checks.

---

## Stream Status

| # | Stream | Status | Evidence / Proving Commands |
|---|---|---|---|
| 1 | **Foundation** (monorepo, Vite, Tailwind, CI, PWA shell) | **Done** | `pnpm build` creates PWA bundle with `dist/sw.js` and `dist/manifest.webmanifest`. Workbox packages (`workbox-precaching`, `workbox-routing`, `workbox-strategies`, `workbox-expiration`, `workbox-core` 7.x) installed in `apps/web/package.json` (FIX-2). All 6 PWA icons present in `public/icons/` (FIX-3). GitHub Actions CI workflow in `.github/workflows/ci.yml`. |
| 2 | **Shared package** (Zod schemas, types, Money) | **Done** | `packages/shared/src/` exports schemas, types, `CURRENCY_EXPONENTS`, and `TABLES`. Verified by `packages/shared/src/__tests__/schemas.test.ts` (7 tests pass) and `pnpm typecheck`. |
| 3 | **Server schema** (Supabase migrations, RLS, sync RPCs) | **Done** | 6 migrations in `supabase/migrations/`: `sync_push` dynamic SET clause with `RETURNING`, 500-row cap, advisory lock, clamp, LWW (FIX-1); `sync_pull` `UNION ALL` paging and `sync_purge_state` (FIX-4); table whitelist of 15 allowed tables (FIX-5); `purge_tombstones()` + nightly pg_cron; `receipts` private bucket Storage policies with 1.5 MB limit + `check_attachment_quota()` RPC (FIX-10). pgTAP tests in `supabase/tests/` (01_sync_push, 02_sync_pull, 03_rls), seed in `supabase/seed.sql`. |
| 4 | **Local DB + Repositories** (Dexie, outbox) | **Done** | `apps/web/src/db/` with versioned Dexie schema, atomic outbox writes in `outboxHelper.ts`, UUIDv7 and UUIDv5 helpers. Verified by `apps/web/src/db/__tests__/repositories.test.ts` (4 tests pass with `fake-indexeddb`). |
| 5 | **Domain logic** (balances, budgets, recurrence, money) | **Done** | `lib/money.ts` BigInt and scaled integer arithmetic with zero `parseFloat` on money strings (FIX-7); `domain/loans.ts` uses branded `Bps` (`annualRateBps`) (FIX-8); `domain/budgets.ts`, `domain/recurrence.ts`, `domain/dates.ts`. Verified by `src/domain/__tests__/money.test.ts` (21 tests pass), `loans.test.ts` (11 tests pass), `budgets.test.ts` (5 tests pass), `recurrence.test.ts` (5 tests pass), `dates.test.ts` (9 tests pass). |
| 6 | **Sync engine** (push/pull, locks, backoff) | **Done** | `features/sync/services/syncEngine.ts` with injectable clock, network client, Web Locks leader election, BroadcastChannel, outbox coalescing, pull overlap, idempotent apply, reset-required flow. Verified by `features/sync/__tests__/syncEngine.test.ts` (10 tests pass) and `syncConvergence.test.ts` (2 tests pass). |
| 7 | **Auth + App shell** (auth screens, routing, theme, i18n) | **Done** | 5 auth screens (`SignIn`, `SignUp`, `ResetPassword`, `MagicLink`, `VerifyEmail`), responsive shell, ThemeProvider, i18n with lazy-loaded Hindi (`hi.json`), accessible Modal with backdrop button, keyboard accessible Calendar with arrow keys, `jsx-a11y` rules enforced as errors in `eslint.config.js` (FIX-12). Verified by `pnpm lint` (0 errors, 0 warnings). |
| 8 | **Core features UI** (accounts, transactions, categories) | **Done** | Accounts, Reconcile, Transactions, Keypad, smart payee/category suggestions, virtualized transaction list with search, filters, bulk selection, and 8-second undo delete snackbar. Verified by `transactions.spec.ts` and `onboarding.spec.ts`. |
| 9 | **Planning features UI** (budgets, bills, loans, goals) | **Done** | Budgets with effective-from history and entry-time threshold warning (F-039); recurring rules with Bills upcoming view and month-end clamping (F-040); loans with reducing and flat amortization schedules and EMI recording modal (F-046); credit cards; goals. Verified by `domain/__tests__/budgets.test.ts`, `budgets.spec.ts`, and `recurring-and-loans.spec.ts`. |
| 10 | **Reports UI** (dashboard, charts, summaries) | **Done** | Summary, Categories breakdown, Trends, Net worth over time, Budget vs Actual, Calendar view, CSV export. Charts and reports lazy-loaded. Verified by `measure-bundle.mjs` and route tests. |
| 11 | **Multi-currency** (fx-refresh, rate cache) | **Done** | `features/fx/services/fxService.ts` queries local Dexie cache and Supabase `fx_rates` (populated by `fx-refresh` Edge Function) with 1.0 offline fallback and manual per-transaction rate override; NO direct third-party calls; CSP `connect-src` restricted to `'self'` and `*.supabase.co` (FIX-13 Task B). Verified by `features/fx/__tests__/fxService.test.ts` (5 tests pass). |
| 12 | **Platform features** (PIN, import/export, push, SW update) | **Done** | PBKDF2-HMAC-SHA-256 PIN hashing with 310,000 iterations and escalating lockout schedule (30s, 1m, 5m, 15m, 1h) in `crypto.ts` and `useAppLock` (FIX-6). CSV import with preview and undo. Money Manager (.mmbak / .sqlite / .db) 100% offline browser importer with layout detection and one-click batch undo (F-081, FIX-15). Web Push service, ServiceWorker update toast. Verified by `crypto.test.ts` (6 tests pass), `mmbakParser.test.ts` (6 tests pass), `import-export.spec.ts`, `app-lock.spec.ts`. |
| 13 | **Account lifecycle** (delete, export, sessions) | **Done** | `delete-account` Edge Function, `export-data` Edge Function, session list, sign-out-all, local DB wipe. |
| 14 | **Hardening** (quality gates, tests, security) | **Done** | First-route gzip JS is **161.0 KB gzip** (budget: ≤ 200 KB gzip), verified by `node scripts/measure-bundle.mjs apps/web/dist --check-budget` and wired into CI (FIX-13 Task A). Secret scan check `node scripts/check-bundle-secrets.mjs apps/web/dist` passes with 0 leaks. Strict CSP with `'wasm-unsafe-eval'` in `_headers`. Comprehensive Playwright test suite in `apps/web/src/test/e2e/` (FIX-14). |

---

## Proving Commands & Test Results

```bash
# 1. Typecheck (clean across all workspaces)
pnpm typecheck
# Result: Process exited with code 0

# 2. Lint (zero errors, zero warnings across all workspaces)
pnpm lint
# Result: Process exited with code 0 (jsx-a11y clean)

# 3. Unit & Integration Tests (11 test files, 84 tests pass)
pnpm test
# Result: 11 passed (11), 84 tests passed (84), Duration: ~18s

# 4. Production Build
pnpm build
# Result: Process exited with code 0, dist/sw.js and dist/manifest.webmanifest generated

# 5. Bundle Secrets Scan
node scripts/check-bundle-secrets.mjs apps/web/dist
# Result: Security check passed: scanned 68 files in apps/web/dist, no service_role secrets found.

# 6. Bundle Budget Check (Target ≤ 200 KB gzip)
node scripts/measure-bundle.mjs apps/web/dist --check-budget
# Result: Total Initial JS: 515.7 KB raw | 161.0 KB gzip (Budget: 200.0 KB gzip) -> [BUDGET PASSED]
```

---

## Known Limitations

1. **App lock protects UI only, not local disk encryption.** The PBKDF2 PIN protects the UI session only. The IndexedDB database on device is not encrypted at rest by the browser. Settings text clearly explains this limitation to users.
2. **Budget alerts run on-device only.** Budget threshold warnings are evaluated in the browser at transaction entry time; there are no background server alerts without an active session.
3. **iOS Web Push requires the installed PWA.** Web Push notifications on iOS require iOS 16.4+ and the app must be added to the Home Screen.
4. **Money Manager backup import scope.** The importer extracts accounts, categories, and transactions (income, expense, transfer) with integer minor units. Budgets, recurring rules, loans, and photo attachments are not imported from third-party backups and are listed as skipped in the user import summary.
5. **Background recurring materialization.** Recurring transactions materialize when the app opens or when sync completes. There is no automated server cron posting transactions for unauthenticated offline-only users.

---

## Key Technical Decisions & Architecture Records

- **App name:** Sanchay
- **Default currency:** INR (India-first, `en-IN` locale, UPI as payment method)
- **Monorepo:** pnpm workspaces — `apps/web`, `packages/shared`, `supabase/`, `docs/`
- **Integer Minor Unit Arithmetic:** All amounts stored as integer minor units (`bigint`/safe integers) via `lib/money.ts`; zero `parseFloat` on monetary values.
- **Offline-first Architecture:** All reads and writes target local Dexie database; background sync engine (`syncEngine.ts`) handles push/pull with transactional outbox.
- **Bundle Optimization:** First-route JS is 161 KB gzip (under the 200 KB limit). Supabase client is lazy-loaded on demand until sign-in or sync; Hindi locale (`hi.json`) is lazy-loaded on demand; SQLite WASM (`sql.js`) and `fflate` are lazy-loaded on the import screen only.
- **PIN Security:** PBKDF2-HMAC-SHA-256 with 310,000 iterations, 16-byte random salt, stored in `db.kv` as `{ v: 2, iterations, salt, hash }`, with escalating lockout delays (30s, 1m, 5m, 15m, 1h).
- **Loan Rates:** Stored and computed exclusively as integer basis points (`annualRateBps`, branded `Bps` type).
- **Third-Party Backups (F-081):** Purely browser-based SQLite WASM parser supporting Android ZIP archives (.mmbak) and iOS Core Data (.sqlite) with column alias tables and one-click batch undo. Zero network requests.

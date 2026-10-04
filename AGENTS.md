# AGENTS.md: Instructions for AI Coding Agents

Project: **{{APP_NAME}}**, an offline-first money manager PWA (React + TypeScript + Dexie + Supabase).

**Source of truth:** `docs/SPEC.md` (the file `MONEY_MANAGER_SPEC.md`). This file explains *how to work*; the spec explains *what to build*. If they conflict, the spec wins for product behavior, and this file wins for process.

---

## 1. Read first

Before any task:
1. Read `docs/SPEC.md` sections 0 to 4, plus the sections relevant to your task (data model: 7, money: 8, sync: 9, domain: 10).
2. Find the feature IDs (`F-xxx`) your task covers and read their acceptance criteria (spec section 17).
3. Check `docs/adr/` for decisions that already affect your task.
4. Look at existing code in the area you will touch before writing new code.

If something is unspecified, choose the simplest option consistent with the spec's principles and record it in a new ADR (`docs/adr/NNNN-title.md`). Do not invent features.

---

## 2. Non-negotiable rules

1. **Money is integers.** Use minor units through `lib/money`. Never use floating-point math on amounts, never hardcode `100` as a currency exponent.
2. **UI reads and writes the local DB only.** No screen waits on the network. Network code lives in `src/sync/` and Edge Functions.
3. **Every write goes through a repository** (`src/db/`) that updates the table and the `outbox` in one Dexie transaction. Never write to Dexie tables directly from components.
4. **Every synced row has** `id` (client UUID), `user_id`, `created_at`, `updated_at`, `deleted_at`, `server_seq`, `version`. Deletes are soft (`deleted_at`).
5. **Dates:** `occurred_on` is a local calendar date string (`YYYY-MM-DD`). Never convert it through UTC. Use `periodFor()` for all period math.
6. **`src/domain/` is pure:** no React, Dexie, network, or `Date.now()` without an injected clock. Everything there is unit-tested.
7. **Row Level Security on every table**, no exceptions. The `service_role` key must never appear in client code, the repo, or the bundle.
8. **No `dangerouslySetInnerHTML`, no `eval`/`new Function`.** Amount expressions use the safe evaluator in `lib/money`.
9. **No trackers, ad SDKs, or remote fonts.** Do not add network calls other than Supabase and the FX function.
10. **Original branding only.** Do not copy names, logos, text, screenshots, or visual design from any other app.
11. **Do not change** the data model (spec 7) or sync protocol (spec 9) without an ADR.
12. **Do not add dependencies lightly.** Check bundle impact and license (MIT, Apache-2.0, BSD, ISC only). Justify each new dependency in the PR description.

---

## 3. Commands

```bash
pnpm install                  # install all workspaces
pnpm dev                      # run the web app
pnpm typecheck                # tsc --noEmit across workspaces
pnpm lint                     # eslint (includes jsx-a11y)
pnpm test                     # vitest unit + integration
pnpm test:e2e                 # playwright (needs local Supabase running)
pnpm build                    # production build
pnpm analyze                  # bundle visualizer

supabase start                # local backend (Docker)
supabase db reset             # apply migrations + seed
supabase test db              # pgTAP tests (RLS, constraints, sync functions)
supabase functions serve      # run edge functions locally
```

If a command does not exist yet, add it as part of your task and document it here.

**Before opening a PR, all of these must pass:** `typecheck`, `lint`, `test`, and (when you touched DB, sync, or UI flows) `supabase test db` and `test:e2e`.

---

## 4. Code conventions

**TypeScript**
- `strict`, `noUncheckedIndexedAccess`. No `any` without a comment explaining why. Prefer `unknown` plus Zod parsing at boundaries.
- Types and Zod schemas for table rows live in `packages/shared`. Do not redefine them in the app.
- Use discriminated unions for transaction types and sync results. Exhaustive `switch` with a `never` check.

**React**
- Function components and hooks only. Server/DB data via `useLiveQuery`; Zustand is for ephemeral UI state only.
- Keep components small. Move logic into hooks (`features/*/hooks`) or `domain/`.
- Lazy-load routes, charts, import, and locale files.
- Forms: react-hook-form + Zod; messages come from i18n.

**Files and naming**
- `features/<area>/{components,hooks,screens,services,tests}`; import across features only through that feature's `index.ts`.
- Files `kebab-case.ts(x)`, components `PascalCase`, hooks `useThing`, DB columns `snake_case`, local/TS fields `camelCase` (convert in the sync mapper only).
- Money-related variables end in `Minor` (`amountMinor`).

**Styling and UI**
- Tailwind with CSS-variable tokens; no hardcoded hex colors in components.
- Use the shared UI components (`src/ui/`). If one is missing, add it there rather than one-off markup.
- Touch targets ≥ 44px, visible focus rings, color is never the only signal.
- All user-facing text goes through i18n (`t('key')`). No concatenated sentences; use ICU placeholders and plurals.

**Errors and logging**
- Expected failures return typed results (`{ok:false, error}`); unexpected ones throw and are caught at route/error boundaries.
- Never log amounts, notes, payees, or tokens. Error reports must be scrubbed.

**Comments**
- Explain *why*, not *what*. Link the F-id or ADR for non-obvious decisions.

---

## 5. Testing expectations

| Area | Required |
|---|---|
| `domain/`, `lib/money`, `sync/` | ≥ 90% line coverage; table-driven tests with edge cases |
| Recurrence, sync merge, money parse/format | Property-based tests (determinism, convergence, round-trip) |
| Repositories | `fake-indexeddb` tests incl. outbox entries |
| SQL | pgTAP: RLS isolation per table, constraints, `sync_push`/`sync_pull` behavior |
| UI flows | Playwright, including offline mode (`context.setOffline(true)`) |
| Accessibility | axe on every route, light and dark; zero serious/critical |

Edge cases you must cover where relevant: month-end clamping, leap years, zero-decimal currencies (JPY) and three-decimal currencies (KWD), negative balances, rounding drift in the last EMI, DST/time-zone boundaries, empty states, 50,000-row datasets, two devices editing the same row offline.

Write the test first when fixing a bug.

---

## 6. Definition of done (every task)

- [ ] Behavior matches the spec and the F-id acceptance criteria
- [ ] Works offline (if it is not a network-only feature)
- [ ] Unit/integration/e2e tests added or updated and passing
- [ ] Typecheck and lint clean; no new warnings
- [ ] Accessible: keyboard operable, labeled, axe clean
- [ ] Strings localized (English file updated; Hindi key added, marked `TODO-review` if untranslated)
- [ ] No secrets, no `console.log` leftovers, no dead code
- [ ] Migration included if the schema changed, with a test
- [ ] ADR written if a long-term decision was made
- [ ] PR description filled in (section 8)

---

## 7. Git and PR workflow

- Branch: `feat/F-040-recurring-materialization`, `fix/sync-cursor-overlap`, `chore/ci-cache`.
- Commits: Conventional Commits with the feature ID, e.g. `feat(F-040): materialize due recurring occurrences`.
- Small PRs (aim for under ~400 changed lines excluding generated files), one concern each, tests included.
- Do not rewrite or reformat unrelated code. Do not commit build output, generated service workers, or `.env` files.
- Never force-push shared branches. Never push directly to `main`.

---

## 8. PR description template

```
## What
One or two sentences. Feature IDs: F-xxx

## Why / spec reference
Spec sections and ADRs.

## How tested
Commands run, tests added, manual steps (include offline check if relevant).

## Risks / follow-ups
Data model or sync impact, limitations, TODOs (each with an issue link).

## Screenshots
Light and dark, mobile and desktop width, for UI changes.
```

---

## 9. When to stop and ask the human

Stop and ask (or write an ADR proposing a default and wait) if:
- A change would alter the data model, sync protocol, auth flow, or RLS rules.
- You need a paid service, a new third-party provider, or a new secret.
- Requirements in the spec contradict each other or a platform limit blocks them.
- A test cannot be made to pass without weakening the spec's behavior.
- You are about to delete or migrate user data.

Do not stop for small ambiguities in styling or copy; choose sensibly and note it in the PR.

---

## 10. Task prompts by stream

Use these as starting prompts. Replace `{{...}}` and attach the spec. Each stream's deliverables and DoD are in spec section 18.

### Stream 1: Foundation
> Set up the pnpm monorepo per spec section 6: `apps/web` (Vite, React, TypeScript strict, Tailwind), `packages/shared`, `supabase/`, `docs/`. Add ESLint (typescript-eslint, react-hooks, jsx-a11y), Prettier, Vitest, Playwright, GitHub Actions CI (typecheck, lint, test, build), `.env.example`, ADR template, and a Cloudflare Pages deploy of an installable blank PWA shell using `vite-plugin-pwa` with the `injectManifest` strategy. Done when CI is green and the deployed HTTPS URL installs as a PWA.

### Stream 2: Shared package
> In `packages/shared`, create Zod schemas, inferred TS types, and enums for every table in spec section 7.2, plus currency exponent tables and `Money` types. Include sync-row wrappers (common columns). Export a `TABLES` list with dependency order from spec 9.6. Add tests that validate sample rows and reject invalid shapes (transfer/adjustment/category rules from 7.3).

### Stream 3: Server schema
> Write Supabase migrations for all tables in spec 7.2 with constraints and indexes (7.3), the `sync_seq` sequence and trigger (sets `server_seq`, increments `version`), RLS policies for every table (7.4), Storage bucket policies (11.3), and RPCs `sync_push` and `sync_pull` per spec 9.3 and 9.4 (per-user advisory lock, 5-minute clock clamp, LWW with tie-break, 500-row cap, `reset_required`). Add pgTAP tests, including an auto-generated RLS isolation test over all tables. Done when `supabase db reset && supabase test db` passes.

### Stream 4: Local DB and repositories
> Implement the Dexie schema (spec 7.5) with versioned migrations, camelCase/snake_case mappers, and repositories for each table. Every write must also write an `outbox` entry in the same transaction and coalesce entries per `(table,id)`. Provide UUIDv7 id helper and a deterministic UUIDv5 helper for recurring occurrences. Test with `fake-indexeddb`.

### Stream 5: Domain logic
> Implement `src/domain/` per spec section 10 and `lib/money` per section 8: balances, net worth, budgets with rollover, recurrence `occurrences()`, loan amortization (reducing and flat, prepayment), credit card statement/due logic, goals, report aggregations, `periodFor`, safe amount-expression parser. Pure functions, injected clock, table-driven and property tests, ≥ 90% coverage.

### Stream 6: Sync engine
> Implement the client sync engine per spec section 9: outbox push in dependency order, cursor pull with overlap window, idempotent apply, Web Locks single-tab leadership plus BroadcastChannel, backoff with jitter, attachment uploader with `pendingUploads`, reset-required flow with export-first option, and a sync status store (9.9). Write two-client integration tests against local Supabase proving convergence for create, edit, delete, offline edits, and conflicts.

### Stream 7: Auth and app shell
> Build auth screens (email/password, magic link, Google, reset, verify) and session handling with Supabase Auth. Build the responsive shell from spec 12.1 (bottom tabs on mobile, sidebar on desktop), theme tokens and dark mode, i18n scaffolding (en, hi), and the design-system components listed in 12.4. Axe must pass on all shell routes.

### Stream 8: Core features UI
> Build onboarding, accounts (including kinds, archive, reconcile), categories and tags (merge/delete with reassignment), the transaction editor (keypad, expressions, transfer, attachments), the virtualized transaction list with search, filters, saved filters, bulk actions, undo delete, and payee/category suggestions. Everything must work offline. Cover F-010 to F-014, F-020 to F-034 with Playwright tests.

### Stream 9: Planning features UI
> Build budgets (effective-from history, rollover, thresholds, entry-time alerts), recurring rules and the Bills view (auto_post and remind_only, skip/snooze/mark paid, edit this vs future), loans (schedule, record EMI, prepayment), credit cards (utilization, amount due), and goals. Implement materialization with deterministic ids per spec 10.5. Cover F-035 to F-047.

### Stream 10: Reports UI
> Build the dashboard, period summaries, calendar, category breakdown with drill-down, trends, net worth over time, budget vs actual, print layout, and CSV export. Charts are lazy-loaded and have a "view as table" alternative. Seed 50,000 transactions in a perf test and meet the budgets in spec section 16. Cover F-050 to F-058.

### Stream 11: Multi-currency
> Implement the `fx-refresh` Edge Function (provider behind a wrapper, ADR for the choice, backfill and daily cron), local rate cache, per-transaction rate override, and the base-currency change job with progress UI and budget conversion warning. Cover F-060 to F-062.

### Stream 12: Platform features
> Implement PIN and optional WebAuthn app lock with escalating delays, "hide balances", JSON/CSV import and export with undoable import batches, Web Push (VAPID, subscription management, `push-dispatch` function with dedupe keys, in-app notification center), the service-worker update flow, install prompt, and persistent-storage handling. Cover F-007, F-073 to F-079.

### Stream 13: Account lifecycle
> Implement `delete-account` (Storage objects, rows, auth user; requires recent re-auth), `export-data`, session list and sign-out-all. Verify deletion end-to-end with an automated test. Cover F-005 to F-007.

### Stream 14: Hardening and launch
> Run all quality gates in spec section 16: Lighthouse CI, axe on every route, security headers (CSP, HSTS, Permissions-Policy) via `_headers`, CI check that no `service_role` key is in the bundle, dependency audit, migration tests for every Dexie version, runbook and backup restore drill, legal pages, Hindi translation review, and `docs/launch-checklist.md`. Report any gate that cannot be satisfied.

---

## 11. Review checklist for the human supervisor

- Does any code touch money with floats, or convert `occurred_on` through UTC?
- Does any component write to Dexie or call the network directly?
- Is there an RLS policy and a test for every new table?
- Is every new string in i18n, and every new control keyboard accessible?
- Does the feature still work with the network disabled?
- Did the PR add a dependency, and is it justified?
- Does the change alter the data model or sync behavior without an ADR?

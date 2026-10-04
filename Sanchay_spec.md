# {{Sanchay}}: Money Manager PWA, Final Build Specification (v1.0)

> **Audience:** AI coding agents and the solo developer who supervises them.
> **Status:** Final scope for the v1.0 launch. Build it as **one cohesive product**, not as an MVP with later modules.
> **Rule of thumb:** If this document answers a question, follow it. If it does not, pick the simplest option consistent with the principles in section 1.3 and record the choice in `docs/adr/NNNN-title.md`. Do not invent features that are not listed here.

---

## 0. How agents must use this document

1. Read sections 1 to 4 fully before writing code.
2. Every feature has an ID (`F-xxx`). Reference the ID in commit messages and PR titles, for example `feat(F-040): recurring rule materialization`.
3. Every feature is "done" only when its acceptance criteria (section 17) and the quality gates (section 16) pass.
4. Build order in section 18 is a **dependency order**, not a release plan. Nothing ships until all v1.0 features are complete. Do not add feature flags for half-built features.
5. Never change the data model (section 7) or sync protocol (section 9) without writing an ADR first, because they are the costliest things to change after launch.
6. Use `{{APP_NAME}}` as a placeholder. Branding, icons, colors, and copy must be original. Do not copy any other app's name, logo, screenshots, text, or visual design.

---

## 1. Product definition

### 1.1 What it is
A personal finance manager for tracking income, expenses, transfers, accounts, budgets, loans, goals, and net worth. It runs in any modern browser (PC and mobile) as an installable **Progressive Web App**, works **fully offline**, and **syncs across devices** through a cloud backend.

### 1.2 Who it is for
Individuals who want to record daily money activity quickly and see where their money goes. Primary market: India (default currency INR, UPI as a payment method, Hindi language), but the app must work for any currency and locale.

### 1.3 Principles
1. **Fast entry.** Adding a transaction takes under 10 seconds and 3 taps or fewer on mobile.
2. **Offline-first.** Every feature except sign-in, sync, FX-rate refresh, and push works with no network.
3. **Correct money.** Integer minor units, no floats, deterministic rounding, auditable balances.
4. **Your data is yours.** Full export at any time, full account deletion, no ads, no third-party trackers.
5. **Boring technology.** Prefer well-documented, widely used tools. A solo developer must be able to maintain it.
6. **Accessible and responsive.** Works with keyboard, screen reader, touch, and small screens.

### 1.4 Non-goals for v1.0
No bank-account linking or aggregator integrations, no SMS/notification reading (impossible in a PWA), no shared or family wallets, no OCR or AI features, no investment price feeds, no double-entry bookkeeping UI, no native Android app, no paid plans or ads. See section 3.

---

## 2. v1.0 feature scope (complete list)

### 2.1 Accounts and authentication
| ID | Feature |
|---|---|
| F-001 | Sign up and sign in with email and password; email verification |
| F-002 | Sign in with Google (OAuth) |
| F-003 | Magic-link sign-in (passwordless option) |
| F-004 | Password reset and change; change email |
| F-005 | Session management: list devices, sign out of all devices |
| F-006 | Account deletion (deletes all data and files; irreversible; requires re-authentication) |
| F-007 | Full data export (JSON, plus CSV bundle); import from the app's own JSON export |

### 2.2 Money accounts
| ID | Feature |
|---|---|
| F-010 | Account kinds: `cash`, `bank`, `wallet`, `savings`, `investment`, `other_asset`, `credit_card`, `loan`, `other_liability` |
| F-011 | Per-account currency, opening balance, icon, color, sort order, archive (hide without deleting) |
| F-012 | Include/exclude an account from totals ("exclude from net worth") |
| F-013 | Credit cards: credit limit, statement day, payment due day, utilization %, "amount due" view |
| F-014 | Manual balance adjustment (reconcile) that creates an `adjustment` transaction, excluded from income/expense reports |

### 2.3 Transactions
| ID | Feature |
|---|---|
| F-020 | Types: `income`, `expense`, `transfer`, `adjustment` |
| F-021 | Fields: amount, date, optional time, account, category and subcategory, payee, note, tags, payment method label, attachments |
| F-022 | Transfers between accounts, including cross-currency (both amounts stored) |
| F-023 | Quick-add sheet/dialog with smart defaults (last used account/category, today's date), numeric keypad, calculator expressions in the amount field (`250+40*2`) |
| F-024 | Edit, delete (soft), undo delete (snackbar for 8 seconds), duplicate transaction |
| F-025 | Search by text (note, payee, category, tag) |
| F-026 | Filters: date range, type, account, category, tag, amount range, has-attachment; saved filter presets |
| F-027 | List grouped by day with daily subtotals; virtualized for large datasets |
| F-028 | Bulk actions: select many, change category/account/tags, delete |
| F-029 | Receipt/photo attachments (camera or gallery), compressed on device, up to 5 per transaction |
| F-030 | Payee autocomplete and category suggestion from payee history (local, rule-based) |

### 2.4 Categories and tags
| ID | Feature |
|---|---|
| F-031 | Default category set for income and expense (seeded on first run, localized) |
| F-032 | Custom categories with icon, color, parent (2 levels max), archive, reorder |
| F-033 | Merge categories (re-point transactions) and delete with reassignment |
| F-034 | Tags (free-form, colored), rename and merge |

### 2.5 Budgets
| ID | Feature |
|---|---|
| F-035 | Monthly budget per category (parent budgets include subcategories) and one overall budget |
| F-036 | Budget amount can change over time (effective-from month); history preserved |
| F-037 | Optional rollover of unused amount to next month (per budget) |
| F-038 | Progress bars, remaining per day, status colors; alerts at configurable thresholds (default 80% and 100%) |
| F-039 | Budget alert shown at transaction entry time when the new expense crosses a threshold (non-blocking) |

### 2.6 Recurring items and bills
| ID | Feature |
|---|---|
| F-040 | Recurring rules for income, expense, and transfer: daily, weekly, monthly, yearly, with interval, weekday/month-day options, end date or count |
| F-041 | Rule mode `auto_post` (creates transactions automatically when due) or `remind_only` (appears in "Upcoming" and is marked paid manually) |
| F-042 | "Upcoming bills" view: next 30 days, overdue items, mark paid, skip once, snooze |
| F-043 | Edit rule: "this and future" (rule change) vs "this one only" (override occurrence) |

### 2.7 Loans, debts, and goals
| ID | Feature |
|---|---|
| F-044 | Loan/debt accounts with terms: principal, interest rate, tenure, start date, EMI, payment day, lender/borrower name, direction (borrowed or lent) |
| F-045 | Amortization schedule (EMI math), outstanding principal, interest paid to date, payoff date projection |
| F-046 | "Record EMI" action creates the transfer (principal) and an expense (interest) from the schedule in one step |
| F-047 | Savings goals: name, target amount, target date, optional linked account (progress = balance) or manual contributions; required monthly saving hint |

### 2.8 Reports and views
| ID | Feature |
|---|---|
| F-050 | Home dashboard: net balance, this month's income/expense, budget summary, recent transactions, upcoming bills, goals |
| F-051 | Period summaries: day, week, month, year, custom range; previous/next navigation |
| F-052 | Calendar view with daily income/expense totals; tap a day to see its transactions |
| F-053 | Category breakdown (donut chart + ranked list), drill down into subcategories and transactions |
| F-054 | Trends: income vs expense by month (bar), cumulative balance (line), top payees, top categories |
| F-055 | Net worth over time (month-end points), asset vs liability split, per-account balance history |
| F-056 | Budget vs actual report |
| F-057 | Print-friendly report layout (browser print to PDF) |
| F-058 | CSV export of any filtered transaction list |

### 2.9 Multi-currency
| ID | Feature |
|---|---|
| F-060 | Base (reporting) currency chosen at onboarding; accounts may use other currencies |
| F-061 | Daily FX rates fetched by the backend and cached on device; manual per-transaction rate override; offline fallback to last known rate |
| F-062 | Reports show amounts in base currency; account screens show native currency |

### 2.10 Settings, safety, and platform
| ID | Feature |
|---|---|
| F-070 | Light, dark, and system theme; accent color choice |
| F-071 | Languages: English and Hindi at launch; the i18n system must support adding more without code changes |
| F-072 | Locale-aware number, currency, date formatting; first day of week; custom month start day (1 to 28) |
| F-073 | App lock: PIN (and WebAuthn biometric/passkey where supported), auto-lock timeout, "hide balances" toggle |
| F-074 | Local CSV import with column mapping, preview, duplicate detection, and undo of the last import |
| F-075 | Push notifications (Web Push): bill due reminders, budget threshold alerts, optional daily "log your expenses" nudge; per-type toggles |
| F-076 | In-app notification center (works even if push is unavailable) |
| F-077 | Sync status indicator, manual "Sync now", conflict-free automatic sync, "reset local data and re-download" |
| F-078 | Onboarding: language, base currency, first account with opening balance, optional default categories review |
| F-079 | Installable PWA with offline shell, update prompt ("new version available"), and persistent-storage request |
| F-080 | Help, About, Privacy Policy, Terms pages; in-app feedback link |

---

## 3. Post-launch backlog (do **not** build now)

Shared/family wallets and split expenses; SMS/UPI auto-capture (requires a native Android wrapper); receipt OCR; natural-language entry; AI spending insights; automated bank import (e.g. Account Aggregator, where applicable); investment price feeds; double-entry mode; end-to-end encrypted storage; Google Drive backup; native Android app (Capacitor or TWA wrapper of this PWA); home-screen widgets; more languages; scheduled email summaries; subscription/support tier.

Design decisions in this document must not block these (for example: UUID keys, soft deletes, `user_id` on every row, a `source` field on transactions).

---

## 4. Architecture overview

```
┌────────────────────────── Browser / Installed PWA ──────────────────────────┐
│  React UI  ──▶  Domain services (pure TS)  ──▶  Local DB (IndexedDB/Dexie)  │
│                                                   ▲            │            │
│                      Sync engine (push/pull) ◀────┘            │ blobs      │
│  Service worker: precache, runtime cache, Web Push, background sync          │
└───────────────────────┬──────────────────────────────────────────────────────┘
                        │ HTTPS (Supabase client)
┌───────────────────────▼──────────────────────────────────────────────────────┐
│ Supabase: Auth · Postgres (RLS) · RPC sync functions · Storage (receipts)    │
│ Edge Functions: fx-refresh, push-dispatch, delete-account, export-data       │
│ Scheduled jobs (pg_cron): fx daily, reminders, tombstone purge               │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Key architectural decision:** the **local database is the source of truth for the UI**. The UI reads and writes only the local DB. The sync engine reconciles local DB and server in the background. No screen waits on the network.

---

## 5. Technology stack

Use the latest stable versions at project start; pin exact versions in the lockfile.

| Concern | Choice |
|---|---|
| Language | TypeScript (`strict: true`, `noUncheckedIndexedAccess: true`) |
| Package manager / monorepo | pnpm workspaces |
| Build / dev | Vite |
| UI framework | React 18+ |
| Routing | React Router (data router, lazy routes) |
| Styling | Tailwind CSS + CSS variables for theme tokens |
| Components | Radix UI primitives (via shadcn/ui pattern, copied into the repo), `lucide-react` icons |
| Forms and validation | react-hook-form + Zod (schemas shared with sync layer) |
| Local DB | Dexie.js (IndexedDB) + `dexie-react-hooks` (`useLiveQuery`) |
| UI state | Zustand (ephemeral UI state only, never domain data) |
| Charts | Recharts (lazy-loaded) |
| Lists | TanStack Virtual for virtualization |
| Dates | `date-fns` (+ `date-fns-tz` only where needed) |
| Money | Own `Money` utilities on `bigint`-safe integers (see section 8); `Intl.NumberFormat` for display |
| i18n | i18next + react-i18next, ICU message format, JSON locale files |
| PWA | `vite-plugin-pwa` with **`injectManifest`** strategy (custom service worker for push), Workbox |
| Backend | Supabase (Postgres, Auth, Storage, Edge Functions on Deno, `pg_cron`) |
| Client SDK | `@supabase/supabase-js` |
| Testing | Vitest, Testing Library, `fake-indexeddb`, Playwright, `axe-core` |
| Lint / format | ESLint (typescript-eslint, react-hooks, jsx-a11y), Prettier |
| CI | GitHub Actions |
| Hosting | Cloudflare Pages (static web app), Supabase cloud (backend) |
| Error monitoring | Self-hosted or free-tier privacy-respecting option (for example Sentry with PII scrubbing). No analytics SDKs that track users. |

---

## 6. Repository structure

```
/
├─ apps/
│  └─ web/
│     ├─ src/
│     │  ├─ app/               # router, providers, layout shells
│     │  ├─ features/          # one folder per feature area (accounts, transactions, budgets, ...)
│     │  │   └─ <feature>/{components,hooks,screens,services,tests}
│     │  ├─ db/                # Dexie schema, migrations, repositories
│     │  ├─ sync/              # sync engine, queue, mappers
│     │  ├─ domain/            # pure functions: balances, budgets, recurrence, amortization, reports
│     │  ├─ lib/               # money, dates, ids, formatting, crypto (PIN), storage
│     │  ├─ i18n/              # locales/en.json, locales/hi.json
│     │  ├─ pwa/               # service worker (sw.ts), push helpers, install prompt
│     │  └─ ui/                # design-system components
│     └─ public/               # icons, manifest assets
├─ packages/
│  └─ shared/                  # Zod schemas, TS types, enums, constants used by web and edge functions
├─ supabase/
│  ├─ migrations/              # SQL migrations (source of truth for server schema)
│  ├─ functions/               # edge functions
│  ├─ seed.sql
│  └─ tests/                   # pgTAP / SQL tests for RLS and sync functions
├─ docs/
│  ├─ adr/                     # architecture decision records
│  └─ SPEC.md                  # this file
└─ .github/workflows/
```

Rules: `domain/` has **no** React, Dexie, or network imports and is unit-tested heavily. `features/*` may import from `domain`, `db`, `ui`, `lib`; never from other features' internals (use their public `index.ts`).

---

## 7. Data model

### 7.1 Conventions (apply to every synced table)
| Column | Type | Meaning |
|---|---|---|
| `id` | `uuid` (client-generated, UUIDv7 preferred for time-ordering) | Primary key |
| `user_id` | `uuid` | Owner; equals `auth.uid()`; enforced by RLS |
| `created_at` | `timestamptz` | Creation time (client clock, clamped by server) |
| `updated_at` | `timestamptz` | Last modification time set by the client on every change |
| `deleted_at` | `timestamptz null` | Soft-delete tombstone |
| `server_seq` | `bigint` | Assigned by a server trigger from one sequence on every insert/update; used as sync cursor |
| `version` | `int` | Incremented by the server on each accepted write |

Other rules:
- Money columns are `bigint` **minor units** (paise, cents). Names end in `_minor`.
- Dates without time-of-day (`occurred_on`) are Postgres `date` and `YYYY-MM-DD` strings in the client. Never store a local date as a UTC timestamp.
- Enums are stored as `text` with `CHECK` constraints (easier to evolve than Postgres enums).
- Local Dexie tables mirror server tables using **camelCase**; a single mapper module converts to and from snake_case.
- Add `source text default 'manual'` on transactions (values: `manual`, `recurring`, `import`, `loan_schedule`), reserved for future auto-capture.

### 7.2 Tables

**`profiles`** (1 row per user): `id` (= user id), `display_name`, `base_currency` (ISO 4217), `locale`, `time_zone` (IANA), `week_start` (0 to 6), `month_start_day` (1 to 28), `theme`, `accent`, `default_account_id`, `hide_balances` bool, `notification_prefs` jsonb, `onboarded_at`, plus the sync columns above.

**`accounts`**: `name`, `kind` (see F-010), `currency`, `opening_balance_minor` (signed: liabilities start negative), `opening_date`, `icon`, `color`, `sort_order`, `archived_at`, `exclude_from_net_worth` bool, `credit_limit_minor` null, `statement_day` null (1 to 31), `due_day` null (1 to 31), `note`.

**`loan_terms`** (1:1 with a loan-kind account): `account_id`, `direction` (`borrowed` | `lent`), `counterparty`, `principal_minor`, `annual_rate_bps` (basis points, 1200 = 12.00%), `tenure_months`, `start_date`, `emi_minor`, `payment_day`, `interest_category_id` null, `rate_type` (`reducing` | `flat`).

**`categories`**: `name`, `kind` (`income` | `expense`), `parent_id` null, `icon`, `color`, `sort_order`, `archived_at`, `system_key` null (stable key for seeded defaults so they can be localized and de-duplicated).

**`tags`**: `name`, `color`.

**`transactions`**:
`type` (`income` | `expense` | `transfer` | `adjustment`), `account_id`, `amount_minor` (always **positive**; sign comes from type), `occurred_on` (date), `occurred_time` (time null), `category_id` null (null for transfer/adjustment), `to_account_id` null (transfer only), `to_amount_minor` null (transfer only; equals `amount_minor` when same currency), `payee` text null, `note` text null, `payment_method` text null (`cash`, `card`, `upi`, `bank_transfer`, `other`, or free text), `fx_rate` text null (decimal string, account currency to base), `base_amount_minor` bigint (snapshot in base currency, for reporting), `recurring_rule_id` null, `recurring_occurrence_date` date null, `source`, `adjustment_sign` (`+`|`-`, adjustment only).

**`transaction_tags`**: `id`, `transaction_id`, `tag_id` (own sync columns; unique on pair, soft-deletable).

**`attachments`**: `transaction_id`, `storage_path`, `mime_type`, `size_bytes`, `width`, `height`, `upload_state` (`pending` | `uploaded`) (local only; server rows exist only when uploaded).

**`budgets`**: `category_id` null (null = overall budget), `amount_minor` (base currency), `effective_from` (text `YYYY-MM`), `rollover` bool, `alert_thresholds` int[] (default `{80,100}`). The budget in force for a month is the row with the greatest `effective_from` ≤ that month, per `category_id`. Ending a budget = a row with `amount_minor = 0`.

**`recurring_rules`**:
`type`, `account_id`, `to_account_id` null, `amount_minor`, `category_id` null, `payee`, `note`, `freq` (`daily` | `weekly` | `monthly` | `yearly`), `interval` int ≥ 1, `by_weekday` int[] null (0 to 6), `by_month_day` int null (1 to 31 or -1 for last day), `start_date`, `end_date` null, `max_count` null, `mode` (`auto_post` | `remind_only`), `remind_days_before` int default 1, `paused_at` null, `title`.

**`recurring_overrides`**: `rule_id`, `occurrence_date`, `action` (`skip` | `moved` | `amount_changed`), `new_date` null, `new_amount_minor` null.

**`goals`**: `name`, `target_minor`, `currency`, `target_date` null, `linked_account_id` null, `icon`, `color`, `completed_at` null.

**`goal_contributions`**: `goal_id`, `amount_minor` (signed), `occurred_on`, `note`.

**`saved_filters`**: `name`, `filter` jsonb.

**`notifications`**: `kind`, `title`, `body`, `payload` jsonb, `read_at` null, `dedupe_key` (unique per user, prevents duplicate reminders).

**`push_subscriptions`** (server-only, not synced down): `id`, `user_id`, `endpoint` unique, `p256dh`, `auth`, `user_agent`, `created_at`, `last_success_at`.

**`fx_rates`** (global, read-only to clients): `date`, `quote` (currency), `rate_per_usd` numeric. Cross rates are derived: `rate(A→B) = rate_per_usd[B] / rate_per_usd[A]`. Choose the free provider at implementation time (an ECB-based public API is sufficient) and record it in an ADR; wrap it in the `fx-refresh` function so it can be swapped.

### 7.3 Core DDL excerpt (server)
```sql
create table public.transactions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('income','expense','transfer','adjustment')),
  account_id uuid not null references public.accounts(id),
  amount_minor bigint not null check (amount_minor > 0),
  occurred_on date not null,
  occurred_time time,
  category_id uuid references public.categories(id),
  to_account_id uuid references public.accounts(id),
  to_amount_minor bigint check (to_amount_minor > 0),
  payee text, note text, payment_method text,
  fx_rate text, base_amount_minor bigint not null,
  recurring_rule_id uuid, recurring_occurrence_date date,
  source text not null default 'manual',
  adjustment_sign text check (adjustment_sign in ('+','-')),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_seq bigint not null,
  version int not null default 1,
  constraint transfer_shape check (
    (type = 'transfer') = (to_account_id is not null and to_amount_minor is not null)
  ),
  constraint category_shape check (
    (type in ('income','expense')) or category_id is null
  ),
  constraint adjustment_shape check (
    (type = 'adjustment') = (adjustment_sign is not null)
  ),
  unique (user_id, recurring_rule_id, recurring_occurrence_date)
);
create index on public.transactions (user_id, server_seq);
create index on public.transactions (user_id, occurred_on desc);
create index on public.transactions (user_id, account_id, occurred_on desc);
create index on public.transactions (user_id, category_id, occurred_on desc);
```

### 7.4 Row Level Security (every table)
```sql
alter table public.transactions enable row level security;
create policy "own rows select" on public.transactions for select using (user_id = auth.uid());
create policy "own rows insert" on public.transactions for insert with check (user_id = auth.uid());
create policy "own rows update" on public.transactions for update using (user_id = auth.uid()) with check (user_id = auth.uid());
-- No delete policy: clients soft-delete. Hard deletes happen only via the purge job and delete-account function.
```
Apply the same pattern to every user table. `fx_rates`: `select` for any authenticated user, no writes. `push_subscriptions`: insert/delete own rows via RPC only. A pgTAP test must prove that user A can never read or write user B's rows on any table (auto-generate the test by iterating over the table list).

### 7.5 Local database (Dexie)
- Tables mirror 7.2 (except `push_subscriptions`, `fx_rates` cached as `fxRates`).
- Extra local-only tables: `outbox` (pending changes), `syncState` (cursors, last sync time), `pendingUploads` (attachment blobs), `kv` (settings that must not sync, such as PIN hash and salt).
- Indexes: `[occurredOn]`, `[accountId+occurredOn]`, `[categoryId+occurredOn]`, `[type+occurredOn]`, `*tagIds` (denormalized multi-entry index maintained by repository), `payee`, `updatedAt`.
- Schema changes use Dexie `version(n).stores(...).upgrade(...)`; every migration needs a test.
- Request `navigator.storage.persist()` after onboarding, and show a notice if refused.

---

## 8. Money, currency, and date rules

1. **Representation:** integer minor units in `number` where safe (≤ 2^53), otherwise `bigint`. Wrap in `lib/money.ts`: `Money = { minor: number, currency: string }`. No arithmetic on floats anywhere in domain code.
2. **Currency exponent:** use the ISO 4217 exponent (JPY 0, INR 2, KWD 3) from `Intl` or a static table. Never hardcode 100.
3. **Parsing user input:** parse decimal strings by locale into minor units without going through floating point. Support calculator expressions in the amount field via a safe evaluator (no `eval`); evaluate in integer/decimal arithmetic and round half away from zero to the currency exponent.
4. **Rounding:** half away from zero everywhere, applied once at the final step of each calculation.
5. **FX:** `base_amount_minor = round(amount_minor × rate × 10^(baseExp − accountExp))` using decimal arithmetic. Store the `fx_rate` string used. Same-currency transactions have rate `"1"`.
6. **Changing base currency:** allowed in Settings; triggers a background job that recomputes `base_amount_minor` for all transactions from stored `fx_rate` history or fresh historical rates, with progress UI. Budgets are stored in base currency, so show a clear warning and offer to convert them.
7. **Dates:** `occurred_on` is a local calendar date. "Today" is computed in the user's `time_zone`. Month boundaries honor `month_start_day`: a "month" labeled `YYYY-MM` runs from that day of the month to the day before the next. Implement in one function (`periodFor(date, monthStartDay)`) used everywhere.
8. **Display:** negative balances use a minus sign and a distinct color but never rely on color alone (also icon or text such as "Owed").

---

## 9. Sync protocol

### 9.1 Principles
- Single-user data per row, so conflicts are rare. Use **per-record last-write-wins (LWW)** on `updated_at`, with deterministic tie-break (higher `version`, then lexicographically larger device id).
- Deletions are tombstones (`deleted_at`). A tombstone is just a newer version of the row.
- Every change is idempotent. Applying the same change twice has no further effect.

### 9.2 Client write path
1. A repository function writes the change to the local table **and** an `outbox` entry in a single Dexie transaction (`{table, id, op, snapshot, updatedAt, attempt}`). Coalesce multiple outbox entries for the same `(table, id)` into the latest snapshot.
2. UI updates immediately through `useLiveQuery`.
3. The sync engine triggers on: app start, `online` event, visibility change to visible, after each local write (debounced 2 seconds), every 60 seconds while visible, and manual "Sync now". Use the Web Locks API (`navigator.locks`) so only one tab syncs at a time; other tabs observe through `BroadcastChannel`.

### 9.3 Server RPCs (SQL functions, `security invoker` so RLS applies)
```
sync_push(changes jsonb) returns jsonb
  -- changes: [{table, row}]. For each row, upsert if the incoming updated_at is newer
  -- than the stored one (see 9.1 tie-break). Otherwise ignore and return the stored row as "rejected".
  -- Clamp updated_at/created_at to at most now() + interval '5 minutes' to blunt clock skew.
  -- Returns {accepted: [{table,id,version,server_seq}], rejected: [{table,row}]}.
  -- Max 500 rows per call; client batches in dependency order (parents before children).

sync_pull(cursor bigint, tables text[], page_size int default 500) returns jsonb
  -- Returns rows with server_seq > cursor - overlap (see 9.4), ordered by server_seq, plus next_cursor and has_more.
  -- If cursor is older than the tombstone purge horizon, return {reset_required: true}.
```
A `BEFORE INSERT OR UPDATE` trigger on each table sets `server_seq = nextval('sync_seq')` and increments `version`.

### 9.4 Pull ordering safety
Sequence values can commit out of order under concurrency. To avoid missed rows, the client always pulls from `cursor − 1000` (an overlap window) and the apply step is idempotent (ignore rows whose `(id, version)` is already applied). Alternatively, serialize `sync_push` per user with `pg_advisory_xact_lock(hashtext(user_id::text))`; do both.

### 9.5 Client apply path
Apply pulled rows inside one Dexie transaction. Rule: if local row has a pending outbox entry with a newer `updatedAt`, keep local (it will win on push); otherwise overwrite local. After apply, store `next_cursor` in `syncState`.

### 9.6 Referential integrity
Foreign keys are enforced on the server but the client may push a child before its parent arrives. `sync_push` processes in dependency order inside one transaction; the client orders batches: `profiles → accounts → loan_terms → categories → tags → recurring_rules → recurring_overrides → goals → transactions → transaction_tags → attachments → budgets → goal_contributions → saved_filters → notifications`. A foreign key to a soft-deleted parent is allowed (tombstones remain until purge).

### 9.7 Attachments
Blobs are never in the sync RPC. Flow: compress on device → store in `pendingUploads` → upload to Storage path `receipts/{user_id}/{attachment_id}.webp` when online → create/update the `attachments` row with `upload_state='uploaded'`. Downloads happen lazily when a receipt is opened, then cached in the Cache Storage API. Quota: 100 MB per user (enforced by an RPC check before upload; show usage in Settings).

### 9.8 Purge and reset
A nightly job hard-deletes rows with `deleted_at` older than 90 days. A client offline longer than that receives `reset_required` and performs a guarded full re-download (after offering to export unsynced local changes as a JSON file first). "Reset local data" in Settings does the same on demand.

### 9.9 Sync status states
`synced`, `syncing`, `pending (N changes)`, `offline`, `error (retrying)`, `auth required`. Show in the header; tapping it opens a details sheet with last sync time and last error.

---

## 10. Domain logic specifications

All in `src/domain/`, pure and unit-tested.

### 10.1 Account balance
`balance(account) = opening_balance_minor + Σ income + Σ incoming transfers (to_amount_minor) + Σ adjustments(+) − Σ expense − Σ outgoing transfers (amount_minor) − Σ adjustments(−)`, over non-deleted transactions with `occurred_on ≥ opening_date`. Liability accounts have negative balances meaning "owed". Provide `balanceOn(account, date)` for history charts.

### 10.2 Net worth
Sum of converted balances of all non-archived, not-excluded accounts using the latest FX rates (current) or month-end rates (history). Show assets and liabilities separately.

### 10.3 Transfers
One row with `account_id` (from), `to_account_id`, `amount_minor` (leaves from) and `to_amount_minor` (arrives to). Same currency means equal amounts. Transfers never count as income or expense in reports. For cross-currency transfers, `base_amount_minor` equals the from-side base value.

### 10.4 Budgets
- Spent in a period = Σ `base_amount_minor` of non-deleted `expense` transactions in the category (and its children) within `periodFor`.
- Rollover: carried amount = max(0, previous month's budget + previous carry − previous spent), chained from the first month with the budget, capped at 12 months of look-back for performance.
- Status: `ok` < first threshold, `warning` ≥ first threshold, `over` ≥ 100%.
- Daily allowance = remaining ÷ days left in period (shown only for the current period).
- Threshold alerts fire once per `(budget, period, threshold)` through `notifications.dedupe_key`.

### 10.5 Recurrence
- `occurrences(rule, from, to)` is a pure function. Monthly rules with `by_month_day` greater than the month length clamp to the last day. Weekly rules with no `by_weekday` use the weekday of `start_date`.
- **Materialization (auto_post):** on app start, on sync completion, and once per day while open, create transactions for every occurrence with date ≤ today that has no transaction yet. The transaction `id` is a **UUIDv5 of `rule_id + occurrence_date`**, and the table has `unique(user_id, recurring_rule_id, recurring_occurrence_date)`. Two devices generating the same occurrence therefore produce the same row, which collapses on sync.
- Look-back limit when materializing after long inactivity: 400 days, beyond which the user is shown a confirmation listing what will be created.
- **remind_only:** occurrences appear in Upcoming until marked paid (creates a transaction with the same deterministic id) or skipped (creates a `recurring_overrides` row).
- Editing "this and future": end the old rule the day before and create a new rule; editing "this one": write an override.

### 10.6 Loans
- Reducing-balance EMI: `EMI = P·r·(1+r)^n / ((1+r)^n − 1)` with monthly `r = annual_rate / 12`, computed in decimal arithmetic, rounded to minor units; the final installment absorbs rounding drift. `r = 0` means `EMI = P / n`.
- Flat-rate: interest = `P × rate × years`, total ÷ n.
- Schedule rows: installment number, due date (honoring `payment_day`, month-length clamping), principal part, interest part, outstanding after.
- **Record EMI:** creates (a) a `transfer` from the chosen paying account to the loan account for the principal part, and (b) an `expense` on the paying account for the interest part in the interest category, both linked by the same `occurred_on` and a shared note token. For `lent` loans the flow is reversed (income for interest, transfer in for principal).
- Allow a user-entered EMI that differs from the computed value, and prepayments (an extra transfer recalculates the remaining schedule with the same EMI, shortening tenure, or the same tenure, reducing EMI: user picks).

### 10.7 Credit cards
- Statement period from `statement_day`; "amount due" = balance owed at the last statement date minus payments since; due date from `due_day`; utilization = owed ÷ `credit_limit_minor`.
- A card payment is a transfer from a bank account to the card.

### 10.8 Goals
Progress = linked account balance (if set) else Σ contributions. Required monthly saving = remaining ÷ months until `target_date` (rounded up), shown only if a target date exists.

### 10.9 Reports
All report functions take `(transactions, filters, period)` and return plain data for charts. Aggregations for 50,000 transactions must finish in under 100 ms using indexed range queries and a single pass. Exclude `transfer` and `adjustment` from income/expense totals. Use `base_amount_minor` for all report sums.

### 10.10 Payee and category suggestion
Local only: rank categories by frequency for the typed payee prefix (case-insensitive, normalized). No network calls.

---

## 11. Backend specification

### 11.1 Auth
Supabase Auth with email/password, magic link, and Google. Require email confirmation. Password minimum 10 characters, check against a breached-password list if the provider supports it. Redirect URLs configured per environment. Store the session in the Supabase client default storage; on sign-out, wipe local DB (confirm first if there are unsynced changes).

### 11.2 Edge Functions
| Function | Trigger | Behavior |
|---|---|---|
| `fx-refresh` | `pg_cron` daily | Fetch rates from the configured provider, upsert `fx_rates`, keep 10 years of history; backfill on first run |
| `push-dispatch` | `pg_cron` every 15 min | For each user, evaluate due reminders (recurring rules in `remind_only` mode with `remind_days_before`, credit-card due dates, loan EMI dates) in the user's time zone and preferred hour; insert `notifications` with `dedupe_key`; send Web Push to subscriptions; delete subscriptions that return 404/410 |
| `delete-account` | HTTP, authenticated, requires recent re-auth | Delete Storage objects, then rows (cascade), then the auth user; log nothing personal |
| `export-data` | HTTP, authenticated | Stream a ZIP with `data.json` and CSVs (server-side fallback; normal export runs on device) |
| `purge-tombstones` | `pg_cron` nightly | Hard-delete tombstones older than 90 days |

Budget-threshold push alerts are generated **client-side** at write time (the device has the data), then delivered locally as in-app notifications and, if the app is closed, are not sent. Document this limitation in the UI settings text. (Server-side budget push is a post-launch item since the server cannot see all derived state cheaply.)

### 11.3 Storage
Private bucket `receipts`; policies allow read/write/delete only where the first path segment equals `auth.uid()`. Max object size 1.5 MB, MIME types `image/webp`, `image/jpeg`.

### 11.4 Rate limiting and abuse
Use Supabase's built-in auth rate limits; cap `sync_push` payload size and rows per call; return 413/429 with a retry hint that the client honors with exponential backoff and jitter.

---

## 12. Frontend specification

### 12.1 Navigation and layout
- **Mobile (< 768 px):** bottom tab bar with `Home`, `Transactions`, `[+] Add` (center action), `Reports`, `More`. Header shows sync status and a month/period switcher where relevant.
- **Tablet/Desktop (≥ 768 px):** left sidebar (collapsible) with the same destinations plus `Accounts`, `Budgets`, `Bills`, `Goals`, `Settings`. Quick-add opens as a right-side panel or centered dialog; main content max width 1200 px.
- Routes (lazy): `/` Home, `/transactions`, `/transactions/:id`, `/accounts`, `/accounts/:id`, `/budgets`, `/bills`, `/loans`, `/goals`, `/reports/{summary,categories,trends,net-worth,budget}`, `/calendar`, `/import`, `/settings/*`, `/onboarding`, `/auth/*`, `/help`.

### 12.2 Screen requirements (summary)
| Screen | Must contain |
|---|---|
| Onboarding | Language → base currency → first account + opening balance → default categories → done. Skippable steps have sensible defaults. |
| Home | Net balance card (hide-able), month income/expense, top budgets, upcoming bills (next 5), goals, last 5 transactions, quick-add FAB |
| Transactions | Search bar, filter chips, saved filters, grouped list with daily totals, multi-select mode, empty state |
| Transaction editor | Amount (keypad + expressions), type switch, date/time, account(s), category picker (recent first, search), payee, note, tags, attachments, repeat toggle, save and "save & add another" |
| Accounts | Grouped by asset/liability, per-kind totals, archive toggle; detail page with balance history chart, transactions, edit, reconcile |
| Budgets | Month switcher, overall + category budgets, progress, rollover indicator, create/edit sheet, history of changes |
| Bills | Upcoming and overdue, mark paid / skip / snooze, manage rules |
| Loans | List with outstanding and next EMI; detail with schedule table, record EMI, prepayment, payoff projection |
| Goals | Cards with progress rings, add contribution, edit |
| Reports | Tabs per F-051 to F-057 with period switcher, filters, export and print |
| Calendar | Month grid with daily totals; day detail sheet |
| Import | Upload → map columns → preview with duplicate flags → import → undo |
| Settings | Profile, currency and locale, appearance, security (PIN/biometric), notifications, data (export/import/reset/delete), sync status, storage usage, about |
| Auth | Sign in, sign up, reset, magic link, verify email, session expired |

### 12.3 UX rules
- Every list has loading skeleton (rarely needed with local data), empty state with a clear primary action, and error state.
- Destructive actions use undo snackbar where possible, confirmation dialog where not (account deletion, reset local data, base currency change).
- Optimistic everything; the UI never blocks on sync.
- Numbers are right-aligned in tables, use tabular figures, and are always formatted by one `formatMoney` function.
- Forms validate on blur and on submit with Zod; messages are localized.
- Respect `prefers-reduced-motion` and `prefers-color-scheme`.
- Desktop keyboard shortcuts: `N` new transaction, `/` focus search, `G` then `H/T/R/B` go to Home/Transactions/Reports/Budgets, `Esc` closes sheets. List shortcuts in a help dialog (`?`).

### 12.4 Design system
- Tokens as CSS variables: color (surface, text, muted, primary, success, warning, danger, income, expense), spacing scale, radii, elevation, typography scale. Light and dark sets, plus 6 accent options.
- Contrast: WCAG AA minimum for text and UI components in both themes.
- Typography: system UI font stack with a Devanagari-capable fallback; no remote web fonts (privacy and offline). Self-host if a custom font is wanted.
- Components to build once and reuse: Button, IconButton, Input, MoneyInput, DatePicker, Select/Combobox, Sheet/Dialog, Tabs, Chip, Badge, ProgressBar, ProgressRing, Snackbar, Skeleton, EmptyState, ListItem, Money (formatted display), Amount (colored by type), CategoryIcon, AccountBadge, Chart wrappers.

### 12.5 Accessibility
- Semantic HTML, labelled controls, focus management in dialogs/sheets, visible focus rings, logical tab order.
- Charts always have a data-table alternative (toggle "View as table") and text summaries.
- Touch targets ≥ 44×44 px. Test with TalkBack and a keyboard-only pass.
- `axe-core` runs in Playwright on every route in both themes; zero serious/critical violations.

### 12.6 Internationalization
- All user-facing strings come from locale files; no string concatenation for sentences (use ICU placeholders and plurals).
- Default categories have `system_key` and are shown through translations until the user renames them (renaming stores the custom name).
- Support RTL layout in CSS (logical properties) even though no RTL language ships at launch.
- Hindi translation is written by a fluent reviewer or reviewed by one before release; agents must not ship machine-translated finance terms unreviewed.

---

## 13. PWA specification

- **Manifest:** name, short name, `display: standalone`, `start_url: /?source=pwa`, `scope: /`, theme/background colors for light/dark, icons (192, 512, maskable 512), `shortcuts` (Add expense, Add income, Reports), `categories: ["finance"]`, `lang`, `id`.
- **Service worker (`injectManifest`):**
  - Precache the app shell and built assets (hashed).
  - Navigation fallback to `index.html` (SPA).
  - Runtime cache: `StaleWhileRevalidate` for same-origin static assets; `CacheFirst` for receipt images fetched from signed URLs (bounded entries, expiry 30 days); never cache API/RPC responses.
  - Push handler shows notifications and focuses/opens the right route on click.
  - Update flow: new SW waits; app shows "Update available" toast; user taps to `skipWaiting` and reload. Never force-reload mid-edit.
- **Install UX:** capture `beforeinstallprompt`, show a dismissible in-app install card after the third session; show iOS "Add to Home Screen" instructions where applicable.
- **Offline:** the full app works with no network after first load. An offline banner appears only where something actually needs network (sync, FX refresh, sign-in).
- **Storage safety:** call `navigator.storage.persist()`, monitor `navigator.storage.estimate()`, warn at 80% quota, and keep a prominent "Back up now" action. Prompt a JSON backup reminder every 30 days if the user has never signed in to sync.
- **Web Push:** VAPID keys held in Edge Function secrets; subscription created only after an explicit user action in Settings; iOS support requires the installed PWA (iOS 16.4+), so explain this in the UI.

---

## 14. Security and privacy

1. **Transport:** HTTPS only, HSTS, strict CSP (no inline scripts, `connect-src` limited to the app origin and the Supabase project), `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` limiting camera to self, `X-Content-Type-Options: nosniff`. Set via Cloudflare Pages `_headers`.
2. **Authorization:** RLS on every table, tested automatically (section 7.4). The Supabase `service_role` key exists only in Edge Function secrets, never in the client or repo.
3. **Secrets:** `.env.example` documents variables; real values live in CI/host secret stores. Add secret scanning to CI.
4. **App lock:** PIN stored as PBKDF2 or Argon2 hash with per-device random salt in `kv` (local only). Lock covers the UI only; it is **not** encryption of IndexedDB, and the Settings text must say so plainly. Rate-limit PIN attempts with escalating delays. WebAuthn (platform authenticator) as optional unlock.
5. **Input safety:** render all user text through React (no `dangerouslySetInnerHTML`); validate and bound lengths (note ≤ 2000 chars, payee ≤ 120, name fields ≤ 80); sanitize CSV import fields against formula injection (prefix `'` when exporting cells starting with `= + - @`).
6. **Privacy:** no analytics or ad SDKs; error reports scrubbed of amounts, notes, payees; privacy policy states exactly what is stored, where, and for how long; account deletion removes everything including backups within a stated window.
7. **Dependencies:** lockfile committed; Dependabot or Renovate; `pnpm audit` in CI fails on high/critical advisories.
8. **Backups:** enable Supabase point-in-time recovery or daily backups on the production project; document the restore drill in `docs/runbook.md`.
9. **Compliance basics:** Provide privacy policy and terms pages; support data export and deletion (covers common data-protection requirements). Have these pages reviewed before launch; the agent must not claim legal compliance.

---

## 15. Import and export formats

### 15.1 Native JSON export
```json
{
  "format": "{{app_slug}}-export",
  "version": 1,
  "exportedAt": "2026-01-01T00:00:00Z",
  "profile": {}, "accounts": [], "loanTerms": [], "categories": [], "tags": [],
  "transactions": [], "transactionTags": [], "budgets": [], "recurringRules": [],
  "recurringOverrides": [], "goals": [], "goalContributions": [], "savedFilters": []
}
```
Rows use the same field names as the local DB (camelCase). Attachments are exported as files in a ZIP next to the JSON, referenced by id. Import validates with Zod, remaps ids only on collision, and runs in one Dexie transaction; offer "merge" or "replace all".

### 15.2 CSV export (per filtered list)
Columns: `date,time,type,account,to_account,category,subcategory,amount,currency,to_amount,to_currency,payee,note,tags,payment_method`. UTF-8 with BOM for spreadsheet compatibility; amounts as decimal strings; escape quotes and neutralize formula-leading characters.

### 15.3 CSV import
Steps: choose file → detect delimiter/encoding → map columns (remember mapping per header signature) → choose date format and decimal separator → assign or create accounts/categories → preview with row-level errors and duplicate flags (same date, amount, account, payee within the file or existing data) → import. Tag imported rows `source='import'` with an `importBatchId` in `note`-independent local metadata so the **whole batch can be undone**.

### 15.4 Money Manager backup import (F-081)
Import a Money Manager backup (`.mmbak` / `.sqlite` / `.db`) entirely in the browser using SQLite WASM (`sql.js`) and `fflate`. Detects ZIP vs raw SQLite by magic bytes; inspects `sqlite_master` to choose the Android (`INOUTCOME`) or iOS Core Data (`Z*`) layout adapter; maps columns through an alias table to handle version drift; ignores deleted rows; maps accounts, categories with subcategories, income, expense, and transfers to Sanchay entities with integer minor units and `occurred_on` dates; tags rows `source='import'` with an `importBatchId` for one-click undo. The file never leaves the device.

---

## 16. Quality gates

| Gate | Requirement |
|---|---|
| Type safety | `tsc --noEmit` clean, no `any` without a justified comment |
| Lint | ESLint zero errors, including `jsx-a11y` |
| Unit tests | `domain/`, `lib/money`, `sync/` ≥ 90% line coverage; every function in section 10 has table-driven tests incl. edge cases (leap years, month-end clamping, zero-decimal currencies, negative balances, DST/time zone boundaries, rounding drift) |
| Property tests | Recurrence generation determinism; sync merge convergence (two replicas applying the same change set in any order end identical); money round-trip parse/format |
| DB tests | pgTAP: RLS isolation on every table, constraints (shapes in 7.3), `sync_push` LWW and clamp behavior, purge horizon |
| Integration | Local Supabase (`supabase start`) + two simulated clients: create, edit, delete, offline edits, conflict, reset-required flows converge |
| E2E (Playwright) | Onboarding; add/edit/delete/undo transaction; transfer; budget alert; recurring auto-post; loan EMI record; CSV import/undo; export/import round trip; offline add then reconnect and sync; PIN lock; install/update prompt; runs on Chromium, plus WebKit and Firefox smoke |
| Accessibility | axe: zero serious/critical on all routes, light and dark; manual keyboard pass checklist in `docs/qa/a11y.md` |
| Lighthouse CI | PWA installable, Performance ≥ 90 and Accessibility ≥ 95 on mobile emulation for `/`, `/transactions`, `/reports/summary` |
| Security | CSP verified; no `service_role` key in bundle (CI grep); dependency audit clean |
| Data safety | Migration tests: Dexie upgrade from every prior schema version retains data |

### Performance budgets
- Initial JS ≤ 200 KB gzip on the first route (charts, import, and i18n locale files lazy-loaded).
- Cold start to interactive on a mid-range Android phone over 4G: ≤ 3 s; warm start (service worker): ≤ 1.2 s.
- Transaction list scrolls at 60 fps with 50,000 rows (virtualized).
- Add-transaction save to UI update: ≤ 100 ms.
- Initial full sync of 50,000 transactions: ≤ 60 s on a typical connection, with progress UI and no main-thread blocking longer than 50 ms (batch applies, use a Web Worker for pull parsing if needed).

---

## 17. Acceptance criteria (selected, must be turned into tests)

- **F-020/F-022:** Creating a transfer of 1,000.00 from a bank to a wallet reduces the bank balance and increases the wallet balance by the same amount; income/expense totals are unchanged. A cross-currency transfer stores both amounts and each account balance reflects its own currency.
- **F-024:** Deleting a transaction shows an undo snackbar; undo within 8 seconds restores it and the balance; after sync the tombstone is on the server and the row disappears on other devices.
- **F-035/F-036:** Setting a food budget of 10,000 from 2026-03, then 12,000 from 2026-06, shows 10,000 for April and 12,000 for June; editing June does not alter April.
- **F-039:** Adding an expense that moves a category from 78% to 82% shows a non-blocking alert; it does not fire again for the same threshold in that month.
- **F-040:** A monthly rule on the 31st posts on Feb 28 (or 29), Apr 30, and so on. Two devices opening the app offline then syncing produce exactly one transaction per occurrence.
- **F-046:** For a 12-month loan, recording all EMIs brings outstanding to exactly 0 with the final installment absorbing rounding drift.
- **F-055:** Net worth at each month-end equals the sum of account balances at that date, converted with that month-end's rates.
- **F-061:** With no network and no cached rate for a currency, the editor asks for a manual rate and stores it; later sync does not overwrite it.
- **F-073:** After 5 wrong PIN attempts, the next attempt is delayed; the PIN never leaves the device.
- **F-077:** Editing the same transaction on two offline devices and reconnecting yields the same final row on both, equal to the edit with the later `updated_at`.
- **F-079:** After the first load, turning on airplane mode and reloading still opens the app with all data.
- **F-081:** Money Manager backup import (.mmbak/.sqlite) parses Android and iOS backups completely offline, maps accounts/categories/transfers, ignores deleted rows, imports 5,000 rows in under 5 seconds, and provides one-click batch undo.

---

## 18. Build order for agents (dependency order, single release)

Work in these streams. Streams can run in parallel only where dependencies allow. A stream is complete when its Definition of Done (DoD) holds.

| # | Stream | Depends on | Deliverables | DoD |
|---|---|---|---|---|
| 1 | **Foundation** | none | Monorepo, Vite/React/TS, Tailwind, lint/format/test tooling, CI, `.env.example`, ADR template, Cloudflare Pages deploy of a blank PWA shell | CI green; deployed HTTPS URL installs as a PWA |
| 2 | **Shared package** | 1 | Zod schemas and TS types for every table, enums, constants, `Money`/currency tables | Types consumed by web and functions; schema tests pass |
| 3 | **Server schema** | 2 | Migrations for all tables, indexes, constraints, triggers (`server_seq`, `version`), RLS, storage policies, `sync_push`/`sync_pull`, seed; pgTAP tests | `supabase db reset` works; all DB tests green |
| 4 | **Local DB + repositories** | 2 | Dexie schema + migrations, repositories with outbox writes, id/time helpers, mappers | Repository tests with `fake-indexeddb` green |
| 5 | **Domain logic** | 2 | Everything in section 10, plus money parsing/formatting, `periodFor`, recurrence, amortization, reports | ≥ 90% coverage; property tests green |
| 6 | **Sync engine** | 3, 4 | Push/pull loop, locks, backoff, attachment uploader, reset flow, status store | Two-client integration tests converge; offline/online e2e passes |
| 7 | **Auth + app shell** | 1, 3 | Auth screens, session handling, layout shells, routing, theme, i18n scaffolding, design-system components | Can sign up, sign in, sign out; shell responsive; a11y checks pass |
| 8 | **Core features UI** | 4, 5, 7 | Onboarding, accounts, categories/tags, transaction editor/list/search/filters/bulk, attachments | Corresponding F-ids pass acceptance tests offline |
| 9 | **Planning features UI** | 5, 8 | Budgets, recurring/bills, loans, credit cards, goals | Acceptance tests for F-035 to F-047 pass |
| 10 | **Reports UI** | 5, 8 | Dashboard, summaries, calendar, charts, net worth, print, CSV export | F-050 to F-058 pass; performance budget met with 50k seeded rows |
| 11 | **Multi-currency** | 3, 5, 8 | `fx-refresh` function, rate cache, rate overrides, base currency change job | F-060 to F-062 pass |
| 12 | **Platform features** | 6, 8 | PIN/biometric lock, import/export, push (VAPID, subscriptions, `push-dispatch`), notification center, SW update flow, install UX | F-007, F-073 to F-079 pass |
| 13 | **Account lifecycle** | 3, 7 | Delete-account and export-data functions, session list/sign-out-all | F-005 to F-007 pass; deletion verified end-to-end |
| 14 | **Hardening** | all | Full quality gates (section 16), Lighthouse CI, security headers, runbook, backup drill, Hindi review, legal pages | All gates green; `docs/launch-checklist.md` complete |

### Rules of engagement for agents
1. Keep PRs small and tied to one F-id or stream task; include tests in the same PR.
2. Never commit secrets, generated service workers, or build output.
3. Do not add dependencies without checking bundle size impact (`vite-bundle-visualizer`) and licenses (permissive only: MIT, Apache-2.0, BSD, ISC).
4. Prefer deleting code to adding abstractions. No premature generic frameworks.
5. When a requirement here conflicts with a platform limit (for example iOS push), implement the best supported behavior and document the limit in the UI and `docs/limitations.md`.
6. If a decision has long-term impact (data model, sync, security), write an ADR before coding.

---

## 19. Environments and release

| Environment | Web | Backend |
|---|---|---|
| Local | `pnpm dev` | `supabase start` (Docker) |
| Preview | Cloudflare Pages preview per PR | Shared staging Supabase project |
| Production | Cloudflare Pages main branch | Production Supabase project |

- Database migrations are applied by CI to staging automatically and to production through a manual approval step. Migrations must be backward compatible with the previously deployed web build (expand, then contract in a later release).
- Web builds embed `APP_VERSION` and the minimum supported schema version; the app shows "update required" if the server reports a newer incompatible schema.
- Launch checklist (`docs/launch-checklist.md`): privacy policy and terms published, support email, PITR/backup verified, auth emails branded and tested, rate limits set, error monitoring wired with scrubbing, Lighthouse and a11y gates green, manual test on at least two Android devices (Chrome), one iOS device, Windows/macOS Chrome, Firefox, Safari.

---

## 20. Assumptions and defaults (change only via ADR)

1. App name is a placeholder: `{{APP_NAME}}`.
2. Default base currency is inferred from locale; India defaults to INR with the Indian digit grouping (1,00,000) when the locale is `en-IN` or `hi-IN`.
3. Default categories (seeded, localized): *Expense:* Food & Dining, Groceries, Transport, Fuel, Shopping, Bills & Utilities, Rent/Housing, Health, Education, Entertainment, Travel, Personal Care, Gifts & Donations, Insurance, EMI/Loans, Interest & Fees, Taxes, Other. *Income:* Salary, Business, Freelance, Interest, Investments, Gifts, Refunds, Other.
4. Quick-add default account is the last used account; default date is today in the user's time zone.
5. Maximum sizes: 100,000 transactions per user, 200 accounts, 500 categories, 200 tags, 5 attachments per transaction.
6. Free forever for v1.0; hosting stays within free tiers, with the receipt storage quota (100 MB per user) and attachment compression as the cost controls. Re-evaluate limits against the provider's current free-tier terms before launch.
7. Web Push, FX provider, and the error-monitoring tool are chosen at implementation time and documented in ADRs; their wrappers must make them replaceable.

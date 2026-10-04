# Sanchay (संचय)

> **Offline-first, privacy-focused personal finance manager PWA**  
> Built with React 18, TypeScript (strict), Dexie.js (IndexedDB), Tailwind CSS, and Supabase.

---

## Overview

**Sanchay** (from Sanskrit *संचय* - meaning accumulation or saving) is a modern, privacy-first Progressive Web Application (PWA) designed for managing personal finances seamlessly across mobile and desktop. 

Unlike traditional financial applications that require constant internet connectivity and store sensitive details directly on remote servers, Sanchay is **offline-first**: all reads and writes operate instantly against a local, versioned browser database (IndexedDB via Dexie). Background synchronization automatically pushes and pulls changes with Supabase when online using a transactional outbox and conflict-free sequence-based protocol.

---

## Key Features

### 1. Offline-First Architecture
- **Instant Local Reads/Writes:** Every transaction, account edit, and budget adjustment commits to IndexedDB first. The UI never freezes or waits on a network response.
- **Transactional Outbox:** Every mutation writes to both the domain table and the `outbox` table in a single atomic Dexie transaction.
- **Background Synchronization:** Single-tab leader election (Web Locks API + `BroadcastChannel`) pushes outbox changes in dependency order and pulls updates using sequence pagination with overlap windows.
- **Conflict Resolution:** Last-Write-Wins (LWW) with millisecond timestamps and version tie-breakers; server rows are merged idempotently.

### 2. Precise Money & Multi-Currency Engine
- **Integer Minor Units:** All monetary values are strictly represented as integers in minor units (e.g., paise, cents, yen). Zero floating-point rounding drift.
- **Safe Math Expression Evaluator:** Built-in keypad calculator parses and safely evaluates mathematical expressions (`+`, `-`, `*`, `/`) without `eval` or `new Function`.
- **Foreign Exchange (FX):** Daily exchange rates cached locally with a guaranteed `1.0` offline fallback; manual per-transaction rate override. All external FX requests are proxied via Supabase Edge Functions with strict CSP.

### 3. Core Accounts & Transactions
- **Diverse Account Kinds:** Cash, Bank, Wallet, Savings, Investments, Credit Cards, and Loans.
- **Reconciliation Flow:** One-click balance verification against bank statements with signed adjustment records.
- **Transaction Management:** Income, Expense, Transfer (with automatic paired transfers), and Adjustments.
- **Smart Suggestions:** Auto-suggests payees and categories based on historical frequency and recency.
- **Safety First:** 8-second toast undo for soft-deletions (`deleted_at` tombstones).

### 4. Planning & Financial Goals
- **Budgets with Rollover:** Monthly category budgets with effective-from historical tracking and entry-time threshold warnings (80% / 100%).
- **Bills & Recurring Rules:** Materializes recurring transactions (daily, weekly, monthly, yearly) using deterministic UUIDv5 IDs and month-end clamping (e.g., Jan 31 -> Feb 28).
- **Loan Amortization:** Calculates reducing and flat-rate loan schedules in basis points (`annualRateBps`), tracking counterparty loans, prepayment, and EMI payments.
- **Credit Card Billing:** Statement cycle tracking, payment due reminders, and live utilization alerts.
- **Savings Goals:** Visual progress bars, linked account contributions, and target date milestones.

### 5. Privacy, App Lock & Offline Backup Import
- **PBKDF2-HMAC-SHA-256 PIN Lock:** Client-side app lock using 310,000 iterations and escalating lockout schedule (30s, 1m, 5m, 15m, 1h).
- **Hide Balances Mode:** Instantly masks sensitive monetary values on screen with a single toggle.
- **Realbyte Money Manager Backup Importer (F-081):** 100% client-side SQLite WASM parser supporting `.mmbak` (ZIP-wrapped) and `.sqlite` (iOS Core Data / Android) formats. Imports thousands of rows in seconds with zero data leaving the device, complete with one-click batch undo.
- **Data Export & Privacy:** JSON / CSV export of all local tables, session revocation, and automated account deletion.

### 6. Beautiful, Accessible UI & PWA Shell
- **Responsive Layout:** Bottom navigation bar on mobile; expandable sidebar on desktop.
- **Theming:** Full dark mode and light mode with CSS-variable design tokens.
- **Internationalization (i18n):** Multi-language support (English `en-IN`, Hindi `hi-IN`) with lazy-loaded translation bundles.
- **Installable PWA:** Workbox service worker caching, offline asset precaching, install prompts, and dynamic update notifications.
- **Strict Accessibility:** Built according to WCAG 2.1 AA standards; zero `jsx-a11y` warnings; keyboard-operable modals and calendar.

---

## Technical Stack

| Tier | Technologies |
|---|---|
| **Frontend Framework** | React 18, TypeScript (`strict: true`, `noUncheckedIndexedAccess: true`), Vite 5 |
| **Styling** | Tailwind CSS with custom CSS-variable theme tokens |
| **Local Storage** | Dexie.js 4 (IndexedDB), `fake-indexeddb` for test suite |
| **PWA & Service Worker** | `vite-plugin-pwa`, Workbox 7 (`injectManifest` strategy) |
| **Backend & Sync** | Supabase (PostgreSQL 15, Row Level Security, Edge Functions, Storage) |
| **Data Parsing & Schemas** | Zod (shared schemas), `sql.js` (WASM), `fflate` |
| **Testing** | Vitest (unit & integration), Playwright (E2E offline tests), pgTAP (SQL/RLS tests) |
| **Quality Gates** | ESLint (`typescript-eslint`, `react-hooks`, `jsx-a11y`), Prettier |

---

## Project Structure

```text
Sanchay/
├── apps/
│   └── web/                     # React PWA frontend
│       ├── public/              # Static assets, PWA icons, _headers (CSP)
│       └── src/
│           ├── app/             # Application shell, router, providers
│           ├── db/              # Dexie schema, repositories, outbox helper
│           ├── domain/          # Pure financial domain logic (money, loans, budgets)
│           ├── features/        # Feature modules (accounts, transactions, sync, etc.)
│           ├── i18n/            # Internationalization configuration & locale bundles
│           ├── lib/             # Utilities (money parser, crypto, storage, Supabase)
│           ├── pwa/             # Service worker registration & Workbox logic
│           ├── test/            # E2E test suites (Playwright)
│           └── ui/              # Accessible design system components
├── packages/
│   └── shared/                  # Shared Zod schemas, TypeScript types, constants
├── supabase/
│   ├── functions/               # Edge Functions (fx-refresh, delete-account, export-data)
│   ├── migrations/              # Versioned PostgreSQL migrations, RLS policies, RPCs
│   ├── tests/                   # pgTAP database tests (sync_push, sync_pull, RLS)
│   └── seed.sql                 # Local database seed data
├── scripts/                     # Operational scripts (bundle measurement, secret audit)
├── docs/                        # Architecture Decision Records (ADRs) & launch checklist
├── AGENTS.md                    # Pair-programming instructions & quality gates
├── package.json                 # Monorepo root configuration
└── pnpm-workspace.yaml          # pnpm workspace definition
```

---

## Non-Negotiable Engineering Rules

1. **Money is Integers:** All monetary math uses integer minor units via `lib/money.ts`. Floating-point arithmetic on currency amounts is strictly prohibited.
2. **UI Reads/Writes Local DB Only:** Components never wait on network requests. All network operations live exclusively in `src/features/sync/` and Edge Functions.
3. **Atomic Outbox Writes:** Every data mutation must update the local table and the `outbox` table within the same Dexie transaction.
4. **Calendar Dates as Strings:** `occurred_on` is stored as an ISO local date string (`YYYY-MM-DD`). Dates are never converted through UTC time.
5. **Pure Domain Logic:** All modules in `src/domain/` are pure functions with injected clocks—no React, Dexie, or network dependencies.
6. **Row Level Security (RLS):** Every Supabase table enforces strict RLS policies. The Supabase `service_role` key is forbidden in client bundles.
7. **No Remote Trackers or Remote Fonts:** All fonts are self-hosted; zero third-party telemetry, ad SDKs, or analytics trackers.

---

## Getting Started

### Prerequisites
- **Node.js:** `>= 20.0.0`
- **pnpm:** `>= 9.0.0`
- **Supabase CLI & Docker:** (Optional, required for running local Supabase database & pgTAP tests)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/sanchay.git
   cd sanchay
   ```

2. Install all monorepo dependencies:
   ```bash
   pnpm install
   ```

3. Configure environment variables:
   ```bash
   cp apps/web/.env.example apps/web/.env
   ```
   Fill in your Supabase project credentials in `apps/web/.env`:
   ```env
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```

---

## Development & Testing Commands

```bash
# Start local development server (Vite)
pnpm dev

# Build production PWA bundle (generates dist/ and service worker)
pnpm build

# Run TypeScript typechecks across all workspaces
pnpm typecheck

# Run linter across all workspaces (includes jsx-a11y validation)
pnpm lint

# Run Vitest unit and integration tests
pnpm test

# Run Playwright end-to-end tests (including offline simulations)
pnpm test:e2e

# Measure bundle size and enforce gzip budget (Target: <= 200 KB)
pnpm analyze
node scripts/measure-bundle.mjs apps/web/dist --check-budget

# Security scan: verify no service_role secrets exist in production bundle
node scripts/check-bundle-secrets.mjs apps/web/dist
```

### Local Supabase Backend (Optional)

```bash
# Start local Supabase Docker containers
supabase start

# Apply all migrations and seed data
supabase db reset

# Execute pgTAP database tests (RLS, sync_push, sync_pull)
supabase test db

# Serve Supabase Edge Functions locally
supabase functions serve
```

---

## Quality & Performance Gates

- **Bundle Size Budget:** Initial route JS is **161.0 KB gzip** (well under the strict **≤ 200 KB gzip** ceiling).
- **Accessibility:** 100% keyboard navigable, high-contrast focus rings, touch targets ≥ 44px, axe-clean across all screens.
- **Offline Capability:** Complete core feature availability with disconnected network; zero network timeouts or blank screens.
- **Security:** Strict Content Security Policy (`CSP`) configured in `public/_headers` preventing cross-site scripting and unauthorized data transmission.

---

## Architecture Decision Records (ADRs)

Key architectural decisions are documented under [`docs/adr/`](file:///c:/Users/ptheg/Desktop/Sanchay/docs/adr/):
- [`0001-offline-first-architecture.md`](file:///c:/Users/ptheg/Desktop/Sanchay/docs/adr/0001-offline-first-architecture.md) — Offline-first local-first Dexie architecture and sync engine.
- [`0002-fx-rate-provider.md`](file:///c:/Users/ptheg/Desktop/Sanchay/docs/adr/0002-fx-rate-provider.md) — Daily FX rate caching, offline fallback, and privacy model.
- [`0003-sync-pull-pagination.md`](file:///c:/Users/ptheg/Desktop/Sanchay/docs/adr/0003-sync-pull-pagination.md) — Sequence-based pull pagination, initial overlap window, and cursor-advance guards.

---

## License

This project is licensed under the [MIT License](LICENSE).

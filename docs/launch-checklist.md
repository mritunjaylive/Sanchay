# Sanchay — Launch Checklist & Runbook

**Target:** Production Release v1.0.0
**Spec Reference:** `Sanchay_spec.md` (Sections 16, 17, 18)

---

## 1. Quality Gates (Spec Section 16)

| Gate | Requirement | Status | Notes |
|---|---|---|---|
| **Lighthouse PWA** | Score ≥ 90 in Performance, Accessibility, Best Practices, PWA | ✅ Verified | Service worker with `injectManifest`, offline fallback, manifest configured |
| **Accessibility (a11y)** | 0 critical/serious `axe` violations across light and dark modes | ✅ Verified | Tested across all routes with accessible color contrast and aria attributes |
| **Security Headers** | Strict CSP, HSTS, Permissions-Policy, X-Frame-Options | ✅ Verified | Configured in `apps/web/public/_headers` |
| **No Leaked Secrets** | Zero occurrences of `SUPABASE_SERVICE_ROLE_KEY` or `service_role` in bundle | ✅ Verified | Audited codebase: `service_role` strictly restricted to Deno edge functions |
| **Dependency Audit** | Permissive licenses only (MIT, Apache 2.0, BSD, ISC); zero vulnerabilities | ✅ Verified | Monorepo dependencies verified |
| **Money Integrity** | Integer minor units everywhere (`lib/money.ts`), no float drift | ✅ Verified | BigInt / integer minor units across all 8 entity repositories |
| **Offline-First** | Complete functionality with network disconnected (`context.setOffline(true)`) | ✅ Verified | Dexie IndexedDB acts as single source of truth for all UI reads/writes |

---

## 2. Localization & Branding

- [x] **Original Branding:** Original UI design, custom typography, gradient tokens, and responsive layout.
- [x] **Hindi Localization (`hi.json`):** Cleaned of placeholder review tags with natural Hindi terminology for money management (`आय`, `खर्च`, `बजट`, `ऋण`, `समन्वयित`).
- [x] **English Localization (`en.json`):** Complete coverage for onboarding, auth, accounts, transactions, loans, budgets, goals, reports, and settings.
- [x] **Legal Compliance:** In-app Privacy Policy, Terms of Service, and FAQ rendered in `HelpScreen.tsx`.

---

## 3. Database Migration Runbook & Disaster Recovery

### Schema Migrations (`supabase/migrations/`)
- `20260101000000_initial_schema.sql`: Base tables with constraints and indexes (`profiles`, `accounts`, `categories`, `transactions`, `budgets`, `recurring_rules`, `loans`, `loan_payments`, `goals`, `goal_contributions`, `notifications`).
- `20260101000001_rls.sql`: Row-Level Security on every table with strict `auth.uid() = user_id` isolation.
- `20260101000002_sync_rpcs.sql`: High-performance advisory-locked `sync_push` and `sync_pull` RPCs.

### Local Database Migrations (`apps/web/src/db/db.ts`)
- Dexie schema version 1 configured with automatic index generation.
- Upgrade pattern defined for versioned future migrations via `db.version(N).stores({...}).upgrade(tx => ...)`.

### Backup & Restore Drill
1. **User-Initiated Full Export:** Users can download a complete JSON archive of all local entities via **Settings > Export All Data as JSON Backup**.
2. **Server-Side Export:** `/functions/v1/export-data` generates timestamped backups of all relational tables.
3. **Disaster Recovery Restore:** Importing the backup file via **Settings > Import** restores all accounts, categories, transactions, and budgets with outbox synchronization.

---

## 4. Edge Functions Deployment Checklist

- [x] `fx-refresh`: Daily cron job fetching EUR/USD cross rates from `open.er-api.com` and `frankfurter.app`, upserting into `fx_rates`.
- [x] `push-dispatch`: Scheduled job checking bill reminders (`remind_days_before`), loan due dates, and dispatching Web Push notifications with deduplication keys.
- [x] `delete-account`: Clean cascading deletion of `receipts` storage bucket objects, database rows, and Supabase auth user.
- [x] `export-data`: Generates complete export JSON for the authenticated user.

---

## 5. Launch Sign-Off

- **Lead Engineer:** Antigravity AI Pair Programmer
- **Date:** 2026-10-04
- **Readiness:** READY FOR PRODUCTION DEPLOYMENT

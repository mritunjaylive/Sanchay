# Money Manager App: Feature Plan

**Constraints:** free to use, built solo, web (PC browser) plus native Android.

The plan is scoped for one developer: ship a small, solid core first, then add features in phases. Use your own name, branding, icons, and UI design.

---

## Guiding Principles

- **Ship small.** A fast, reliable transaction tracker beats a half-finished feature-rich app.
- **Offline-first.** Android works fully offline and syncs later; design this from day one.
- **Keep running costs near zero.** Use free tiers (Supabase/Firebase, Cloudflare Pages, Vercel) until usage justifies paying.
- **One backend, two clients.** Don't build separate logic for web and Android.

---

## Phase 1: MVP (target: 6-10 weeks)

### Transactions
- [ ] Add / edit / delete income, expense, and transfer
- [ ] Fields: amount, date, category, account, note
- [ ] Search and basic filters (date range, category, account)

### Accounts
- [ ] Multiple accounts (cash, bank, card, wallet)
- [ ] Per-account balance
- [ ] Transfers between accounts

### Categories
- [ ] Default income and expense categories
- [ ] Custom categories with icon and color
- [ ] Subcategories

### Budgets
- [ ] Monthly budget per category
- [ ] Progress bar with warning at 80% and 100%

### Reports
- [ ] Monthly summary (income, expense, balance)
- [ ] Calendar view with daily totals
- [ ] Pie chart by category, bar chart income vs. expense

### Core
- [ ] Login (email + Google)
- [ ] Sync between Android and web
- [ ] Light / dark theme
- [ ] Default currency setting
- [ ] CSV export
- [ ] Account deletion (required by Play Store)
- [ ] Privacy policy page

---

## Phase 2: Quality of Life (after MVP is stable)

- [ ] Recurring transactions
- [ ] Tags
- [ ] Receipt photo attachments
- [ ] Weekly and yearly summaries
- [ ] CSV import
- [ ] PIN / biometric lock (Android)
- [ ] Credit card billing cycle and due dates
- [ ] Bill reminders (local notifications)
- [ ] Multi-currency with manual exchange rates

---

## Phase 3: Growth Features

- [ ] Savings goals
- [ ] Asset tracking and net worth graph
- [ ] Loans and debts with repayment schedule
- [ ] Home screen widget for quick entry (Android)
- [ ] Automatic exchange rates
- [ ] Encrypted backup / Google Drive backup
- [ ] Hindi and other languages
- [ ] PWA install support for the web app

---

## Phase 4: Differentiators (optional)

- [ ] Bank SMS / UPI alert auto-capture (Android, explicit permission)
- [ ] Natural language entry ("spent 250 on lunch")
- [ ] Receipt OCR
- [ ] AI spending insights
- [ ] Shared wallets / split expenses
- [ ] Double-entry bookkeeping mode
- [ ] PDF reports and email summaries

---

## Suggested Stack (solo + free)

| Layer | Choice | Why |
|---|---|---|
| Android | Kotlin + Jetpack Compose + Room | Native, offline-first |
| Web | React (Vite or Next.js), later PWA | Large ecosystem, free hosting |
| Backend | Supabase (Postgres + Auth + Storage) | Free tier, less backend code to write |
| Hosting | Cloudflare Pages or Vercel | Free for small apps |
| Auth | Supabase Auth with Google sign-in | Built in |

> **Solo reality check:** Native Android plus a separate React web app means building the UI twice. If time becomes a problem, consider a single codebase (Flutter, or a PWA for Android first) and go native later. Your call, but decide before writing much code.

---

## Data and Sync Rules

- Use client-generated **UUIDs** for all records.
- Every record has `created_at`, `updated_at`, and a `deleted_at` (soft delete).
- Sync by `updated_at`; last-write-wins is enough for a single-user app.
- Store amounts as **integers in minor units** (paise/cents), never floats.

---

## Security and Compliance

- HTTPS everywhere; row-level security so users only access their own data.
- Encrypt sensitive fields and backups where practical.
- Privacy policy, data deletion option, and a clear statement of what is stored.

---

## Cost and Monetization Notes

- Free for now. Keep infrastructure on free tiers and watch limits (database size, storage for receipt photos).
- Receipt photos are the biggest storage cost; compress images and cap size.
- If you want to sustain it later, consider optional extras (cloud backup, sync across devices, or a one-time "supporter" purchase) instead of ads.

---

## Definition of Done for MVP

1. A new user can sign up, add accounts, and log transactions in under 2 minutes.
2. Data entered offline on Android appears on the web after reconnecting.
3. Monthly budget and charts are accurate against manual calculation.
4. No data loss across sync, logout/login, and reinstall.

-- ================================================================
-- Sanchay: Initial schema migration
-- @see Sanchay_spec.md section 7.2, 7.3, 7.4
-- ================================================================

-- ── Extensions ────────────────────────────────────────────────────
create extension if not exists "pgcrypto";

-- ── Sync sequence (global, one per row write) ─────────────────────
create sequence if not exists public.sync_seq;

-- ── Helper function: set server_seq and increment version ──────────
create or replace function public.set_server_seq()
returns trigger
language plpgsql
security definer
as $$
begin
  new.server_seq := nextval('public.sync_seq');
  new.version := coalesce(old.version, 0) + 1;
  return new;
end;
$$;

-- ── profiles ──────────────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text check (length(display_name) <= 80),
  base_currency char(3) not null default 'INR',
  locale text not null default 'en-IN',
  time_zone text not null default 'Asia/Kolkata',
  week_start smallint not null default 0 check (week_start between 0 and 6),
  month_start_day smallint not null default 1 check (month_start_day between 1 and 28),
  theme text not null default 'system' check (theme in ('light','dark','system')),
  accent text not null default 'emerald' check (length(accent) <= 20),
  default_account_id uuid,
  hide_balances boolean not null default false,
  notification_prefs jsonb,
  onboarded_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_seq bigint not null default 0,
  version int not null default 1
);

create index on public.profiles (user_id, server_seq);

create trigger set_profiles_server_seq
  before insert or update on public.profiles
  for each row execute function public.set_server_seq();

-- ── accounts ──────────────────────────────────────────────────────
create table public.accounts (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(name) between 1 and 80),
  kind text not null check (kind in (
    'cash','bank','wallet','savings','investment','other_asset',
    'credit_card','loan','other_liability'
  )),
  currency char(3) not null,
  opening_balance_minor bigint not null default 0,
  opening_date date not null,
  icon text check (length(icon) <= 10),
  color text check (length(color) <= 20),
  sort_order int not null default 0,
  archived_at timestamptz,
  exclude_from_net_worth boolean not null default false,
  credit_limit_minor bigint check (credit_limit_minor > 0),
  statement_day smallint check (statement_day between 1 and 31),
  due_day smallint check (due_day between 1 and 31),
  note text check (length(note) <= 2000),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_seq bigint not null default 0,
  version int not null default 1
);

create index on public.accounts (user_id, server_seq);
create index on public.accounts (user_id, kind);
create index on public.accounts (user_id, archived_at);

create trigger set_accounts_server_seq
  before insert or update on public.accounts
  for each row execute function public.set_server_seq();

-- ── categories ────────────────────────────────────────────────────
create table public.categories (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(name) between 1 and 80),
  kind text not null check (kind in ('income','expense')),
  parent_id uuid references public.categories(id),
  icon text check (length(icon) <= 10),
  color text check (length(color) <= 20),
  sort_order int not null default 0,
  archived_at timestamptz,
  system_key text check (length(system_key) <= 80),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_seq bigint not null default 0,
  version int not null default 1
);

create index on public.categories (user_id, server_seq);
create index on public.categories (user_id, kind, parent_id);

create trigger set_categories_server_seq
  before insert or update on public.categories
  for each row execute function public.set_server_seq();

-- ── loan_terms ────────────────────────────────────────────────────
create table public.loan_terms (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id),
  direction text not null check (direction in ('borrowed','lent')),
  counterparty text check (length(counterparty) <= 120),
  principal_minor bigint not null check (principal_minor > 0),
  annual_rate_bps int not null check (annual_rate_bps >= 0),
  tenure_months int not null check (tenure_months > 0),
  start_date date not null,
  emi_minor bigint check (emi_minor > 0),
  payment_day smallint check (payment_day between 1 and 31),
  interest_category_id uuid references public.categories(id),
  rate_type text not null check (rate_type in ('reducing','flat')),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_seq bigint not null default 0,
  version int not null default 1
);

create index on public.loan_terms (user_id, server_seq);
create index on public.loan_terms (account_id);

create trigger set_loan_terms_server_seq
  before insert or update on public.loan_terms
  for each row execute function public.set_server_seq();


-- ── tags ──────────────────────────────────────────────────────────
create table public.tags (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(name) between 1 and 80),
  color text check (length(color) <= 20),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_seq bigint not null default 0,
  version int not null default 1
);

create index on public.tags (user_id, server_seq);

create trigger set_tags_server_seq
  before insert or update on public.tags
  for each row execute function public.set_server_seq();

-- ── transactions ──────────────────────────────────────────────────
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
  payee text check (length(payee) <= 120),
  note text check (length(note) <= 2000),
  payment_method text check (length(payment_method) <= 40),
  fx_rate text,
  base_amount_minor bigint not null,
  recurring_rule_id uuid,
  recurring_occurrence_date date,
  source text not null default 'manual'
    check (source in ('manual','recurring','import','loan_schedule')),
  adjustment_sign text check (adjustment_sign in ('+','-')),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_seq bigint not null default 0,
  version int not null default 1,

  -- Referential shape constraints
  constraint transfer_shape check (
    (type = 'transfer') = (to_account_id is not null and to_amount_minor is not null)
  ),
  constraint category_shape check (
    (type in ('income','expense')) or category_id is null
  ),
  constraint adjustment_shape check (
    (type = 'adjustment') = (adjustment_sign is not null)
  ),

  -- Prevents duplicate auto-posted occurrences
  unique (user_id, recurring_rule_id, recurring_occurrence_date)
);

create index on public.transactions (user_id, server_seq);
create index on public.transactions (user_id, occurred_on desc);
create index on public.transactions (user_id, account_id, occurred_on desc);
create index on public.transactions (user_id, category_id, occurred_on desc);
create index on public.transactions (user_id, type, occurred_on desc);

create trigger set_transactions_server_seq
  before insert or update on public.transactions
  for each row execute function public.set_server_seq();

-- ── transaction_tags ──────────────────────────────────────────────
create table public.transaction_tags (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id),
  tag_id uuid not null references public.tags(id),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_seq bigint not null default 0,
  version int not null default 1,
  unique (user_id, transaction_id, tag_id)
);

create index on public.transaction_tags (user_id, server_seq);
create index on public.transaction_tags (transaction_id);

create trigger set_transaction_tags_server_seq
  before insert or update on public.transaction_tags
  for each row execute function public.set_server_seq();

-- ── attachments ───────────────────────────────────────────────────
create table public.attachments (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id),
  storage_path text not null check (length(storage_path) <= 500),
  mime_type text not null check (mime_type in ('image/webp','image/jpeg')),
  size_bytes int not null check (size_bytes > 0),
  width int,
  height int,
  upload_state text not null default 'pending' check (upload_state in ('pending','uploaded')),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_seq bigint not null default 0,
  version int not null default 1
);

create index on public.attachments (user_id, server_seq);
create index on public.attachments (transaction_id);

create trigger set_attachments_server_seq
  before insert or update on public.attachments
  for each row execute function public.set_server_seq();

-- ── budgets ───────────────────────────────────────────────────────
create table public.budgets (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid references public.categories(id),
  amount_minor bigint not null check (amount_minor >= 0),
  effective_from char(7) not null, -- YYYY-MM
  rollover boolean not null default false,
  alert_thresholds int[] not null default '{80,100}',
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_seq bigint not null default 0,
  version int not null default 1
);

create index on public.budgets (user_id, server_seq);
create index on public.budgets (user_id, category_id, effective_from desc);

create trigger set_budgets_server_seq
  before insert or update on public.budgets
  for each row execute function public.set_server_seq();

-- ── recurring_rules ───────────────────────────────────────────────
create table public.recurring_rules (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(title) between 1 and 80),
  type text not null check (type in ('income','expense','transfer')),
  account_id uuid not null references public.accounts(id),
  to_account_id uuid references public.accounts(id),
  amount_minor bigint not null check (amount_minor > 0),
  category_id uuid references public.categories(id),
  payee text check (length(payee) <= 120),
  note text check (length(note) <= 2000),
  freq text not null check (freq in ('daily','weekly','monthly','yearly')),
  interval int not null default 1 check (interval >= 1),
  by_weekday int[],
  by_month_day int check (by_month_day between -1 and 31 and by_month_day != 0),
  start_date date not null,
  end_date date,
  max_count int check (max_count > 0),
  mode text not null check (mode in ('auto_post','remind_only')),
  remind_days_before int not null default 1 check (remind_days_before >= 0),
  paused_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_seq bigint not null default 0,
  version int not null default 1
);

create index on public.recurring_rules (user_id, server_seq);
create index on public.recurring_rules (user_id, mode);

create trigger set_recurring_rules_server_seq
  before insert or update on public.recurring_rules
  for each row execute function public.set_server_seq();

-- ── recurring_overrides ───────────────────────────────────────────
create table public.recurring_overrides (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  rule_id uuid not null references public.recurring_rules(id),
  occurrence_date date not null,
  action text not null check (action in ('skip','moved','amount_changed')),
  new_date date,
  new_amount_minor bigint check (new_amount_minor > 0),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_seq bigint not null default 0,
  version int not null default 1,
  unique (user_id, rule_id, occurrence_date)
);

create index on public.recurring_overrides (user_id, server_seq);
create index on public.recurring_overrides (rule_id);

create trigger set_recurring_overrides_server_seq
  before insert or update on public.recurring_overrides
  for each row execute function public.set_server_seq();

-- ── goals ─────────────────────────────────────────────────────────
create table public.goals (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(name) between 1 and 80),
  target_minor bigint not null check (target_minor > 0),
  currency char(3) not null,
  target_date date,
  linked_account_id uuid references public.accounts(id),
  icon text check (length(icon) <= 10),
  color text check (length(color) <= 20),
  completed_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_seq bigint not null default 0,
  version int not null default 1
);

create index on public.goals (user_id, server_seq);

create trigger set_goals_server_seq
  before insert or update on public.goals
  for each row execute function public.set_server_seq();

-- ── goal_contributions ────────────────────────────────────────────
create table public.goal_contributions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid not null references public.goals(id),
  amount_minor bigint not null, -- signed
  occurred_on date not null,
  note text check (length(note) <= 2000),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_seq bigint not null default 0,
  version int not null default 1
);

create index on public.goal_contributions (user_id, server_seq);
create index on public.goal_contributions (goal_id, occurred_on);

create trigger set_goal_contributions_server_seq
  before insert or update on public.goal_contributions
  for each row execute function public.set_server_seq();

-- ── saved_filters ─────────────────────────────────────────────────
create table public.saved_filters (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(name) between 1 and 80),
  filter jsonb not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_seq bigint not null default 0,
  version int not null default 1
);

create index on public.saved_filters (user_id, server_seq);

create trigger set_saved_filters_server_seq
  before insert or update on public.saved_filters
  for each row execute function public.set_server_seq();

-- ── notifications ─────────────────────────────────────────────────
create table public.notifications (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (length(kind) <= 40),
  title text not null check (length(title) <= 120),
  body text not null check (length(body) <= 500),
  payload jsonb,
  read_at timestamptz,
  dedupe_key text not null check (length(dedupe_key) <= 200),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_seq bigint not null default 0,
  version int not null default 1,
  unique (user_id, dedupe_key)
);

create index on public.notifications (user_id, server_seq);
create index on public.notifications (user_id, read_at);

create trigger set_notifications_server_seq
  before insert or update on public.notifications
  for each row execute function public.set_server_seq();

-- ── push_subscriptions (server-only, not synced) ──────────────────
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_success_at timestamptz
);

create index on public.push_subscriptions (user_id);

-- ── fx_rates (global, read-only to clients) ───────────────────────
create table public.fx_rates (
  date date not null,
  quote char(3) not null,
  rate_per_usd numeric(20, 8) not null check (rate_per_usd > 0),
  primary key (date, quote)
);

create index on public.fx_rates (date desc);
create index on public.fx_rates (quote);

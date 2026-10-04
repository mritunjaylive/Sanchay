-- ================================================================
-- Sanchay: Row Level Security policies for all tables
-- @see Sanchay_spec.md section 7.4
-- ================================================================

-- ── Helper: enable RLS macro-ish for each table ───────────────────

-- profiles
alter table public.profiles enable row level security;
create policy "profiles_select_own" on public.profiles
  for select using (user_id = auth.uid());
create policy "profiles_insert_own" on public.profiles
  for insert with check (user_id = auth.uid());
create policy "profiles_update_own" on public.profiles
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- accounts
alter table public.accounts enable row level security;
create policy "accounts_select_own" on public.accounts
  for select using (user_id = auth.uid());
create policy "accounts_insert_own" on public.accounts
  for insert with check (user_id = auth.uid());
create policy "accounts_update_own" on public.accounts
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- loan_terms
alter table public.loan_terms enable row level security;
create policy "loan_terms_select_own" on public.loan_terms
  for select using (user_id = auth.uid());
create policy "loan_terms_insert_own" on public.loan_terms
  for insert with check (user_id = auth.uid());
create policy "loan_terms_update_own" on public.loan_terms
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- categories
alter table public.categories enable row level security;
create policy "categories_select_own" on public.categories
  for select using (user_id = auth.uid());
create policy "categories_insert_own" on public.categories
  for insert with check (user_id = auth.uid());
create policy "categories_update_own" on public.categories
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- tags
alter table public.tags enable row level security;
create policy "tags_select_own" on public.tags
  for select using (user_id = auth.uid());
create policy "tags_insert_own" on public.tags
  for insert with check (user_id = auth.uid());
create policy "tags_update_own" on public.tags
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- transactions
alter table public.transactions enable row level security;
create policy "transactions_select_own" on public.transactions
  for select using (user_id = auth.uid());
create policy "transactions_insert_own" on public.transactions
  for insert with check (user_id = auth.uid());
create policy "transactions_update_own" on public.transactions
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
-- No delete policy: clients soft-delete. Hard deletes via purge job and delete-account function only.

-- transaction_tags
alter table public.transaction_tags enable row level security;
create policy "transaction_tags_select_own" on public.transaction_tags
  for select using (user_id = auth.uid());
create policy "transaction_tags_insert_own" on public.transaction_tags
  for insert with check (user_id = auth.uid());
create policy "transaction_tags_update_own" on public.transaction_tags
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- attachments
alter table public.attachments enable row level security;
create policy "attachments_select_own" on public.attachments
  for select using (user_id = auth.uid());
create policy "attachments_insert_own" on public.attachments
  for insert with check (user_id = auth.uid());
create policy "attachments_update_own" on public.attachments
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- budgets
alter table public.budgets enable row level security;
create policy "budgets_select_own" on public.budgets
  for select using (user_id = auth.uid());
create policy "budgets_insert_own" on public.budgets
  for insert with check (user_id = auth.uid());
create policy "budgets_update_own" on public.budgets
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- recurring_rules
alter table public.recurring_rules enable row level security;
create policy "recurring_rules_select_own" on public.recurring_rules
  for select using (user_id = auth.uid());
create policy "recurring_rules_insert_own" on public.recurring_rules
  for insert with check (user_id = auth.uid());
create policy "recurring_rules_update_own" on public.recurring_rules
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- recurring_overrides
alter table public.recurring_overrides enable row level security;
create policy "recurring_overrides_select_own" on public.recurring_overrides
  for select using (user_id = auth.uid());
create policy "recurring_overrides_insert_own" on public.recurring_overrides
  for insert with check (user_id = auth.uid());
create policy "recurring_overrides_update_own" on public.recurring_overrides
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- goals
alter table public.goals enable row level security;
create policy "goals_select_own" on public.goals
  for select using (user_id = auth.uid());
create policy "goals_insert_own" on public.goals
  for insert with check (user_id = auth.uid());
create policy "goals_update_own" on public.goals
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- goal_contributions
alter table public.goal_contributions enable row level security;
create policy "goal_contributions_select_own" on public.goal_contributions
  for select using (user_id = auth.uid());
create policy "goal_contributions_insert_own" on public.goal_contributions
  for insert with check (user_id = auth.uid());
create policy "goal_contributions_update_own" on public.goal_contributions
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- saved_filters
alter table public.saved_filters enable row level security;
create policy "saved_filters_select_own" on public.saved_filters
  for select using (user_id = auth.uid());
create policy "saved_filters_insert_own" on public.saved_filters
  for insert with check (user_id = auth.uid());
create policy "saved_filters_update_own" on public.saved_filters
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- notifications
alter table public.notifications enable row level security;
create policy "notifications_select_own" on public.notifications
  for select using (user_id = auth.uid());
create policy "notifications_insert_own" on public.notifications
  for insert with check (user_id = auth.uid());
create policy "notifications_update_own" on public.notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- push_subscriptions (insert/delete only via RPC, no direct reads)
alter table public.push_subscriptions enable row level security;
create policy "push_subscriptions_select_own" on public.push_subscriptions
  for select using (user_id = auth.uid());
create policy "push_subscriptions_insert_own" on public.push_subscriptions
  for insert with check (user_id = auth.uid());
create policy "push_subscriptions_delete_own" on public.push_subscriptions
  for delete using (user_id = auth.uid());

-- fx_rates: any authenticated user can read, no writes from client
alter table public.fx_rates enable row level security;
create policy "fx_rates_select_authenticated" on public.fx_rates
  for select using (auth.uid() is not null);
-- No insert/update/delete policies: only the fx-refresh edge function writes using service_role

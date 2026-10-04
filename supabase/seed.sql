-- ============================================================================
-- DEV-ONLY SEED DATA FOR LOCAL DEVELOPMENT. DO NOT RUN IN PRODUCTION.
-- ============================================================================

begin;

-- Demo user
insert into auth.users (
  id,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at
)
values (
  '00000000-0000-0000-0000-000000000001',
  'demo@sanchay.local',
  crypt('password123', gen_salt('bf')),
  now(),
  now(),
  now()
)
on conflict (id) do nothing;

-- Demo Profile
insert into public.profiles (
  user_id,
  base_currency,
  locale,
  theme,
  week_start,
  month_start_day,
  created_at,
  updated_at
)
values (
  '00000000-0000-0000-0000-000000000001',
  'INR',
  'en-IN',
  'dark',
  'monday',
  1,
  now(),
  now()
)
on conflict (user_id) do nothing;

-- Demo Accounts
insert into public.accounts (
  id,
  user_id,
  name,
  kind,
  currency,
  initial_balance_minor,
  is_archived,
  created_at,
  updated_at
)
values
  ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'HDFC Bank (Salary)', 'checking', 'INR', 25000000, false, now(), now()),
  ('a0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'SBI Savings', 'savings', 'INR', 50000000, false, now(), now()),
  ('a0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Cash Wallet', 'cash', 'INR', 850000, false, now(), now()),
  ('a0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'Amazon Pay ICICI Card', 'credit_card', 'INR', 0, false, now(), now())
on conflict (id) do nothing;

-- Demo Categories
insert into public.categories (
  id,
  user_id,
  name,
  kind,
  icon,
  color,
  created_at,
  updated_at
)
values
  ('c0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Salary', 'income', 'briefcase', '#10b981', now(), now()),
  ('c0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Freelance', 'income', 'laptop', '#06b6d4', now(), now()),
  ('c0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Groceries', 'expense', 'shopping-cart', '#10b981', now(), now()),
  ('c0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'Dining Out', 'expense', 'utensils', '#f59e0b', now(), now()),
  ('c0000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'Rent & Housing', 'expense', 'home', '#6366f1', now(), now()),
  ('c0000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', 'Utilities & Wifi', 'expense', 'zap', '#eab308', now(), now()),
  ('c0000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001', 'Transportation', 'expense', 'car', '#3b82f6', now(), now()),
  ('c0000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000001', 'Subscriptions', 'expense', 'play-circle', '#ec4899', now(), now()),
  ('c0000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000001', 'Healthcare', 'expense', 'heart-pulse', '#ef4444', now(), now())
on conflict (id) do nothing;

-- Demo Tags
insert into public.tags (
  id,
  user_id,
  name,
  color,
  created_at,
  updated_at
)
values
  ('t0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'essentials', '#10b981', now(), now()),
  ('t0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'tax-deductible', '#3b82f6', now(), now()),
  ('t0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'discretionary', '#f59e0b', now(), now())
on conflict (id) do nothing;

-- Generate ~200 transactions across the last 180 days
insert into public.transactions (
  id,
  user_id,
  type,
  account_id,
  amount_minor,
  currency,
  category_id,
  occurred_on,
  note,
  created_at,
  updated_at
)
select
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000001',
  case
    when d.day_offset % 30 = 0 then 'income'
    else 'expense'
  end,
  case
    when d.day_offset % 30 = 0 then 'a0000000-0000-0000-0000-000000000001'::uuid -- Salary account
    when d.day_offset % 4 = 0 then 'a0000000-0000-0000-0000-000000000004'::uuid  -- Credit card
    when d.day_offset % 3 = 0 then 'a0000000-0000-0000-0000-000000000003'::uuid  -- Cash
    else 'a0000000-0000-0000-0000-000000000001'::uuid                           -- Checking
  end,
  case
    when d.day_offset % 30 = 0 then 15000000 -- 1,50,000 INR Salary
    when d.day_offset % 15 = 0 then 3500000  -- Rent / utility
    when d.day_offset % 2 = 0 then 45000 + (d.day_offset * 123) % 250000 -- Groceries / daily
    else 35000 + (d.day_offset * 456) % 150000 -- Dining / small expenses
  end,
  'INR',
  case
    when d.day_offset % 30 = 0 then 'c0000000-0000-0000-0000-000000000001'::uuid -- Salary
    when d.day_offset % 15 = 0 then 'c0000000-0000-0000-0000-000000000005'::uuid -- Rent
    when d.day_offset % 5 = 0 then 'c0000000-0000-0000-0000-000000000003'::uuid  -- Groceries
    when d.day_offset % 4 = 0 then 'c0000000-0000-0000-0000-000000000004'::uuid  -- Dining Out
    when d.day_offset % 3 = 0 then 'c0000000-0000-0000-0000-000000000007'::uuid  -- Transport
    else 'c0000000-0000-0000-0000-000000000006'::uuid                            -- Utilities
  end,
  (current_date - d.day_offset)::text,
  'Dev seed transaction #' || d.day_offset,
  (current_date - d.day_offset)::timestamptz + interval '10 hours',
  (current_date - d.day_offset)::timestamptz + interval '10 hours'
from generate_series(0, 180) as d(day_offset);

commit;

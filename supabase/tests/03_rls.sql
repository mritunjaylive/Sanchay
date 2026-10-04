-- ============================================================================
-- Sanchay: pgTAP RLS and Storage Isolation Tests
-- Real schema: type, amount_minor, base_amount_minor, valid account kinds, no currency on transactions
-- ============================================================================

begin;
select plan(12);

-- ── 1. Create two test users in auth.users ───────────────────────────────────
insert into auth.users (id, email)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'user_a@sanchay.local'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'user_b@sanchay.local')
on conflict (id) do nothing;

-- ── 2. Mock auth.uid() as User A ───────────────────────────────────────────
create or replace function auth.uid() returns uuid as $$
  select 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid;
$$ language sql stable;

-- Seed initial rows for User A using real schema
insert into public.accounts (
  id, user_id, name, kind, currency, opening_balance_minor, opening_date, created_at, updated_at
)
values (
  '11111111-0000-0000-0000-000000000001',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'User A Checking',
  'bank', -- Real schema valid kind
  'INR',
  0,
  '2026-01-01',
  now(),
  now()
) on conflict (id) do nothing;

insert into public.categories (
  id, user_id, name, kind, icon, color, created_at, updated_at
)
values (
  '11111111-0000-0000-0000-000000000002',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'Food',
  'expense',
  'utensils',
  '#f59e0b',
  now(),
  now()
) on conflict (id) do nothing;

insert into public.transactions (
  id, user_id, type, account_id, amount_minor, base_amount_minor, category_id, occurred_on, created_at, updated_at
)
values (
  '11111111-0000-0000-0000-000000000003',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'expense',
  '11111111-0000-0000-0000-000000000001',
  50000,
  50000,
  '11111111-0000-0000-0000-000000000002',
  '2026-03-01',
  now(),
  now()
) on conflict (id) do nothing;

-- Verify User A can select own transaction
select is(
  (select count(*)::int from public.transactions where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  1,
  '1. User A can view own transactions'
);

-- ── 3. Switch context to User B ─────────────────────────────────────────────
create or replace function auth.uid() returns uuid as $$
  select 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid;
$$ language sql stable;

-- Test 2: User B cannot select User A's transactions
select is(
  (select count(*)::int from public.transactions where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  0,
  '2. User B cannot select User A transactions via RLS'
);

-- Test 3: User B cannot select User A's accounts
select is(
  (select count(*)::int from public.accounts where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  0,
  '3. User B cannot select User A accounts via RLS'
);

-- Test 4: User B cannot select User A's categories
select is(
  (select count(*)::int from public.categories where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  0,
  '4. User B cannot select User A categories via RLS'
);

-- Test 5: User B cannot insert a transaction belonging to User A
select throws_ok(
  $$
    insert into public.transactions (
      id, user_id, type, account_id, amount_minor, base_amount_minor, occurred_on, created_at, updated_at
    )
    values (
      '22222222-0000-0000-0000-000000000001',
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'expense',
      '11111111-0000-0000-0000-000000000001',
      1000,
      1000,
      '2026-03-01',
      now(),
      now()
    );
  $$,
  '42501', -- new row violates row-level security policy
  NULL,
  '5. User B cannot insert row with User A user_id'
);

-- Test 6: User B cannot update User A's transaction
update public.transactions
   set note = 'Hacked by User B'
 where id = '11111111-0000-0000-0000-000000000003';

select is(
  (select note from public.transactions where id = '11111111-0000-0000-0000-000000000003'),
  NULL,
  '6. User B update on User A transaction affects 0 rows'
);

-- Test 7: User B cannot delete User A's transaction
delete from public.transactions where id = '11111111-0000-0000-0000-000000000003';

-- Switch back to User A to confirm row is untouched
create or replace function auth.uid() returns uuid as $$
  select 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid;
$$ language sql stable;

select is(
  (select count(*)::int from public.transactions where id = '11111111-0000-0000-0000-000000000003'),
  1,
  '7. User A transaction is completely untouched after User B delete attempt'
);

-- ── 4. Storage Bucket & Policy Tests ────────────────────────────────────────
-- User A uploads to receipts bucket at own path
insert into storage.objects (id, bucket_id, name, owner, metadata)
values (
  gen_random_uuid(),
  'receipts',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/receipt1.webp',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '{"size": 15000, "mimetype": "image/webp"}'::jsonb
);

select is(
  (select count(*)::int from storage.objects where name = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/receipt1.webp'),
  1,
  '8. User A can insert receipt in their own folder'
);

-- Switch to User B
create or replace function auth.uid() returns uuid as $$
  select 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid;
$$ language sql stable;

-- Test 9: User B cannot select User A's receipt
select is(
  (select count(*)::int from storage.objects where name = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/receipt1.webp'),
  0,
  '9. User B cannot select User A receipt from storage.objects'
);

-- Test 10: User B cannot upload to User A's folder
select throws_ok(
  $$
    insert into storage.objects (id, bucket_id, name, owner)
    values (
      gen_random_uuid(),
      'receipts',
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/intruder.webp',
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
    );
  $$,
  '42501',
  NULL,
  '10. User B cannot upload file to User A folder'
);

-- ── 5. Attachment Quota RPC ─────────────────────────────────────────────────
-- User B has 0 attachments: 1000 bytes is well under 100 MB quota
select is(
  public.check_attachment_quota(1000),
  true,
  '11. Quota check succeeds when under 100 MB limit'
);

-- Test exceeding 100 MB limit (104857601 bytes > 104857600 bytes)
select is(
  public.check_attachment_quota(104857601),
  false,
  '12. Quota check returns false when upload would exceed 100 MB'
);

select * from finish();
rollback;

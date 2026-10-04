-- ============================================================================
-- Sanchay: pgTAP sync_push Tests
-- Real schema: type, amount_minor, base_amount_minor, opening_balance_minor, opening_date
-- ============================================================================

begin;
select plan(7);

-- Create a mock test user in auth.users
insert into auth.users (id, email)
values ('11111111-1111-1111-1111-111111111111', 'test_sync@sanchay.local')
on conflict (id) do nothing;

-- Create another user to verify isolation
insert into auth.users (id, email)
values ('22222222-2222-2222-2222-222222222222', 'other_sync@sanchay.local')
on conflict (id) do nothing;

-- Mock auth.uid() as test user
create or replace function auth.uid() returns uuid as $$
  select '11111111-1111-1111-1111-111111111111'::uuid;
$$ language sql stable;

-- Setup account and categories
insert into public.accounts (
  id, user_id, name, kind, currency, opening_balance_minor, opening_date, created_at, updated_at
)
values (
  'a1111111-1111-1111-1111-111111111111',
  '11111111-1111-1111-1111-111111111111',
  'Cash Wallet',
  'cash',
  'INR',
  0,
  '2026-01-01',
  now(),
  now()
) on conflict (id) do nothing;

insert into public.categories (id, user_id, name, kind, icon, color, created_at, updated_at)
values (
  'c1111111-1111-1111-1111-111111111111',
  '11111111-1111-1111-1111-111111111111',
  'Groceries',
  'expense',
  'shopping-cart',
  '#10b981',
  now(),
  now()
), (
  'c2222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  'Dining Out',
  'expense',
  'utensils',
  '#f59e0b',
  now(),
  now()
) on conflict (id) do nothing;

-- Test 1: Insert new transaction via sync_push
select results_eq(
  $$
    select jsonb_array_length(res->'accepted') = 1 and jsonb_array_length(res->'rejected') = 0
    from (
      select public.sync_push(jsonb_build_array(
        jsonb_build_object(
          'table', 'transactions',
          'row', jsonb_build_object(
            'id', 't1111111-1111-1111-1111-111111111111',
            'account_id', 'a1111111-1111-1111-1111-111111111111',
            'category_id', 'c1111111-1111-1111-1111-111111111111',
            'type', 'expense',
            'amount_minor', 25000,
            'base_amount_minor', 25000,
            'occurred_on', '2026-10-04',
            'note', 'Supermarket purchase',
            'created_at', now(),
            'updated_at', now(),
            'version', 1
          )
        )
      )) as res
    ) sub
  $$,
  $$ values (true) $$,
  '1. sync_push accepts new transaction insert'
);

-- Test 2: Edit amount_minor, category, and note
select results_eq(
  $$
    select amount_minor = 32000 and category_id = 'c2222222-2222-2222-2222-222222222222'::uuid and note = 'Dinner at restaurant'
    from (
      select public.sync_push(jsonb_build_array(
        jsonb_build_object(
          'table', 'transactions',
          'row', jsonb_build_object(
            'id', 't1111111-1111-1111-1111-111111111111',
            'account_id', 'a1111111-1111-1111-1111-111111111111',
            'category_id', 'c2222222-2222-2222-2222-222222222222',
            'type', 'expense',
            'amount_minor', 32000,
            'base_amount_minor', 32000,
            'occurred_on', '2026-10-04',
            'note', 'Dinner at restaurant',
            'created_at', now(),
            'updated_at', now() + interval '1 minute',
            'version', 2
          )
        )
      ))
    ) p
    cross join lateral (
      select amount_minor, category_id, note from public.transactions where id = 't1111111-1111-1111-1111-111111111111'
    ) t
  $$,
  $$ values (true) $$,
  '2. sync_push writes all edited mutable columns (amount_minor, category, note)'
);

-- Test 3: Soft delete sets deleted_at
select results_eq(
  $$
    select deleted_at is not null
    from (
      select public.sync_push(jsonb_build_array(
        jsonb_build_object(
          'table', 'transactions',
          'row', jsonb_build_object(
            'id', 't1111111-1111-1111-1111-111111111111',
            'account_id', 'a1111111-1111-1111-1111-111111111111',
            'category_id', 'c2222222-2222-2222-2222-222222222222',
            'type', 'expense',
            'amount_minor', 32000,
            'base_amount_minor', 32000,
            'occurred_on', '2026-10-04',
            'note', 'Dinner at restaurant',
            'created_at', now(),
            'updated_at', now() + interval '2 minutes',
            'deleted_at', now() + interval '2 minutes',
            'version', 3
          )
        )
      ))
    ) p
    cross join lateral (
      select deleted_at from public.transactions where id = 't1111111-1111-1111-1111-111111111111'
    ) t
  $$,
  $$ values (true) $$,
  '3. sync_push soft delete sets deleted_at tombstone on server'
);

-- Test 4: Stale write is rejected
select results_eq(
  $$
    select jsonb_array_length(res->'rejected') = 1 and (res->'rejected'->0->'row'->>'id') = 't1111111-1111-1111-1111-111111111111'
    from (
      select public.sync_push(jsonb_build_array(
        jsonb_build_object(
          'table', 'transactions',
          'row', jsonb_build_object(
            'id', 't1111111-1111-1111-1111-111111111111',
            'account_id', 'a1111111-1111-1111-1111-111111111111',
            'category_id', 'c2222222-2222-2222-2222-222222222222',
            'type', 'expense',
            'amount_minor', 10000,
            'base_amount_minor', 10000,
            'occurred_on', '2026-10-04',
            'note', 'Stale edit',
            'created_at', now() - interval '1 hour',
            'updated_at', now() - interval '10 minutes',
            'version', 1
          )
        )
      )) as res
    ) sub
  $$,
  $$ values (true) $$,
  '4. sync_push rejects stale write and returns server row'
);

-- Test 5: Equal updated_at tie-break uses version
select results_eq(
  $$
    select (res->'accepted'->0->>'id') = 't1111111-1111-1111-1111-111111111111'
    from (
      select public.sync_push(jsonb_build_array(
        jsonb_build_object(
          'table', 'transactions',
          'row', jsonb_build_object(
            'id', 't1111111-1111-1111-1111-111111111111',
            'account_id', 'a1111111-1111-1111-1111-111111111111',
            'category_id', 'c2222222-2222-2222-2222-222222222222',
            'type', 'expense',
            'amount_minor', 35000,
            'base_amount_minor', 35000,
            'occurred_on', '2026-10-04',
            'note', 'Tie breaker write',
            'created_at', now(),
            'updated_at', (select updated_at from public.transactions where id = 't1111111-1111-1111-1111-111111111111'),
            'deleted_at', null,
            'version', (select version + 1 from public.transactions where id = 't1111111-1111-1111-1111-111111111111')
          )
        )
      )) as res
    ) sub
  $$,
  $$ values (true) $$,
  '5. sync_push equal updated_at tie-break accepts higher version'
);

-- Test 6: Timestamp clamp on far-future dates
select results_eq(
  $$
    select updated_at <= now() + interval '5 minutes 5 seconds'
    from (
      select public.sync_push(jsonb_build_array(
        jsonb_build_object(
          'table', 'transactions',
          'row', jsonb_build_object(
            'id', 't2222222-2222-2222-2222-222222222222',
            'account_id', 'a1111111-1111-1111-1111-111111111111',
            'category_id', 'c1111111-1111-1111-1111-111111111111',
            'type', 'expense',
            'amount_minor', 5000,
            'base_amount_minor', 5000,
            'occurred_on', '2026-10-04',
            'note', 'Far future timestamp test',
            'created_at', now(),
            'updated_at', now() + interval '10 days',
            'version', 1
          )
        )
      ))
    ) p
    cross join lateral (
      select updated_at from public.transactions where id = 't2222222-2222-2222-2222-222222222222'
    ) t
  $$,
  $$ values (true) $$,
  '6. sync_push clamps timestamps to at most now() + 5 minutes'
);

-- Test 7: accepted[].server_seq matches the stored row's server_seq
select results_eq(
  $$
    select (res->'accepted'->0->>'server_seq')::bigint = t.server_seq
    from (
      select public.sync_push(jsonb_build_array(
        jsonb_build_object(
          'table', 'transactions',
          'row', jsonb_build_object(
            'id', 't3333333-3333-3333-3333-333333333333',
            'account_id', 'a1111111-1111-1111-1111-111111111111',
            'category_id', 'c1111111-1111-1111-1111-111111111111',
            'type', 'expense',
            'amount_minor', 12000,
            'base_amount_minor', 12000,
            'occurred_on', '2026-10-04',
            'note', 'Server seq verification',
            'created_at', now(),
            'updated_at', now(),
            'version', 1
          )
        )
      )) as res
    ) p
    cross join lateral (
      select server_seq from public.transactions where id = 't3333333-3333-3333-3333-333333333333'
    ) t
  $$,
  $$ values (true) $$,
  '7. accepted[].server_seq accurately equals the stored row server_seq'
);

select * from finish();
rollback;

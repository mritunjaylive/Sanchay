-- ============================================================================
-- Sanchay: pgTAP sync_pull Pagination and Whitelist Tests
-- Real schema: type, amount_minor, base_amount_minor, valid account kinds, no currency on transactions
-- ============================================================================

begin;
select plan(7);

-- ── 1. Mock auth.users & auth.uid() ──────────────────────────────────────────
insert into auth.users (id, email)
values ('33333333-3333-3333-3333-333333333333', 'test_sync@sanchay.local')
on conflict (id) do nothing;

create or replace function auth.uid() returns uuid as $$
  select '33333333-3333-3333-3333-333333333333'::uuid;
$$ language sql stable;

-- ── 2. Setup account & category with real schema ────────────────────────────
insert into public.accounts (
  id, user_id, name, kind, currency, opening_balance_minor, opening_date, created_at, updated_at
)
values (
  'a3333333-3333-3333-3333-333333333333',
  '33333333-3333-3333-3333-333333333333',
  'Main Bank',
  'bank',
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
  'c3333333-3333-3333-3333-333333333333',
  '33333333-3333-3333-3333-333333333333',
  'General',
  'expense',
  'tag',
  '#10b981',
  now(),
  now()
) on conflict (id) do nothing;

-- ── 3. Whitelist enforcement tests ──────────────────────────────────────────
-- 1. Whitelist enforcement: pushing to non-whitelisted fx_rates raises exception
select throws_ok(
  $$
    select public.sync_push(jsonb_build_array(
      jsonb_build_object(
        'table', 'fx_rates',
        'row', jsonb_build_object('id', gen_random_uuid(), 'rate_per_usd', 1.0)
      )
    ))
  $$,
  'Table not allowed for sync: fx_rates',
  '1. sync_push rejects non-whitelisted fx_rates table'
);

-- 2. Whitelist enforcement: pulling from push_subscriptions raises exception
select throws_ok(
  $$
    select public.sync_pull(0, array['push_subscriptions'], 10)
  $$,
  'Table not allowed for sync: push_subscriptions',
  '2. sync_pull rejects non-whitelisted push_subscriptions'
);

-- 3. Whitelist enforcement: pulling from pg_class raises exception
select throws_ok(
  $$
    select public.sync_pull(0, array['pg_class'], 10)
  $$,
  'Table not allowed for sync: pg_class',
  '3. sync_pull rejects system catalog table pg_class'
);

-- ── 4. Seed 1,500 transactions in one burst ─────────────────────────────────
insert into public.transactions (
  id, user_id, type, account_id, amount_minor, base_amount_minor, category_id, occurred_on, created_at, updated_at
)
select
  gen_random_uuid(),
  '33333333-3333-3333-3333-333333333333',
  'expense',
  'a3333333-3333-3333-3333-333333333333',
  (1000 + i)::bigint,
  (1000 + i)::bigint,
  'c3333333-3333-3333-3333-333333333333',
  '2026-10-04'::date,
  now(),
  now()
from generate_series(1, 1500) as i;

-- Helper to loop pages of 500 until has_more is false
create or replace function public.test_sync_pull_burst()
returns table(
  page_count int,
  total_rows int,
  unique_rows int,
  every_row_once boolean
)
language plpgsql
as $$
declare
  v_cursor bigint := 0;
  v_has_more boolean := true;
  v_is_first boolean := true;
  v_res jsonb;
  v_pages int := 0;
  v_collected_ids text[] := array[]::text[];
  v_row jsonb;
begin
  while v_has_more loop
    v_res := public.sync_pull(
      p_cursor => v_cursor,
      p_tables => array['transactions'],
      p_page_size => 500,
      p_apply_overlap => v_is_first
    );
    v_pages := v_pages + 1;
    v_cursor := (v_res->>'next_cursor')::bigint;
    v_has_more := (v_res->>'has_more')::boolean;
    v_is_first := false;

    for v_row in select * from jsonb_array_elements(v_res->'rows') loop
      v_collected_ids := array_append(v_collected_ids, v_row->>'id');
    end loop;

    -- Safety breakout against infinite loop
    if v_pages > 10 then
      exit;
    end if;
  end loop;

  return query
  select
    v_pages,
    cardinality(v_collected_ids),
    (select count(distinct x)::int from unnest(v_collected_ids) as x),
    (cardinality(v_collected_ids) = 1500 and (select count(distinct x)::int from unnest(v_collected_ids) as x) = 1500);
end;
$$;

-- 4. Test burst pagination: 1500 rows returned across pages of 500, every row exactly once
select results_eq(
  $$ select total_rows, unique_rows, every_row_once from public.test_sync_pull_burst() $$,
  $$ values (1500, 1500, true) $$,
  '4. sync_pull seeds 1,500 transactions in one burst, loops pages of 500 until has_more is false, and returns every row exactly once'
);

-- 5. Guard test: aborts with clear error if has_more is true but cursor did not advance
-- Calling with cursor that forces same rows with limit 500 and p_apply_overlap = true
select throws_matching(
  $$
    select public.sync_pull(
      p_cursor => 500,
      p_tables => array['transactions'],
      p_page_size => 500,
      p_apply_overlap => true
    )
  $$,
  'cursor did not advance',
  '5. sync_pull aborts with clear error if has_more is true and cursor did not advance'
);

-- ── 5. reset_required check when cursor is older than purged_through_seq ───
insert into public.sync_purge_state (user_id, purged_through_seq, updated_at)
values ('33333333-3333-3333-3333-333333333333', 1000, now())
on conflict (user_id) do update set purged_through_seq = 1000;

select results_eq(
  $$
    select (res->>'reset_required')::boolean
    from (
      select public.sync_pull(500, array['transactions'], 10) as res
    ) sub
  $$,
  $$ values (true) $$,
  '6. sync_pull returns reset_required when cursor is older than purged_through_seq'
);

select results_eq(
  $$
    select (res ? 'reset_required') = false
    from (
      select public.sync_pull(1500, array['transactions'], 10) as res
    ) sub
  $$,
  $$ values (true) $$,
  '7. sync_pull does not return reset_required when cursor is past purged_through_seq'
);

select * from finish();
rollback;

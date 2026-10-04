-- ================================================================
-- Sanchay: Fix sync_pull pagination, sync_purge_state, purge_tombstones,
-- and table whitelisting
-- @see FIX_PROMPTS.md Prompt 4 and Prompt 5
-- ================================================================

-- ── 1. sync_purge_state table ────────────────────────────────────
create table if not exists public.sync_purge_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  purged_through_seq bigint not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.sync_purge_state enable row level security;

drop policy if exists "Users can read own sync_purge_state" on public.sync_purge_state;
create policy "Users can read own sync_purge_state"
  on public.sync_purge_state for select
  using (auth.uid() = user_id);

-- ── 2. purge_tombstones function ─────────────────────────────────
create or replace function public.purge_tombstones()
returns void
language plpgsql
security definer
as $$
declare
  v_cutoff timestamptz := now() - interval '90 days';
  v_tbl text;
  v_synced_tables text[] := array[
    'profiles', 'accounts', 'loan_terms', 'categories', 'tags',
    'recurring_rules', 'recurring_overrides', 'goals', 'goal_contributions',
    'transactions', 'transaction_tags', 'attachments', 'budgets',
    'saved_filters', 'notifications'
  ];
  v_user record;
  v_max_purged_seq bigint;
  v_seq bigint;
begin
  for v_user in select id from auth.users loop
    v_max_purged_seq := 0;

    foreach v_tbl in array v_synced_tables loop
      -- Find max server_seq of tombstones to be purged
      execute format(
        'select coalesce(max(server_seq), 0) from public.%I
         where user_id = $1 and deleted_at is not null and deleted_at < $2',
        v_tbl
      ) into v_seq using v_user.id, v_cutoff;

      if v_seq > v_max_purged_seq then
        v_max_purged_seq := v_seq;
      end if;

      -- Hard delete tombstones older than 90 days
      execute format(
        'delete from public.%I where user_id = $1 and deleted_at is not null and deleted_at < $2',
        v_tbl
      ) using v_user.id, v_cutoff;
    end loop;

    if v_max_purged_seq > 0 then
      insert into public.sync_purge_state (user_id, purged_through_seq, updated_at)
      values (v_user.id, v_max_purged_seq, now())
      on conflict (user_id) do update
        set purged_through_seq = greatest(public.sync_purge_state.purged_through_seq, excluded.purged_through_seq),
            updated_at = now();
    end if;
  end loop;
end;
$$;

-- Schedule nightly purge if pg_cron extension is available
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('purge-tombstones-nightly', '0 3 * * *', 'select public.purge_tombstones();');
  end if;
end;
$$;

-- ── 3. Replacement sync_pull function ────────────────────────────
-- Supports named arguments: p_cursor, p_tables, p_page_size
-- Also retains cursor, tables, page_size aliases if called positionally
create or replace function public.sync_pull(
  p_cursor bigint,
  p_tables text[],
  p_page_size int default 500,
  p_apply_overlap boolean default false
)
returns jsonb
language plpgsql
security invoker
as $$
declare
  v_user_id uuid := auth.uid();
  v_query_cursor bigint := case when p_apply_overlap then greatest(0, p_cursor - 1000) else p_cursor end;
  v_purged_seq bigint;
  v_allowed_tables text[] := array[
    'profiles', 'accounts', 'loan_terms', 'categories', 'tags',
    'recurring_rules', 'recurring_overrides', 'goals', 'goal_contributions',
    'transactions', 'transaction_tags', 'attachments', 'budgets',
    'saved_filters', 'notifications'
  ];
  v_table text;
  v_union_parts text[] := array[]::text[];
  v_full_query text;
  v_rows jsonb := '[]'::jsonb;
  v_next_cursor bigint := p_cursor;
  v_has_more boolean := false;
  v_count int := 0;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- 1. Table whitelist validation
  if p_tables is null or array_length(p_tables, 1) = 0 then
    raise exception 'No tables specified for sync_pull';
  end if;

  foreach v_table in array p_tables loop
    if not (v_table = any(v_allowed_tables)) then
      raise exception 'Table not allowed for sync: %', v_table;
    end if;
  end loop;

  -- 2. Check sync_purge_state for reset_required
  if p_cursor > 0 then
    select purged_through_seq into v_purged_seq
    from public.sync_purge_state
    where user_id = v_user_id;

    if v_purged_seq is not null and p_cursor < v_purged_seq then
      return jsonb_build_object(
        'reset_required', true,
        'rows', '[]'::jsonb,
        'next_cursor', p_cursor,
        'has_more', false
      );
    end if;
  end if;

  -- 3. Construct single ordered UNION ALL subquery
  foreach v_table in array p_tables loop
    v_union_parts := v_union_parts || format(
      'select %L as tbl, server_seq, row_to_json(t)::jsonb as r from public.%I t where user_id = $1 and server_seq > $2',
      v_table, v_table
    );
  end loop;

  v_full_query := format(
    'select coalesce(jsonb_agg(r order by server_seq asc), ''[]''::jsonb),
            coalesce(max(server_seq), $3),
            count(*)
     from (
       %s
       order by server_seq asc
       limit $4
     ) sub',
    array_to_string(v_union_parts, ' union all ')
  );

  execute v_full_query
  into v_rows, v_next_cursor, v_count
  using v_user_id, v_query_cursor, p_cursor, p_page_size;

  v_has_more := (v_count = p_page_size);

  -- Guard: abort with clear error if has_more is true but cursor did not advance
  if v_has_more and v_next_cursor <= p_cursor then
    raise exception 'sync_pull aborted: has_more is true but cursor did not advance (cursor: %, next_cursor: %)', p_cursor, v_next_cursor;
  end if;

  return jsonb_build_object(
    'rows', coalesce(v_rows, '[]'::jsonb),
    'next_cursor', v_next_cursor,
    'has_more', v_has_more
  );
end;
$$;

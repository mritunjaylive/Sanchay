-- ================================================================
-- Migration: Secure purge_tombstones and update sync_pull
-- @see Issue (1) and Issue (3)
-- ================================================================

-- ── 1. Secure purge_tombstones ──────────────────────────────────
-- Set search_path = public, pg_temp and revoke execute from public, anon, authenticated
alter function public.purge_tombstones() set search_path = public, pg_temp;

revoke execute on function public.purge_tombstones() from public;
revoke execute on function public.purge_tombstones() from anon;
revoke execute on function public.purge_tombstones() from authenticated;

-- ── 2. Update sync_pull ─────────────────────────────────────────
-- Supports p_apply_overlap (applied only on first pull request of sync run)
-- and adds guard against infinite loop if has_more is true but cursor did not advance.
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

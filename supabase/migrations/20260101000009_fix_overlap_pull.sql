-- ================================================================
-- Sanchay: Fix sync_pull overlap cursor bug
-- 
-- The previous sync_pull implementation caused a 500 Internal Server Error
-- when p_apply_overlap was true AND there were more than p_page_size rows
-- in the overlap window. This was because the query was limited to p_page_size,
-- meaning it only returned rows from the overlap window (e.g. server_seq < p_cursor),
-- so the max(server_seq) never advanced past p_cursor, tripping the infinite loop guard.
-- 
-- The fix increases the query limit by the overlap window size (1000) when
-- p_apply_overlap is true, guaranteeing it can fetch through the entire overlap
-- window and reach the new rows, allowing the cursor to advance safely.
-- ================================================================

create or replace function public.sync_pull(
  p_cursor bigint,
  p_tables text[],
  p_page_size int default 500,
  p_apply_overlap boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_overlap_window bigint := 1000;
  v_query_cursor bigint := case when p_apply_overlap then greatest(0, p_cursor - v_overlap_window) else p_cursor end;
  -- Increase the limit so we can pull the entire overlap window PLUS the requested page size
  v_actual_limit int := case when p_apply_overlap then p_page_size + v_overlap_window::int else p_page_size end;
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

  if p_tables is null or array_length(p_tables, 1) = 0 then
    raise exception 'No tables specified for sync_pull';
  end if;

  foreach v_table in array p_tables loop
    if not (v_table = any(v_allowed_tables)) then
      raise exception 'Table not allowed for sync: %', v_table;
    end if;
  end loop;

  select purged_through_seq into v_purged_seq
  from public.sync_purge_state
  where user_id = v_user_id;

  if p_cursor > 0 and v_purged_seq is not null and p_cursor < v_purged_seq then
    return jsonb_build_object(
      'reset_required', true,
      'rows', '[]'::jsonb,
      'next_cursor', p_cursor,
      'has_more', false
    );
  end if;

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
  using v_user_id, v_query_cursor, p_cursor, v_actual_limit;

  v_has_more := (v_count = v_actual_limit);

  -- The cursor never moves backwards (the overlap window may only return older rows).
  v_next_cursor := greatest(v_next_cursor, p_cursor);

  -- After a complete pull every row > cursor has been returned, so the cursor may safely jump
  -- to the purge watermark. Otherwise tables whose newest row is older than the watermark would
  -- receive `reset_required` on every sync.
  if not v_has_more and v_purged_seq is not null then
    v_next_cursor := greatest(v_next_cursor, v_purged_seq);
  end if;

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

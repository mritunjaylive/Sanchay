-- ================================================================
-- Sanchay: sync contract, purge and constraint fixes
--
--  1. sync_push now returns `id` (and `server_row` for LWW rejections) for every
--     rejected change so the client can quarantine / resolve it. Previously the
--     client received `{table,row}` only, so rejected rows were retried forever.
--  2. sync_push: invalid ids no longer abort the entire batch, and INSERT/UPDATE
--     only touch columns present in the incoming row (defaults are preserved,
--     partial snapshots no longer NULL-out columns).
--  3. sync_pull: cursor never moves backwards and, after a complete pull, is
--     advanced to the purge watermark so sparse tables do not trigger a
--     `reset_required` loop on every sync.
--  4. purge_tombstones: deletes children before parents, never aborts on a FK
--     violation (rows that are still referenced are kept) and only records
--     rows it really deleted in sync_purge_state.
--  5. Soft-delete friendly uniqueness for tags on transactions, notifications
--     and recurring overrides (tombstones no longer block re-creation).
--  6. accounts.icon / goals.icon accept Lucide icon names (<= 40 chars).
-- ================================================================

-- ── 1/2. sync_push ───────────────────────────────────────────────
create or replace function public.sync_push(changes jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_change jsonb;
  v_table text;
  v_row jsonb;
  v_existing jsonb;
  v_now timestamptz := now();
  v_clamp_limit timestamptz := v_now + interval '5 minutes';
  accepted jsonb := '[]'::jsonb;
  rejected jsonb := '[]'::jsonb;
  v_id uuid;
  v_id_text text;
  v_incoming_updated_at timestamptz;
  v_existing_updated_at timestamptz;
  v_existing_version int;
  v_set_clause text;
  v_col_list text;
  v_ret_server_seq bigint;
  v_ret_version int;
  v_allowed_tables text[] := array[
    'profiles', 'accounts', 'loan_terms', 'categories', 'tags',
    'recurring_rules', 'recurring_overrides', 'goals', 'goal_contributions',
    'transactions', 'transaction_tags', 'attachments', 'budgets',
    'saved_filters', 'notifications'
  ];
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Validate input size (max 500 changes per call)
  if jsonb_array_length(changes) > 500 then
    raise exception 'Too many changes (max 500 per call)' using errcode = '54000';
  end if;

  -- Per-user advisory lock to serialize pushes from multiple devices
  perform pg_advisory_xact_lock(hashtext(v_user_id::text));

  for v_change in select * from jsonb_array_elements(changes)
  loop
    v_table := v_change->>'table';
    v_row := v_change->'row';
    v_id_text := v_row->>'id';
    v_id := null;

    begin
      -- Table whitelist check
      if not (v_table = any(v_allowed_tables)) then
        raise exception 'Table not allowed for sync: %', v_table;
      end if;

      -- Cast inside the protected block: a malformed id rejects only this row.
      v_id := v_id_text::uuid;

      -- Clamp timestamps to at most now() + 5 minutes
      v_incoming_updated_at := least(
        (v_row->>'updated_at')::timestamptz,
        v_clamp_limit
      );

      v_row := jsonb_set(v_row, '{updated_at}', to_jsonb(v_incoming_updated_at));

      if v_row ? 'created_at' then
        v_row := jsonb_set(v_row, '{created_at}',
          to_jsonb(least((v_row->>'created_at')::timestamptz, v_clamp_limit)));
      end if;

      -- Enforce user_id
      v_row := jsonb_set(v_row, '{user_id}', to_jsonb(v_user_id));

      -- Get existing row's updated_at and version
      execute format(
        'select updated_at, version from public.%I where id = $1 and user_id = $2',
        v_table
      ) into v_existing_updated_at, v_existing_version
      using v_id, v_user_id;

      if v_existing_updated_at is null then
        -- New row: only insert the columns the client sent so column defaults still apply.
        select string_agg(format('%I', column_name), ', ' order by ordinal_position)
        into v_col_list
        from information_schema.columns
        where table_schema = 'public'
          and table_name = v_table
          and v_row ? column_name;

        execute format(
          'insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1)
           returning server_seq, version',
          v_table, v_col_list, v_col_list, v_table
        ) into v_ret_server_seq, v_ret_version
        using v_row;

        accepted := accepted || jsonb_build_object(
          'table', v_table,
          'id', v_id,
          'version', v_ret_version,
          'server_seq', v_ret_server_seq
        );
      else
        -- Existing row: LWW check with tie-break
        if v_incoming_updated_at > v_existing_updated_at
           or (v_incoming_updated_at = v_existing_updated_at
               and coalesce((v_row->>'version')::int, 0) > v_existing_version) then

          -- Only update mutable columns that are present in the incoming row.
          select string_agg(format('%I = r.%I', column_name, column_name), ', ')
          into v_set_clause
          from information_schema.columns
          where table_schema = 'public'
            and table_name = v_table
            and column_name not in ('id', 'user_id', 'created_at', 'server_seq', 'version')
            and v_row ? column_name;

          execute format(
            'update public.%I as t set %s
             from jsonb_populate_record(null::public.%I, $1) as r
             where t.id = $2 and t.user_id = $3
             returning t.server_seq, t.version',
            v_table, v_set_clause, v_table
          ) into v_ret_server_seq, v_ret_version
          using v_row, v_id, v_user_id;

          accepted := accepted || jsonb_build_object(
            'table', v_table,
            'id', v_id,
            'version', v_ret_version,
            'server_seq', v_ret_server_seq
          );
        else
          -- LWW reject: return the server's current row so the client can adopt it.
          execute format(
            'select row_to_json(t)::jsonb from public.%I t where id = $1 and user_id = $2',
            v_table
          ) into v_existing
          using v_id, v_user_id;

          rejected := rejected || jsonb_build_object(
            'table', v_table,
            'id', v_id,
            'row', v_existing,
            'server_row', v_existing
          );
        end if;
      end if;

    exception when others then
      -- Reject only this row; `id` lets the client attribute and quarantine the error.
      rejected := rejected || jsonb_build_object(
        'table', v_table,
        'id', v_id_text,
        'row', v_row,
        'error', SQLERRM
      );
    end;
  end loop;

  return jsonb_build_object('accepted', accepted, 'rejected', rejected);
end;
$$;

-- ── 3. sync_pull ─────────────────────────────────────────────────
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

-- ── 4. purge_tombstones ──────────────────────────────────────────
create or replace function public.purge_tombstones()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cutoff timestamptz := now() - interval '90 days';
  v_tbl text;
  -- Children first, parents last, so FK references from tombstoned children are gone
  -- before the tombstoned parent is deleted.
  v_synced_tables text[] := array[
    'transaction_tags', 'attachments', 'goal_contributions', 'recurring_overrides',
    'notifications', 'saved_filters', 'budgets', 'transactions', 'loan_terms',
    'goals', 'recurring_rules', 'tags', 'categories', 'accounts', 'profiles'
  ];
  v_user record;
  v_max_purged_seq bigint;
  v_seq bigint;
  v_row_id uuid;
begin
  for v_user in select id from auth.users loop
    begin
      v_max_purged_seq := 0;

      foreach v_tbl in array v_synced_tables loop
        begin
          -- Fast path: delete all expired tombstones of this table in one statement.
          execute format(
            'with d as (
               delete from public.%I
               where user_id = $1 and deleted_at is not null and deleted_at < $2
               returning server_seq
             ) select coalesce(max(server_seq), 0) from d',
            v_tbl
          ) into v_seq using v_user.id, v_cutoff;

          if v_seq > v_max_purged_seq then
            v_max_purged_seq := v_seq;
          end if;
        exception when foreign_key_violation then
          -- Some tombstones are still referenced: delete row by row and keep those.
          for v_row_id in
            execute format(
              'select id from public.%I where user_id = $1 and deleted_at is not null and deleted_at < $2',
              v_tbl
            ) using v_user.id, v_cutoff
          loop
            begin
              execute format(
                'delete from public.%I where id = $1 returning server_seq',
                v_tbl
              ) into v_seq using v_row_id;

              if v_seq is not null and v_seq > v_max_purged_seq then
                v_max_purged_seq := v_seq;
              end if;
            exception when foreign_key_violation then
              null; -- still referenced; retry on a later run
            end;
          end loop;
        end;
      end loop;

      if v_max_purged_seq > 0 then
        insert into public.sync_purge_state (user_id, purged_through_seq, updated_at)
        values (v_user.id, v_max_purged_seq, now())
        on conflict (user_id) do update
          set purged_through_seq = greatest(public.sync_purge_state.purged_through_seq, excluded.purged_through_seq),
              updated_at = now();
      end if;
    exception when others then
      -- One user's failure must never abort the purge for everybody else.
      raise warning 'purge_tombstones failed for user %: %', v_user.id, SQLERRM;
    end;
  end loop;
end;
$$;

revoke execute on function public.purge_tombstones() from public, anon, authenticated;
revoke execute on function public.sync_push(jsonb) from public, anon;
revoke execute on function public.sync_pull(bigint, text[], integer, boolean) from public, anon;
grant  execute on function public.sync_push(jsonb) to authenticated;
grant  execute on function public.sync_pull(bigint, text[], integer, boolean) to authenticated;

-- ── 5. Uniqueness that ignores tombstones ────────────────────────
alter table public.transaction_tags
  drop constraint if exists transaction_tags_user_id_transaction_id_tag_id_key;
create unique index if not exists transaction_tags_live_uniq
  on public.transaction_tags (user_id, transaction_id, tag_id)
  where deleted_at is null;

alter table public.notifications
  drop constraint if exists notifications_user_id_dedupe_key_key;
create unique index if not exists notifications_live_dedupe_uniq
  on public.notifications (user_id, dedupe_key)
  where deleted_at is null;

alter table public.recurring_overrides
  drop constraint if exists recurring_overrides_user_id_rule_id_occurrence_date_key;
create unique index if not exists recurring_overrides_live_uniq
  on public.recurring_overrides (user_id, rule_id, occurrence_date)
  where deleted_at is null;

-- ── 6. Icon length ───────────────────────────────────────────────
alter table public.accounts drop constraint if exists accounts_icon_check;
alter table public.accounts add  constraint accounts_icon_check
  check (icon is null or length(icon) <= 40);

alter table public.goals drop constraint if exists goals_icon_check;
alter table public.goals add  constraint goals_icon_check
  check (icon is null or length(icon) <= 40);

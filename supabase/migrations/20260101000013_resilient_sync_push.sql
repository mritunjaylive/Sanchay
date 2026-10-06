-- Sanchay: resilient sync_push (supersedes 010; fixes regressions from 010 vs 008)
--
--  * Restores migration-008 behaviour that 010 accidentally dropped:
--      - LWW rejections carry `server_row` (client adopts the server row instead of
--        retrying the same stale change 3x and quarantining it as 'failed').
--      - `coalesce(version, 0)` on the tie-break comparison.
--  * Keeps 010's pg_attribute column cache (no information_schema).
--  * NEVER hangs on the per-user advisory lock. Previously a single stuck/long
--    transaction for a user made every later push for that user wait until the
--    gateway gave up (browser shows 520 + a fake CORS error, app shows "offline").
--    Now we wait at most ~4s and then fail fast with a readable `sync_busy` error.
--  * Hard-caps work per call (<= 100 changes) so a call stays far below gateway limits.
--
-- Safe to run more than once.

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
  v_col_list text;
  v_set_clause text;
  v_ret_server_seq bigint;
  v_ret_version int;
  v_table_columns jsonb;
  v_lock_key bigint := hashtextextended('sanchay_sync_push:' || coalesce(auth.uid()::text, ''), 0);
  v_lock_tries int := 0;
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

  if jsonb_array_length(changes) > 100 then
    raise exception 'Too many changes (max 100 per call)' using errcode = '54000';
  end if;

  -- Cache table schemas once using pg_attribute for blistering speed
  select jsonb_object_agg(t.table_name, t.columns)
  into v_table_columns
  from (
    select c.relname as table_name, jsonb_agg(a.attname) as columns
    from pg_class c
    join pg_attribute a on a.attrelid = c.oid
    where c.relnamespace = 'public'::regnamespace
      and a.attnum > 0
      and not a.attisdropped
      and c.relname = any(v_allowed_tables)
    group by c.relname
  ) t;

  -- Bounded wait for the per-user lock (serialises pushes from several devices/tabs).
  -- A blocking pg_advisory_xact_lock() here is what turned one stuck transaction into
  -- an endless stream of hung requests.
  while not pg_try_advisory_xact_lock(v_lock_key) loop
    v_lock_tries := v_lock_tries + 1;
    if v_lock_tries > 16 then
      raise exception 'sync_busy: another sync for this account is still running; retry shortly'
        using errcode = '55P03';
    end if;
    perform pg_sleep(0.25);
  end loop;

  for v_change in select * from jsonb_array_elements(changes)
  loop
    v_table := v_change->>'table';
    v_row := v_change->'row';
    v_id_text := v_row->>'id';
    v_id := null;

    begin
      if v_table is null or not (v_table = any(v_allowed_tables)) then
        raise exception 'Table not allowed for sync: %', v_table;
      end if;

      if v_id_text is null then
        raise exception 'Missing id in row for table %', v_table;
      end if;

      v_id := v_id_text::uuid;

      v_incoming_updated_at := least(
        (v_row->>'updated_at')::timestamptz,
        v_clamp_limit
      );

      v_row := jsonb_set(v_row, '{updated_at}', to_jsonb(v_incoming_updated_at));

      if v_row ? 'created_at' then
        v_row := jsonb_set(v_row, '{created_at}',
          to_jsonb(least((v_row->>'created_at')::timestamptz, v_clamp_limit)));
      end if;

      v_row := jsonb_set(v_row, '{user_id}', to_jsonb(v_user_id));

      execute format(
        'select updated_at, version from public.%I where id = $1 and user_id = $2',
        v_table
      ) into v_existing_updated_at, v_existing_version
      using v_id, v_user_id;

      if v_existing_updated_at is null then
        v_col_list := (
          select string_agg(format('%I', value), ', ')
          from jsonb_array_elements_text(v_table_columns->v_table)
          where v_row ? value
        );

        execute format(
          'insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1)
           returning server_seq, version',
          v_table, v_col_list, v_col_list, v_table
        ) into v_ret_server_seq, v_ret_version
        using v_row;

        accepted := accepted || jsonb_build_object(
          'table', v_table,
          'id', v_id_text,
          'server_seq', v_ret_server_seq,
          'version', v_ret_version
        );
      else
        if v_incoming_updated_at > v_existing_updated_at
           or (v_incoming_updated_at = v_existing_updated_at
               and coalesce((v_row->>'version')::int, 0) > v_existing_version) then

          v_set_clause := (
            select string_agg(format('%I = r.%I', value, value), ', ')
            from jsonb_array_elements_text(v_table_columns->v_table)
            where value not in ('id', 'user_id', 'created_at', 'server_seq', 'version')
              and v_row ? value
          );

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
            'id', v_id_text,
            'server_seq', v_ret_server_seq,
            'version', v_ret_version
          );
        else
          -- LWW reject: hand back the server's current row so the client can adopt it.
          execute format(
            'select row_to_json(t)::jsonb from public.%I t where id = $1 and user_id = $2',
            v_table
          ) into v_existing using v_id, v_user_id;

          rejected := rejected || jsonb_build_object(
            'table', v_table,
            'id', v_id_text,
            'row', v_existing,
            'server_row', v_existing
          );
        end if;
      end if;

    exception when others then
      rejected := rejected || jsonb_build_object(
        'table', v_table,
        'id', v_id_text,
        'row', v_row,
        'error', sqlerrm
      );
    end;
  end loop;

  return jsonb_build_object(
    'accepted', accepted,
    'rejected', rejected
  );
end;
$$;

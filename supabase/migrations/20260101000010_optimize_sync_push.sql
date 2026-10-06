-- Sanchay: Optimize sync_push by caching column schema
-- Fixes Cloudflare 520 / 524 timeouts caused by querying information_schema in a loop.

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

  -- Cache table schemas once to avoid querying information_schema in the loop
  select jsonb_object_agg(t.table_name, t.columns)
  into v_table_columns
  from (
    select table_name, jsonb_agg(column_name) as columns
    from information_schema.columns
    where table_schema = 'public'
      and table_name = any(v_allowed_tables)
    group by table_name
  ) t;

  -- Per-user advisory lock to serialize pushes from multiple devices
  perform pg_advisory_xact_lock(hashtext(v_user_id::text));

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
        -- New row: compute allowed columns efficiently from cache
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
        -- Existing row: LWW check (Last-Writer-Wins)
        if v_incoming_updated_at > v_existing_updated_at
           or (v_incoming_updated_at = v_existing_updated_at
               and (v_row->>'version')::int > v_existing_version) then

          -- Dynamically build SET clause efficiently from cache
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
          -- Rejected due to conflict (older version)
          rejected := rejected || jsonb_build_object(
            'table', v_table,
            'id', v_id_text,
            'row', v_row,
            'error', 'Conflict: incoming row is older or same version'
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

  return jsonb_build_object(
    'accepted', accepted,
    'rejected', rejected
  );
end;
$$;

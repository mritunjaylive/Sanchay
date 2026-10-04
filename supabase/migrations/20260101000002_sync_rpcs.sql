-- ================================================================
-- Sanchay: sync_push and sync_pull RPCs
-- @see Sanchay_spec.md section 9.3, 9.4
-- ================================================================

-- ── sync_push ─────────────────────────────────────────────────────
-- Accepts batches of rows from the client, applies LWW merge.
-- Returns: {accepted: [...], rejected: [...]}
-- Max 500 rows per call; batches in dependency order.
-- Clamp updated_at/created_at to at most now() + 5 minutes.
-- Advisory lock per user to serialize concurrent pushes.
create or replace function public.sync_push(changes jsonb)
returns jsonb
language plpgsql
security invoker  -- RLS applies, client is authenticated user
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
  v_incoming_updated_at timestamptz;
  v_existing_updated_at timestamptz;
  v_existing_version int;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Validate input size
  if jsonb_array_length(changes) > 500 then
    raise exception 'Too many changes (max 500 per call)' using errcode = '54000';
  end if;

  -- Per-user advisory lock to serialize pushes from multiple devices
  perform pg_advisory_xact_lock(hashtext(v_user_id::text));

  for v_change in select * from jsonb_array_elements(changes)
  loop
    v_table := v_change->>'table';
    v_row := v_change->'row';
    v_id := (v_row->>'id')::uuid;

    -- Clamp timestamps
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

    begin
      -- Get existing row's updated_at and version
      execute format(
        'select updated_at, version from public.%I where id = $1 and user_id = $2',
        v_table
      ) into v_existing_updated_at, v_existing_version
      using v_id, v_user_id;

      if v_existing_updated_at is null then
        -- New row: insert
        execute format(
          'insert into public.%I select * from jsonb_populate_record(null::public.%I, $1)
           on conflict (id) do nothing',
          v_table, v_table
        ) using v_row;

        accepted := accepted || jsonb_build_object(
          'table', v_table,
          'id', v_id,
          'version', 1,
          'server_seq', currval('public.sync_seq')
        );
      else
        -- Existing row: LWW check
        if v_incoming_updated_at > v_existing_updated_at
           or (v_incoming_updated_at = v_existing_updated_at
               and (v_row->>'version')::int > v_existing_version) then
          -- Accept: overwrite
          execute format(
            'update public.%I set updated_at = ($1->>''updated_at'')::timestamptz
             from jsonb_populate_record(null::public.%I, $1) as r
             where public.%I.id = r.id and public.%I.user_id = $2',
            v_table, v_table, v_table, v_table
          ) using v_row, v_user_id;

          -- Full upsert
          execute format(
            'insert into public.%I select * from jsonb_populate_record(null::public.%I, $1)
             on conflict (id) do update set updated_at = excluded.updated_at',
            v_table, v_table
          ) using v_row;

          accepted := accepted || jsonb_build_object(
            'table', v_table,
            'id', v_id,
            'version', v_existing_version + 1,
            'server_seq', currval('public.sync_seq')
          );
        else
          -- Reject: return server's current row
          execute format(
            'select row_to_json(t) from public.%I t where id = $1 and user_id = $2',
            v_table
          ) into v_existing
          using v_id, v_user_id;

          rejected := rejected || jsonb_build_object(
            'table', v_table,
            'row', v_existing
          );
        end if;
      end if;
    exception when others then
      -- If we can't process a row, reject it
      rejected := rejected || jsonb_build_object(
        'table', v_table,
        'row', v_row,
        'error', SQLERRM
      );
    end;
  end loop;

  return jsonb_build_object('accepted', accepted, 'rejected', rejected);
end;
$$;

-- ── sync_pull ─────────────────────────────────────────────────────
-- Returns rows with server_seq > cursor - 1000 (overlap window).
-- If cursor is older than tombstone horizon (90 days), returns reset_required.
create or replace function public.sync_pull(
  cursor bigint,
  tables text[],
  page_size int default 500
)
returns jsonb
language plpgsql
security invoker
as $$
declare
  v_user_id uuid := auth.uid();
  v_overlap_cursor bigint := greatest(0, cursor - 1000);
  v_purge_horizon timestamptz := now() - interval '90 days';
  v_min_server_seq bigint;
  v_rows jsonb := '[]'::jsonb;
  v_next_cursor bigint := cursor;
  v_has_more boolean := false;
  v_table text;
  v_table_rows jsonb;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Check if the cursor is too old (reset required)
  if cursor > 0 then
    select min(server_seq) into v_min_server_seq
    from public.transactions
    where user_id = v_user_id
      and deleted_at is not null
      and deleted_at < v_purge_horizon;

    if v_min_server_seq is not null and cursor < v_min_server_seq then
      return jsonb_build_object('reset_required', true);
    end if;
  end if;

  -- Pull from each requested table
  foreach v_table in array tables
  loop
    execute format(
      'select coalesce(jsonb_agg(row_to_json(t) order by server_seq), ''[]''::jsonb)
       from public.%I t
       where user_id = $1 and server_seq > $2
       limit $3',
      v_table
    ) into v_table_rows
    using v_user_id, v_overlap_cursor, page_size;

    v_rows := v_rows || coalesce(v_table_rows, '[]'::jsonb);
  end loop;

  -- Determine next cursor (max server_seq seen)
  select coalesce(max((row_->>'server_seq')::bigint), cursor)
  into v_next_cursor
  from jsonb_array_elements(v_rows) as row_;

  v_has_more := jsonb_array_length(v_rows) >= page_size;

  return jsonb_build_object(
    'rows', v_rows,
    'next_cursor', v_next_cursor,
    'has_more', v_has_more
  );
end;
$$;

-- ── Storage: receipts bucket ──────────────────────────────────────
-- Create via Supabase dashboard or CLI; policies below assume bucket exists.

-- Allow read/write/delete only where first path segment = user's uid
-- (set via Supabase Storage API policies):
-- insert: bucket_id = 'receipts' AND (storage.foldername(name))[1] = auth.uid()::text
-- select: bucket_id = 'receipts' AND (storage.foldername(name))[1] = auth.uid()::text
-- delete: bucket_id = 'receipts' AND (storage.foldername(name))[1] = auth.uid()::text

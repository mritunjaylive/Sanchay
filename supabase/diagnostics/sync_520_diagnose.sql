-- ================================================================
-- Sanchay: sync 520 diagnostics. READ-ONLY (except the commented-out kill at the end).
-- Paste into Supabase Dashboard -> SQL Editor and run each block (or all at once).
-- ================================================================

-- 1) WHICH sync_push IS ACTUALLY LIVE?  (hypothesis: migration 010 never reached the live DB)
--    Expect after 013:  has_pg_attribute = true, has_try_lock = true, has_server_row = true
--    (the sync_pull row legitimately shows false in every column except still_uses_information_schema)
select
  p.oid::regprocedure                              as fn,
  p.prosrc like '%pg_attribute%'                   as has_pg_attribute,   -- true from 010 on
  p.prosrc like '%information_schema%'             as still_uses_information_schema, -- must be false
  p.prosrc like '%pg_try_advisory_xact_lock%'      as has_try_lock,       -- true from 013 on
  p.prosrc like '%server_row%'                     as has_server_row      -- true from 013 on
from pg_proc p
where p.pronamespace = 'public'::regnamespace and p.proname in ('sync_push','sync_pull');

-- 2) WHO HOLDS / WAITS ON SYNC ADVISORY LOCKS?  (hypothesis: a zombie transaction blocks this user)
select
  l.pid, l.granted,
  a.usename, a.state, a.wait_event_type, a.wait_event,
  now() - a.xact_start   as xact_age,
  now() - a.query_start  as query_age,
  left(a.query, 120)     as query
from pg_locks l
join pg_stat_activity a on a.pid = l.pid
where l.locktype = 'advisory'
order by l.granted desc, a.xact_start;

-- 3) LONG-RUNNING OR "IDLE IN TRANSACTION" SESSIONS (user-facing roles only)
select pid, usename, application_name, state, wait_event_type, wait_event,
       now() - xact_start as xact_age, now() - state_change as in_state_for,
       left(query, 120) as query
from pg_stat_activity
where datname = current_database()
  and pid <> pg_backend_pid()
  and usename in ('authenticator','authenticated','anon','postgres')
  and (state = 'idle in transaction' or now() - query_start > interval '5 seconds')
order by xact_start nulls last;

-- 4) STATEMENT TIMEOUTS the API roles run with (Supabase default: authenticated = 8s)
select rolname, rolconfig from pg_roles
where rolname in ('anon','authenticated','authenticator','service_role');

-- 5) IS REALTIME PUBLISHING THE SYNCED TABLES?  (hypothesis: broadcast overhead)
select pubname, schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime' and schemaname = 'public';

-- 6) NON-INTERNAL TRIGGERS ON SYNCED TABLES (expect only set_*_server_seq)
select event_object_table as tbl, trigger_name, action_timing, event_manipulation
from information_schema.triggers
where trigger_schema = 'public'
  and trigger_name not like 'set\_%\_server\_seq'
order by 1, 2;

-- 7) ROW COUNTS PER TABLE  (a backlog or an import can be large; replace the uuid first)
--    select auth.users.id from auth.users to find yours.
with u as (select '00000000-0000-0000-0000-000000000000'::uuid as id)  -- <-- PUT YOUR USER ID HERE
select 'transactions' t, count(*) from public.transactions, u where user_id = u.id union all
select 'accounts',        count(*) from public.accounts,     u where user_id = u.id union all
select 'categories',      count(*) from public.categories,   u where user_id = u.id union all
select 'attachments',     count(*) from public.attachments,  u where user_id = u.id union all
select 'transaction_tags',count(*) from public.transaction_tags, u where user_id = u.id;

-- 8) THE ACTUAL ERROR. Dashboard -> Logs -> Postgres Logs / API Edge Logs, filter the
--    time of a failed sync. A real timeout shows "canceling statement due to statement timeout";
--    pool exhaustion shows PGRST003 ("Timed out acquiring connection from connection pool").

-- 9) ONLY IF step 2 shows a GRANTED advisory lock owned by a stale session:
--    terminate THAT pid only. Never terminate "all active" sessions.
-- select pg_terminate_backend(<pid from step 2>);

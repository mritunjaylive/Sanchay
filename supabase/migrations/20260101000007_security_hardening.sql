-- ================================================================
-- Migration 000007: Security hardening (Supabase Security Advisor)
-- ================================================================

-- 1. Remove the stale 3-argument sync_pull overload left behind when
--    migration 000006 added p_apply_overlap (a new signature creates a
--    second function; "create or replace" does not replace the old one).
drop function if exists public.sync_pull(bigint, text[], integer);

-- 2. Pin search_path on every function the linter flagged.
alter function public.set_server_seq()                              set search_path = public, pg_temp;
alter function public.sync_push(jsonb)                              set search_path = public, pg_temp;
alter function public.sync_pull(bigint, text[], integer, boolean)   set search_path = public, pg_temp;
alter function public.check_attachment_quota(bigint)                set search_path = public, pg_temp;

-- 3. set_server_seq() is a trigger function. Triggers fire without the
--    caller needing EXECUTE, so nobody should be able to call it over /rpc.
revoke execute on function public.set_server_seq() from public, anon, authenticated;

-- 4. Sync + quota RPCs: signed-in users only (RLS still applies on top).
revoke execute on function public.sync_push(jsonb)                            from public, anon;
revoke execute on function public.sync_pull(bigint, text[], integer, boolean) from public, anon;
revoke execute on function public.check_attachment_quota(bigint)              from public, anon;
grant  execute on function public.sync_push(jsonb)                            to authenticated;
grant  execute on function public.sync_pull(bigint, text[], integer, boolean) to authenticated;
grant  execute on function public.check_attachment_quota(bigint)              to authenticated;

-- 5. rls_auto_enable() is created by Supabase's "Enable automatic RLS"
--    option (hosted projects only). It is an event-trigger function and
--    should not be callable through the API.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end
$$;

-- 6. Category icon names. The app's default categories use Lucide icon
--    names such as 'ShoppingCart' (12), 'GraduationCap' (13) and
--    'CircleEllipsis' (14), but the original check allowed only 10
--    characters, so the server would reject those rows during sync.
alter table public.categories drop constraint if exists categories_icon_check;
alter table public.categories add  constraint categories_icon_check
  check (icon is null or length(icon) <= 40);

-- Intentionally empty.
-- The previous contents ran pg_terminate_backend() on EVERY active or idle-in-transaction
-- connection (operator-precedence bug: `a and b or c`), which kills Supabase's own
-- PostgREST/Auth/Realtime connections and must never live in a migration.
-- Use supabase/diagnostics/sync_520_diagnose.sql instead; it only terminates the
-- specific sessions that hold the user's sync lock, and only when you uncomment it.
select 1;

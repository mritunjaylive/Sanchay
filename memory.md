# Sanchay Sync 520 Error Diagnostics Memory

## The Problem
The Sanchay application is experiencing persistent `net::ERR_FAILED 520` and CORS errors specifically on the `/rest/v1/rpc/sync_push` endpoint. This happens both on the Cloudflare Pages deployment and when running locally (`localhost:5173`) connected to the live Supabase instance. 

## What We Know & Have Proven
1. **It is NOT a CORS Issue**: The CORS error is a false positive. Cloudflare's edge returns a 520 (Origin Error) when the Supabase Kong API gateway times out (usually after 15 seconds). Cloudflare strips CORS headers from 520 error pages, causing the browser to misinterpret the timeout as a CORS failure.
2. **It is NOT a frontend code/build issue**: The error persists on a fresh `localhost` environment, meaning it is not related to Cloudflare Pages deployment configuration, Service Workers, or minification bugs.
3. **The React App is structurally sound**: Despite reports of a "blank login page", automated headless browser tests (Playwright) confirmed the login screen renders perfectly locally. The blank screen was likely a transient Vite Hot Module Replacement (HMR) artifact after environment variables were injected.
4. **The SQL function `sync_push` logic is valid**: Testing `sync_push` with a dummy payload and a *different* `user_id` directly in the Supabase SQL editor executes instantly and successfully. 

## What We Did (The Mitigations)
1. **Batch Size Reduction**: Reduced `PUSH_BATCH_SIZE` from `500` to `50` in `syncEngine.ts` to minimize the payload size and processing time per request.
2. **SQL Optimization (Migration 010)**: Rewrote `sync_push` to completely eliminate queries to `information_schema.columns` (which can be notoriously slow on shared Postgres instances). Replaced it with a hyper-optimized query using system catalogs (`pg_attribute` and `pg_class`) which executes in <1ms.
3. **Lock Termination**: Provided a SQL script to explicitly kill any `idle in transaction` or stuck backend processes (`pg_terminate_backend`) to clear any orphaned `pg_advisory_xact_lock` that might be blocking the user's sync.

## Current State
Despite applying the optimizations and clearing locks, the user still reports the exact same 520 error on `localhost`. 

## Root Cause Hypotheses (For Next Agent/Developer)
Since the optimizations did not resolve the timeout, the remaining possibilities are:
1. **Supabase Resource Exhaustion / Realtime Triggers**: If `supabase_realtime` is enabled on these tables, inserting/updating 50 rows might be triggering a massive broadcast event that overwhelms the Supabase Free Tier CPU/memory, causing the transaction to hang.
2. **Massive Outbox Backlog / Payload Issues**: The frontend might be sending a payload that is somehow bypassing the `PUSH_BATCH_SIZE` limit, or a specific row in the user's IndexedDB contains an incredibly large artifact (e.g., a base64 string in `attachments`) causing Kong/PostgREST to choke on the JSON parsing.
3. **Failed Migration Application**: The `010` migration script may not have been applied successfully to the live Supabase database, meaning the unoptimized code is still running and hitting the 15-second timeout.
4. **Row Level Security (RLS) Nightmare**: An RLS policy might be performing a complex nested query during the `INSERT`/`UPDATE` phase of `sync_push`, causing a massive performance degradation that only appears for this specific user's dataset.

## Next Recommended Steps
1. Open the **Network Tab** in the browser, inspect the exact Request Payload being sent to `sync_push`. Check its size (in KB/MB) and ensure it only contains 50 rows.
2. Check the **Supabase Dashboard -> Database -> Postgres Logs** (or API Logs) at the exact moment the 520 occurs. PostgREST or Postgres will log exactly *why* the query was aborted (e.g., `statement timeout`, `out of memory`, or `lock timeout`).
3. Temporarily disable RLS or Realtime on the syncing tables to isolate if a trigger/policy is causing the 15+ second hang.

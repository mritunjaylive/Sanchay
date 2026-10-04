# 3. Safe Sync Pull Pagination and Tombstone Purging

Date: 2026-10-04

## Status
Accepted

## Context
In `sync_pull`, queries returning backlog changes need to be strictly page-bounded by `page_size` to prevent timeout on large datasets while guaranteeing that multi-table synchronizations do not skip rows. Previously, `LIMIT` was placed on top of `jsonb_agg()`, which caused the entire table backlog to be returned in a single batch, and a shared cursor across tables risked skipping rows on lagging tables. Furthermore, checking tombstones against the oldest `transactions` row was imprecise when determining if a client required a full sync reset.

## Decision
1. **Ordered Subquery Pagination via `UNION ALL`:** In `sync_pull`, requested tables are selected within subqueries, combined via `UNION ALL`, ordered globally by `server_seq ASC`, and limited to `page_size`. When called per-table or multi-table, rows are strictly ordered by sequence number and capped at `page_size`.
2. **Table Whitelist Enforcement:** `sync_pull` and `sync_push` enforce strict whitelisting of synced tables (`profiles`, `accounts`, `loan_terms`, `categories`, `tags`, `recurring_rules`, `recurring_overrides`, `goals`, `goal_contributions`, `transactions`, `transaction_tags`, `attachments`, `budgets`, `saved_filters`, `notifications`). Unauthorized or non-synced tables (`push_subscriptions`, `fx_rates`, catalog tables) are rejected with an explicit error.
3. **Dedicated `sync_purge_state` Table:** Replaced the heuristic transaction tombstone check with a table `sync_purge_state(user_id, purged_through_seq, updated_at)`. If a pulling client's cursor is older than `purged_through_seq`, `reset_required: true` is returned.
4. **Nightly Tombstone Purge Job:** Added `purge_tombstones()` function scheduled via `pg_cron` nightly (03:00) to permanently delete tombstones older than 90 days and advance `purged_through_seq`.

## Consequences
- Paging strictly respects `page_size` with accurate `has_more` indicators.
- Clients sync backlogs incrementally in predictable chunks without duplicate processing or skipped records.
- Obsolete soft-deleted tombstones are reliably cleaned up while preventing stale clients from missing hard-purged deletions.

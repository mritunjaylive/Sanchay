# 1. Offline-First Architecture & Single-Tab Sync

Date: 2026-01-01

## Status
Accepted

## Context
Sanchay is an offline-first personal finance application targeting both desktop browsers and mobile devices (PWA). Users frequently enter transactions in areas with spotty or nonexistent internet connectivity. Financial data entry must be instantaneous (< 100ms) and never block on network roundtrips.

## Decision
1. **Local DB as Source of Truth for UI:** The UI reads and writes exclusively to the local IndexedDB database (via Dexie.js). No UI screen awaits network requests for CRUD operations.
2. **Atomic Outbox Writes:** Every local modification writes to the respective table and an `outbox` table in a single Dexie transaction. Writes to the same `(table, rowId)` coalesce into the latest snapshot.
3. **Single-Tab Sync Leadership:** To eliminate write contention and duplicate network requests across multiple open tabs, the client elects a leader using the Web Locks API (`navigator.locks`). Secondary tabs receive sync state updates via `BroadcastChannel`.
4. **Deterministic LWW Conflict Resolution:** Sync uses per-record Last-Write-Wins on `updated_at`, with deterministic tie-breaking on `version` and client ID. Deletions are represented as soft tombstones (`deleted_at`).

## Consequences
- The application is 100% operational offline.
- Concurrency between multiple devices is gracefully reconciled on the server via `sync_push` and `sync_pull` RPCs.
- Clean separation of UI domain logic from network transport.

import { create } from 'zustand'
import type { SyncStatus } from '@sanchay/shared'

interface SyncState {
  status: SyncStatus
  pendingCount: number
  lastSyncAt: string | null
  lastError: string | null

  setStatus: (status: SyncStatus) => void
  setPendingCount: (count: number) => void
  setLastSyncAt: (at: string | null) => void
  setLastError: (error: string | null) => void
}

export const useSyncStore = create<SyncState>((set) => ({
  status: 'synced',
  pendingCount: 0,
  lastSyncAt: null,
  lastError: null,

  setStatus: (status) => set({ status }),
  setPendingCount: (pendingCount) => set({ pendingCount }),
  setLastSyncAt: (lastSyncAt) => set({ lastSyncAt }),
  setLastError: (lastError) => set({ lastError }),
}))

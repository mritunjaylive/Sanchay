/**
 * packages/shared/src/index.ts
 *
 * Central export for all shared types, schemas, and constants.
 * Used by apps/web and supabase/functions.
 */

// Schemas and types
export * from './schemas/sync.js'
export * from './schemas/profile.js'
export * from './schemas/account.js'
export * from './schemas/transaction.js'
export * from './schemas/category.js'
export * from './schemas/budget.js'
export * from './schemas/recurring.js'
export * from './schemas/goal.js'
export * from './schemas/notification.js'

// Enums and constants
export * from './enums.js'
export * from './currency.js'

// Database type (generated from Supabase — initially manual)
export type { Database } from './database.js'

// Table dependency order for sync
export { TABLES, type TableName } from './tables.js'

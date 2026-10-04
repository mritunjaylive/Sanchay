/**
 * Enumerations shared between the web app and edge functions.
 * Stored as text with CHECK constraints in Postgres (easier to evolve than PG enums).
 */

export const AccountKind = {
  CASH: 'cash',
  BANK: 'bank',
  WALLET: 'wallet',
  SAVINGS: 'savings',
  INVESTMENT: 'investment',
  OTHER_ASSET: 'other_asset',
  CREDIT_CARD: 'credit_card',
  LOAN: 'loan',
  OTHER_LIABILITY: 'other_liability',
} as const
export type AccountKind = (typeof AccountKind)[keyof typeof AccountKind]

export const ACCOUNT_KINDS: AccountKind[] = Object.values(AccountKind)
export const ASSET_KINDS: AccountKind[] = ['cash', 'bank', 'wallet', 'savings', 'investment', 'other_asset']
export const LIABILITY_KINDS: AccountKind[] = ['credit_card', 'loan', 'other_liability']

export const TransactionType = {
  INCOME: 'income',
  EXPENSE: 'expense',
  TRANSFER: 'transfer',
  ADJUSTMENT: 'adjustment',
} as const
export type TransactionType = (typeof TransactionType)[keyof typeof TransactionType]

export const CategoryKind = {
  INCOME: 'income',
  EXPENSE: 'expense',
} as const
export type CategoryKind = (typeof CategoryKind)[keyof typeof CategoryKind]

export const RecurringFreq = {
  DAILY: 'daily',
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
  YEARLY: 'yearly',
} as const
export type RecurringFreq = (typeof RecurringFreq)[keyof typeof RecurringFreq]

export const RecurringMode = {
  AUTO_POST: 'auto_post',
  REMIND_ONLY: 'remind_only',
} as const
export type RecurringMode = (typeof RecurringMode)[keyof typeof RecurringMode]

export const OverrideAction = {
  SKIP: 'skip',
  MOVED: 'moved',
  AMOUNT_CHANGED: 'amount_changed',
} as const
export type OverrideAction = (typeof OverrideAction)[keyof typeof OverrideAction]

export const LoanDirection = {
  BORROWED: 'borrowed',
  LENT: 'lent',
} as const
export type LoanDirection = (typeof LoanDirection)[keyof typeof LoanDirection]

export const RateType = {
  REDUCING: 'reducing',
  FLAT: 'flat',
} as const
export type RateType = (typeof RateType)[keyof typeof RateType]

export const TransactionSource = {
  MANUAL: 'manual',
  RECURRING: 'recurring',
  IMPORT: 'import',
  LOAN_SCHEDULE: 'loan_schedule',
} as const
export type TransactionSource = (typeof TransactionSource)[keyof typeof TransactionSource]

export const UploadState = {
  PENDING: 'pending',
  UPLOADED: 'uploaded',
} as const
export type UploadState = (typeof UploadState)[keyof typeof UploadState]

export const Theme = {
  LIGHT: 'light',
  DARK: 'dark',
  SYSTEM: 'system',
} as const
export type Theme = (typeof Theme)[keyof typeof Theme]

export const PaymentMethod = {
  CASH: 'cash',
  CARD: 'card',
  UPI: 'upi',
  BANK_TRANSFER: 'bank_transfer',
  OTHER: 'other',
} as const
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod]

export const SyncStatus = {
  SYNCED: 'synced',
  SYNCING: 'syncing',
  PENDING: 'pending',
  OFFLINE: 'offline',
  ERROR: 'error',
  AUTH_REQUIRED: 'auth_required',
} as const
export type SyncStatus = (typeof SyncStatus)[keyof typeof SyncStatus]

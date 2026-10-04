/**
 * Dependency order for sync — parents must be pushed before children.
 * @see Sanchay_spec.md section 9.6
 */
export const TABLES = [
  'profiles',
  'accounts',
  'loan_terms',
  'categories',
  'tags',
  'recurring_rules',
  'recurring_overrides',
  'goals',
  'transactions',
  'transaction_tags',
  'attachments',
  'budgets',
  'goal_contributions',
  'saved_filters',
  'notifications',
] as const

export type TableName = (typeof TABLES)[number]

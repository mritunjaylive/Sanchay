/**
 * domain/suggestions.ts — Local rule-based payee autocomplete and category suggestion.
 *
 * Pure functions, no side effects, no network calls.
 *
 * @see Sanchay_spec.md section 10.10
 */

import type { Transaction } from '@sanchay/shared'

export interface CategorySuggestion {
  categoryId: string
  frequency: number
}

/**
 * Suggests payees matching a typed query prefix (case-insensitive).
 * Returns ranked unique payee names sorted by recent frequency.
 */
export function suggestPayees(
  transactions: Transaction[],
  query: string,
  limit = 5,
): string[] {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return []

  const frequencyMap = new Map<string, number>()
  const originalCasingMap = new Map<string, string>()

  for (const tx of transactions) {
    if (tx.deletedAt || !tx.payee) continue

    const trimmed = tx.payee.trim()
    const lower = trimmed.toLowerCase()

    if (lower.includes(normalizedQuery)) {
      frequencyMap.set(lower, (frequencyMap.get(lower) ?? 0) + 1)
      if (!originalCasingMap.has(lower)) {
        originalCasingMap.set(lower, trimmed)
      }
    }
  }

  return Array.from(frequencyMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([lower]) => originalCasingMap.get(lower)!)
}

/**
 * Suggests the most likely category for a given payee name based on past transactions.
 * Matches case-insensitively, ranks categories by frequency.
 */
export function suggestCategoryForPayee(
  transactions: Transaction[],
  payee: string,
  limit = 3,
): CategorySuggestion[] {
  const normalizedPayee = payee.trim().toLowerCase()
  if (!normalizedPayee) return []

  const categoryFrequency = new Map<string, number>()

  for (const tx of transactions) {
    if (tx.deletedAt || !tx.payee || !tx.categoryId) continue

    if (tx.payee.trim().toLowerCase() === normalizedPayee) {
      categoryFrequency.set(tx.categoryId, (categoryFrequency.get(tx.categoryId) ?? 0) + 1)
    }
  }

  return Array.from(categoryFrequency.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([categoryId, frequency]) => ({ categoryId, frequency }))
}

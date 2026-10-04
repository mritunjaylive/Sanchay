/**
 * lib/cn.ts — Class name merging utility.
 * Combines clsx for conditional classes and tailwind-merge for Tailwind deduplication.
 */
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

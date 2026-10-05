import React from 'react'
import {
  Utensils,
  ShoppingCart,
  Car,
  ShoppingBag,
  Receipt,
  Home,
  HeartPulse,
  Film,
  GraduationCap,
  Smile,
  Gift,
  CircleEllipsis,
  Briefcase,
  Laptop,
  TrendingUp,
  Percent,
  Coins,
  Wallet,
  Landmark,
  Tag,
  HelpCircle,
  PiggyBank,
  Coffee,
  Plane,
  Fuel,
  Dumbbell,
  ShieldAlert,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '../lib/cn'

const ICON_MAP: Record<string, LucideIcon> = {
  Utensils,
  ShoppingCart,
  Car,
  ShoppingBag,
  Receipt,
  Home,
  HeartPulse,
  Film,
  GraduationCap,
  Smile,
  Gift,
  CircleEllipsis,
  Briefcase,
  Laptop,
  TrendingUp,
  Percent,
  Coins,
  Wallet,
  Landmark,
  PiggyBank,
  Coffee,
  Plane,
  Fuel,
  Dumbbell,
  ShieldAlert,
}

// Fallback icon resolver based on category name
function resolveIconByName(name?: string | null): LucideIcon {
  if (!name) return Tag
  const lower = name.toLowerCase()

  if (lower.includes('food') || lower.includes('dining') || lower.includes('eat') || lower.includes('restaurant'))
    return Utensils
  if (lower.includes('grocer') || lower.includes('market') || lower.includes('supermarket'))
    return ShoppingCart
  if (lower.includes('transport') || lower.includes('fuel') || lower.includes('gas') || lower.includes('car'))
    return Car
  if (lower.includes('shop') || lower.includes('cloth'))
    return ShoppingBag
  if (lower.includes('bill') || lower.includes('utilit') || lower.includes('electric') || lower.includes('water'))
    return Receipt
  if (lower.includes('house') || lower.includes('rent') || lower.includes('home'))
    return Home
  if (lower.includes('health') || lower.includes('med') || lower.includes('doctor') || lower.includes('hospital'))
    return HeartPulse
  if (lower.includes('entertain') || lower.includes('movie') || lower.includes('film') || lower.includes('stream'))
    return Film
  if (lower.includes('edu') || lower.includes('school') || lower.includes('college') || lower.includes('course'))
    return GraduationCap
  if (lower.includes('personal') || lower.includes('care') || lower.includes('salon'))
    return Smile
  if (lower.includes('gift') || lower.includes('donat'))
    return Gift
  if (lower.includes('salary') || lower.includes('job') || lower.includes('wage'))
    return Briefcase
  if (lower.includes('freelance') || lower.includes('business') || lower.includes('client'))
    return Laptop
  if (lower.includes('invest') || lower.includes('dividend') || lower.includes('stock'))
    return TrendingUp
  if (lower.includes('interest'))
    return Percent
  if (lower.includes('income'))
    return Coins

  return Tag
}

export interface CategoryIconProps {
  icon?: string | null | undefined
  name?: string | null | undefined
  color?: string | null | undefined
  kind?: 'expense' | 'income' | string | undefined
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | undefined
  className?: string | undefined
}

export function CategoryIcon({
  icon,
  name,
  color,
  kind = 'expense',
  size = 'md',
  className,
}: CategoryIconProps) {
  const IconComponent =
    (icon && ICON_MAP[icon]) ||
    resolveIconByName(name) ||
    HelpCircle

  // Size scales
  const sizeMap = {
    xs: { box: 'w-6 h-6 rounded-md', iconSize: 12 },
    sm: { box: 'w-8 h-8 rounded-lg', iconSize: 16 },
    md: { box: 'w-10 h-10 rounded-xl', iconSize: 18 },
    lg: { box: 'w-12 h-12 rounded-2xl', iconSize: 22 },
    xl: { box: 'w-14 h-14 rounded-2xl', iconSize: 26 },
  }

  const { box, iconSize } = sizeMap[size]

  // Safe background tint and text color
  const fallbackColor = kind === 'income' ? '#10b981' : '#0F766E'
  const activeColor = color || fallbackColor

  return (
    <div
      className={cn(
        'inline-flex items-center justify-center shrink-0 border select-none transition-transform',
        box,
        className,
      )}
      style={{
        backgroundColor: `${activeColor}18`, // 10% opacity tint
        borderColor: `${activeColor}35`, // 20% opacity border
        color: activeColor,
      }}
      aria-hidden="true"
    >
      <IconComponent size={iconSize} />
    </div>
  )
}

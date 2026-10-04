import React, { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../lib/cn'

export interface LogoProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string
  className?: string
  withBackground?: boolean
}

export function Logo({
  size = 32,
  className,
  withBackground = true,
  ...props
}: LogoProps) {
  const gradientId = useId()
  const dimension = typeof size === 'number' ? `${size}px` : size

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      width={dimension}
      height={dimension}
      className={cn('shrink-0 select-none inline-block', className)}
      role="img"
      aria-label="Sanchay Logo"
      {...props}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0F766E" />
          <stop offset="1" stopColor="#14B8A6" />
        </linearGradient>
      </defs>
      {withBackground && (
        <rect width="512" height="512" rx="112" fill={`url(#${gradientId})`} />
      )}
      <path
        d="M338 178 C330 120 174 120 174 192 C174 262 340 244 340 316 C340 392 182 392 172 332"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="44"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="378" cy="130" r="34" fill="#FBBF24" />
      <circle cx="378" cy="130" r="20" fill="none" stroke="#B45309" strokeWidth="6" opacity="0.55" />
    </svg>
  )
}

export interface BrandNameProps {
  className?: string
  gradientText?: boolean
}

export function BrandName({ className, gradientText = false }: BrandNameProps) {
  const { t, i18n } = useTranslation()
  const name = t('app.name', 'Sanchay')
  const isHindi =
    (i18n.resolvedLanguage || i18n.language || '').startsWith('hi') ||
    /[\u0900-\u097F]/.test(name)

  return (
    <span
      className={cn(
        isHindi ? 'font-khand font-bold tracking-wide' : 'font-cinzel font-bold tracking-wider',
        gradientText && 'gradient-text',
        className,
      )}
    >
      {name}
    </span>
  )
}

export interface LogoBrandProps {
  logoSize?: number | string
  textSize?: string
  className?: string
  gradientText?: boolean
}

export function LogoBrand({
  logoSize = 32,
  textSize = 'text-xl',
  className,
  gradientText = false,
}: LogoBrandProps) {
  return (
    <div className={cn('inline-flex items-center gap-2.5', className)}>
      <Logo size={logoSize} />
      <BrandName className={textSize} gradientText={gradientText} />
    </div>
  )
}

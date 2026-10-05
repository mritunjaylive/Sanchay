import { cn } from '../lib/cn'

export interface SkeletonProps {
  className?: string | undefined
  style?: React.CSSProperties | undefined
}

export function Skeleton({ className, style }: SkeletonProps) {
  return (
    <div
      style={style}
      className={cn('skeleton-shimmer rounded-xl select-none', className)}
      aria-hidden="true"
    />
  )
}

export function TransactionRowSkeleton() {
  return (
    <div className="flex items-center justify-between p-3.5 bg-surface-elevated rounded-xl border border-border/60">
      <div className="flex items-center gap-3">
        <Skeleton className="w-10 h-10 rounded-xl" />
        <div className="space-y-1.5">
          <Skeleton className="w-28 h-4 rounded-md" />
          <Skeleton className="w-20 h-3 rounded-md" />
        </div>
      </div>
      <div className="space-y-1.5 flex flex-col items-end">
        <Skeleton className="w-16 h-4 rounded-md" />
        <Skeleton className="w-12 h-3 rounded-md" />
      </div>
    </div>
  )
}

export function CardSkeleton({ className }: { className?: string | undefined }) {
  return (
    <div
      className={cn(
        'p-5 bg-surface-elevated rounded-2xl border border-border/60 space-y-4',
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <Skeleton className="w-32 h-5 rounded-md" />
        <Skeleton className="w-8 h-8 rounded-lg" />
      </div>
      <Skeleton className="w-48 h-8 rounded-lg" />
      <div className="space-y-2 pt-2">
        <Skeleton className="w-full h-3 rounded-md" />
        <Skeleton className="w-2/3 h-3 rounded-md" />
      </div>
    </div>
  )
}

export const SkeletonCard = CardSkeleton
export const SkeletonRow = TransactionRowSkeleton


import { cn } from '@/lib/utils'

export type SkeletonProps = {
  className?: string
}

/** Placeholder de carregamento com shimmer (estático sob reduced-motion). Dimensione por `className`. */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      data-slot="skeleton"
      className={cn('fc-skeleton rounded-fc-xs h-4 w-full', className)}
    />
  )
}

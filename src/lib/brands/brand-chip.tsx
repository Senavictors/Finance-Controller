import type { CSSProperties } from 'react'
import { cn } from '@/lib/utils'
import { BrandIcon } from './brand-icon'
import { getBrand, matchBrand } from './registry'

type BrandChipProps = {
  brandKey?: string | null
  fallbackLabel: string
  fallbackText?: string | null
  fallbackColor?: string | null
  iconSize?: number
  className?: string
  labelClassName?: string
  style?: CSSProperties
}

export function BrandChip({
  brandKey,
  fallbackLabel,
  fallbackText,
  fallbackColor,
  iconSize = 16,
  className,
  labelClassName,
  style,
}: BrandChipProps) {
  const brand = getBrand(brandKey) ?? getBrand(matchBrand(fallbackText))
  const label = brand?.name ?? fallbackLabel

  return (
    <span
      className={cn(
        'border-border/60 bg-background/70 text-foreground inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium shadow-sm backdrop-blur-sm',
        className,
      )}
      style={style}
    >
      <BrandIcon
        brandKey={brandKey}
        fallbackLabel={fallbackLabel}
        fallbackText={fallbackText}
        fallbackColor={fallbackColor}
        size={iconSize}
        radius="full"
      />
      <span className={cn('truncate leading-none', labelClassName)}>{label}</span>
    </span>
  )
}

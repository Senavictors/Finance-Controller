import { cn } from '@/lib/utils'
import { getBrand, matchBrand } from './registry'

type BrandIconRadius = 'sm' | 'md' | 'lg' | 'full' | number

type BrandIconProps = {
  brandKey?: string | null
  fallbackLabel: string
  fallbackText?: string | null
  fallbackColor?: string | null
  size?: number
  radius?: BrandIconRadius
  className?: string
  title?: string
}

const RADIUS_CLASS: Record<Exclude<BrandIconRadius, number>, string> = {
  sm: 'rounded-md',
  md: 'rounded-xl',
  lg: 'rounded-2xl',
  full: 'rounded-full',
}

function initialsFor(label: string) {
  const cleaned = label.trim()
  if (!cleaned) return '?'
  const words = cleaned.split(/\s+/).filter(Boolean)
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}

export function BrandIcon({
  brandKey,
  fallbackLabel,
  fallbackText,
  fallbackColor,
  size = 40,
  radius = 'md',
  className,
  title,
}: BrandIconProps) {
  const brand = getBrand(brandKey) ?? getBrand(matchBrand(fallbackText))
  const radiusClass = typeof radius === 'number' ? undefined : RADIUS_CLASS[radius]
  const radiusStyle = typeof radius === 'number' ? { borderRadius: radius } : undefined

  const style: React.CSSProperties = {
    width: size,
    height: size,
    minWidth: size,
    minHeight: size,
    ...radiusStyle,
  }

  if (brand) {
    return (
      <span
        role="img"
        aria-label={title ?? brand.name}
        title={title ?? brand.name}
        className={cn(
          'inline-flex items-center justify-center overflow-hidden',
          radiusClass,
          brand.border && 'border border-gray-200',
          className,
        )}
        style={{ ...style, backgroundColor: brand.bg, color: brand.fg }}
      >
        <svg
          viewBox="0 0 100 100"
          width="100%"
          height="100%"
          aria-hidden="true"
          focusable="false"
          dangerouslySetInnerHTML={{ __html: brand.svg }}
        />
      </span>
    )
  }

  const color = fallbackColor ?? '#3b82f6'
  return (
    <span
      role="img"
      aria-label={title ?? fallbackLabel}
      title={title ?? fallbackLabel}
      className={cn(
        'inline-flex items-center justify-center font-semibold tracking-tight',
        radiusClass,
        className,
      )}
      style={{
        ...style,
        backgroundColor: `${color}20`,
        color,
        fontSize: Math.max(10, Math.round(size * 0.38)),
      }}
    >
      {initialsFor(fallbackLabel)}
    </span>
  )
}

export function BrandDot({
  brandKey,
  fallbackText,
  fallbackColor,
  fallbackLabel,
  size = 14,
  className,
}: {
  brandKey?: string | null
  fallbackText?: string | null
  fallbackColor?: string | null
  fallbackLabel?: string
  size?: number
  className?: string
}) {
  const brand = getBrand(brandKey) ?? getBrand(matchBrand(fallbackText))
  if (brand) {
    return (
      <BrandIcon
        brandKey={brand.key}
        fallbackLabel={fallbackLabel ?? brand.name}
        size={size}
        radius="full"
        className={className}
      />
    )
  }
  return (
    <span
      aria-hidden="true"
      className={cn('inline-block rounded-full', className)}
      style={{
        width: size,
        height: size,
        minWidth: size,
        minHeight: size,
        backgroundColor: fallbackColor ?? '#3b82f6',
      }}
    />
  )
}

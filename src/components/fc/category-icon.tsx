import * as React from 'react'
import {
  Banknote,
  Bike,
  Briefcase,
  Bus,
  Car,
  Coffee,
  CreditCard,
  Dumbbell,
  Film,
  Fuel,
  Gamepad2,
  Gift,
  GraduationCap,
  HeartPulse,
  Home,
  Landmark,
  Music,
  PawPrint,
  Phone,
  PiggyBank,
  Pizza,
  Plane,
  Receipt,
  Repeat,
  Shirt,
  ShoppingBag,
  ShoppingCart,
  Tag,
  Utensils,
  Wallet,
  Wifi,
  Zap,
  type LucideIcon,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { resolveCategoryColorKey } from '@/components/fc/lib/category-color'

/** Conjunto curado de ícones (evita importar o pacote lucide inteiro). */
export const CATEGORY_ICONS = {
  banknote: Banknote,
  bike: Bike,
  briefcase: Briefcase,
  bus: Bus,
  car: Car,
  coffee: Coffee,
  'credit-card': CreditCard,
  dumbbell: Dumbbell,
  film: Film,
  fuel: Fuel,
  gamepad: Gamepad2,
  gift: Gift,
  'graduation-cap': GraduationCap,
  'heart-pulse': HeartPulse,
  home: Home,
  landmark: Landmark,
  music: Music,
  'paw-print': PawPrint,
  phone: Phone,
  'piggy-bank': PiggyBank,
  pizza: Pizza,
  plane: Plane,
  receipt: Receipt,
  repeat: Repeat,
  shirt: Shirt,
  'shopping-bag': ShoppingBag,
  'shopping-cart': ShoppingCart,
  tag: Tag,
  utensils: Utensils,
  wallet: Wallet,
  wifi: Wifi,
  zap: Zap,
} satisfies Record<string, LucideIcon>

export type CategoryIconName = keyof typeof CATEGORY_ICONS

export type CategoryIconProps = {
  /** Nome (kebab-case) do conjunto curado; desconhecido cai em `tag`. */
  icon?: CategoryIconName | (string & {})
  /** `cat-1` a `cat-10`; inválido cai em `cat-10`. */
  colorKey?: string | null
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const SIZE_CLASS = {
  sm: { box: 'size-8', icon: 'size-4' },
  md: { box: 'size-10', icon: 'size-5' },
  lg: { box: 'size-12', icon: 'size-6' },
} as const

function isKnownIcon(name: string): name is CategoryIconName {
  return Object.prototype.hasOwnProperty.call(CATEGORY_ICONS, name)
}

/** Ícone de categoria: quadrado `--fc-radius-sm`, fundo da cor a 18%, glifo na cor cheia. */
export function CategoryIcon({ icon, colorKey, size = 'md', className }: CategoryIconProps) {
  const key = resolveCategoryColorKey(colorKey)
  const Icon = icon && isKnownIcon(icon) ? CATEGORY_ICONS[icon] : Tag
  const sizing = SIZE_CLASS[size]

  return (
    <span
      aria-hidden="true"
      data-slot="category-icon"
      data-color={key}
      style={{
        color: `var(--fc-${key})`,
        background: `color-mix(in srgb, var(--fc-${key}) 18%, transparent)`,
      }}
      className={cn('rounded-fc-sm inline-grid shrink-0 place-items-center', sizing.box, className)}
    >
      <Icon className={sizing.icon} />
    </span>
  )
}

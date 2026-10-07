import * as React from 'react'
import {
  AlarmClock,
  Apple,
  Baby,
  BadgeCheck,
  Banknote,
  Beef,
  Beer,
  Bike,
  BookOpen,
  Brain,
  Briefcase,
  Building2,
  Bus,
  Cake,
  CalendarCheck,
  Car,
  CarTaxiFront,
  CircleEllipsis,
  CircleQuestionMark,
  Clapperboard,
  Cloud,
  Coffee,
  CreditCard,
  Droplets,
  Dumbbell,
  FileText,
  Film,
  Flame,
  Fuel,
  Gamepad2,
  Gift,
  GraduationCap,
  HandCoins,
  HandHeart,
  HeartPulse,
  House,
  KeyRound,
  Lamp,
  Landmark,
  MapPin,
  MonitorPlay,
  Music,
  Newspaper,
  Palette,
  ParkingMeter,
  PartyPopper,
  PawPrint,
  Percent,
  Phone,
  PiggyBank,
  Pill,
  Pizza,
  Plane,
  Receipt,
  ReceiptText,
  Repeat,
  Scale,
  School,
  ScrollText,
  ShieldCheck,
  ShieldPlus,
  Shirt,
  ShoppingBag,
  ShoppingBasket,
  ShoppingCart,
  Smartphone,
  Smile,
  Sofa,
  Sparkles,
  SprayCan,
  Stamp,
  Stethoscope,
  Tag,
  TentTree,
  TrainFront,
  TrendingUp,
  Tv,
  Undo2,
  Users,
  Utensils,
  UtensilsCrossed,
  Wallet,
  Wifi,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { resolveCategoryColorKey } from '@/components/fc/lib/category-color'

/** Conjunto curado de ícones (evita importar o pacote lucide inteiro). */
export const CATEGORY_ICONS = {
  'alarm-clock': AlarmClock,
  apple: Apple,
  baby: Baby,
  'badge-check': BadgeCheck,
  banknote: Banknote,
  beef: Beef,
  beer: Beer,
  bike: Bike,
  'book-open': BookOpen,
  brain: Brain,
  briefcase: Briefcase,
  'building-2': Building2,
  bus: Bus,
  cake: Cake,
  'calendar-check': CalendarCheck,
  car: Car,
  'car-taxi-front': CarTaxiFront,
  'circle-ellipsis': CircleEllipsis,
  'circle-question-mark': CircleQuestionMark,
  clapperboard: Clapperboard,
  cloud: Cloud,
  coffee: Coffee,
  'credit-card': CreditCard,
  droplets: Droplets,
  dumbbell: Dumbbell,
  'file-text': FileText,
  film: Film,
  flame: Flame,
  fuel: Fuel,
  'gamepad-2': Gamepad2,
  gift: Gift,
  'graduation-cap': GraduationCap,
  'hand-coins': HandCoins,
  'hand-heart': HandHeart,
  'heart-pulse': HeartPulse,
  house: House,
  'key-round': KeyRound,
  lamp: Lamp,
  landmark: Landmark,
  'map-pin': MapPin,
  'monitor-play': MonitorPlay,
  music: Music,
  newspaper: Newspaper,
  palette: Palette,
  'parking-meter': ParkingMeter,
  'party-popper': PartyPopper,
  'paw-print': PawPrint,
  percent: Percent,
  phone: Phone,
  'piggy-bank': PiggyBank,
  pill: Pill,
  pizza: Pizza,
  plane: Plane,
  receipt: Receipt,
  'receipt-text': ReceiptText,
  repeat: Repeat,
  scale: Scale,
  school: School,
  'scroll-text': ScrollText,
  'shield-check': ShieldCheck,
  'shield-plus': ShieldPlus,
  shirt: Shirt,
  'shopping-bag': ShoppingBag,
  'shopping-basket': ShoppingBasket,
  'shopping-cart': ShoppingCart,
  smartphone: Smartphone,
  smile: Smile,
  sofa: Sofa,
  sparkles: Sparkles,
  'spray-can': SprayCan,
  stamp: Stamp,
  stethoscope: Stethoscope,
  tag: Tag,
  'tent-tree': TentTree,
  'train-front': TrainFront,
  'trending-up': TrendingUp,
  tv: Tv,
  'undo-2': Undo2,
  users: Users,
  utensils: Utensils,
  'utensils-crossed': UtensilsCrossed,
  wallet: Wallet,
  wifi: Wifi,
  wrench: Wrench,
  zap: Zap,
} satisfies Record<string, LucideIcon>

export type CategoryIconName = keyof typeof CATEGORY_ICONS

/**
 * Aliases de nomes legados (FC2-F0-04) para o nome canônico lucide usado pela árvore padrão de
 * categorias. Mantidos para dados/galerias antigos; novos dados usam o nome canônico.
 */
export const CATEGORY_ICON_ALIASES = {
  home: 'house',
  gamepad: 'gamepad-2',
} as const satisfies Record<string, CategoryIconName>

/** Resolve o nome canônico: nome do conjunto, alias legado ou fallback `tag`. */
export function resolveCategoryIconName(name?: string | null): CategoryIconName {
  if (!name) return 'tag'
  if (Object.prototype.hasOwnProperty.call(CATEGORY_ICONS, name)) {
    return name as CategoryIconName
  }
  if (Object.prototype.hasOwnProperty.call(CATEGORY_ICON_ALIASES, name)) {
    return CATEGORY_ICON_ALIASES[name as keyof typeof CATEGORY_ICON_ALIASES]
  }
  return 'tag'
}

/** Resolve o componente do ícone (ver `resolveCategoryIconName`). */
export function resolveCategoryIcon(name?: string | null): LucideIcon {
  return CATEGORY_ICONS[resolveCategoryIconName(name)]
}

export type CategoryIconProps = {
  /** Nome lucide (kebab-case) do conjunto curado ou alias legado; desconhecido cai em `tag`. */
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

/** Ícone de categoria: quadrado `--fc-radius-sm`, fundo da cor a 18%, glifo na cor cheia. */
export function CategoryIcon({ icon, colorKey, size = 'md', className }: CategoryIconProps) {
  const key = resolveCategoryColorKey(colorKey)
  const Icon = CATEGORY_ICONS[resolveCategoryIconName(icon)]
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

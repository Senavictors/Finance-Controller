import { CreditCard, Menu, Plus, ReceiptText, Sun, Target, type LucideIcon } from 'lucide-react'

import type { NavIconName } from './nav-items'

const ICONS: Record<NavIconName, LucideIcon> = {
  Sun,
  ReceiptText,
  Plus,
  Target,
  CreditCard,
  Menu,
}

/** Ícone decorativo da navegação (o rótulo acessível vem do item). */
export function NavIcon({ name, className }: { name: NavIconName; className?: string }) {
  const Icon = ICONS[name]
  return <Icon aria-hidden="true" className={className} />
}

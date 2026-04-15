'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, ArrowLeftRight, Tag, Wallet, Settings, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/transactions', label: 'Transacoes', icon: ArrowLeftRight },
  { href: '/categories', label: 'Categorias', icon: Tag },
  { href: '/accounts', label: 'Contas', icon: Wallet },
  { href: '/settings', label: 'Configuracoes', icon: Settings },
]

export function Sidebar({ className }: { className?: string }) {
  const pathname = usePathname()

  return (
    <aside className={cn('bg-sidebar flex h-full w-64 flex-col', className)}>
      <div className="flex h-16 items-center gap-3 px-5">
        <div className="bg-primary shadow-primary/25 flex size-9 items-center justify-center rounded-xl shadow-lg">
          <TrendingUp className="text-primary-foreground size-4" />
        </div>
        <Link href="/dashboard" className="text-foreground text-base font-semibold tracking-tight">
          Finance Controller
        </Link>
      </div>

      <div className="bg-sidebar-border mx-4 h-px" />

      <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all',
                isActive
                  ? 'bg-primary text-primary-foreground shadow-primary/20 shadow-md'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
              )}
            >
              <item.icon className="size-[18px]" />
              {item.label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}

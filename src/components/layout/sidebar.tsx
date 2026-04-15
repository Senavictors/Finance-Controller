'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, ArrowLeftRight, Tag, Wallet, Settings } from 'lucide-react'
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
    <aside
      className={cn(
        'border-sidebar-border bg-sidebar flex h-full w-64 flex-col border-r',
        className,
      )}
    >
      <div className="border-sidebar-border flex h-14 items-center border-b px-4">
        <Link href="/dashboard" className="text-sidebar-primary text-lg font-bold">
          Finance Controller
        </Link>
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-3">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent/50',
              )}
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}

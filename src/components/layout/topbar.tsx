'use client'

import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, LogOut, Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePeriod } from '@/hooks/use-period'

type TopbarProps = {
  userName: string
  onToggleSidebar?: () => void
}

export function Topbar({ userName, onToggleSidebar }: TopbarProps) {
  const router = useRouter()
  const { label, prevMonth, nextMonth } = usePeriod()

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  return (
    <header className="border-border bg-background flex h-14 items-center justify-between border-b px-4">
      <div className="flex items-center gap-3">
        {onToggleSidebar && (
          <Button variant="ghost" size="icon" onClick={onToggleSidebar} className="lg:hidden">
            <Menu className="size-4" />
          </Button>
        )}
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-xs" onClick={prevMonth}>
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-[140px] text-center text-sm font-medium capitalize">{label}</span>
          <Button variant="ghost" size="icon-xs" onClick={nextMonth}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-muted-foreground hidden text-sm sm:block">{userName}</span>
        <Button variant="ghost" size="icon-sm" onClick={handleLogout} title="Sair">
          <LogOut className="size-4" />
        </Button>
      </div>
    </header>
  )
}

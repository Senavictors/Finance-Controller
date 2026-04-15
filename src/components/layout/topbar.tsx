'use client'

import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, LogOut, Menu, User } from 'lucide-react'
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
    <header className="border-border/50 bg-background/80 flex h-16 items-center justify-between border-b px-4 backdrop-blur-sm md:px-6">
      <div className="flex items-center gap-3">
        {onToggleSidebar && (
          <Button variant="ghost" size="icon" onClick={onToggleSidebar} className="lg:hidden">
            <Menu className="size-5" />
          </Button>
        )}

        <div className="bg-muted flex items-center rounded-full p-1">
          <Button variant="ghost" size="icon-xs" onClick={prevMonth} className="rounded-full">
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-[140px] text-center text-sm font-medium tracking-tight capitalize">
            {label}
          </span>
          <Button variant="ghost" size="icon-xs" onClick={nextMonth} className="rounded-full">
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden items-center gap-2 sm:flex">
          <div className="bg-muted flex size-8 items-center justify-center rounded-full">
            <User className="text-muted-foreground size-4" />
          </div>
          <span className="text-muted-foreground text-sm font-medium tracking-tight">
            {userName}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleLogout}
          title="Sair"
          className="rounded-full"
        >
          <LogOut className="size-4" />
        </Button>
      </div>
    </header>
  )
}

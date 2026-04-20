'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, LogOut, Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePeriod } from '@/hooks/use-period'
import { cn } from '@/lib/utils'
import { getInitials, getUserChipPalette } from '@/lib/user-chip'

type TopbarProps = {
  userName: string
  userEmail: string
  userImage: string | null
  onToggleSidebar?: () => void
}

export function Topbar({ userName, userEmail, userImage, onToggleSidebar }: TopbarProps) {
  const router = useRouter()
  const { label, prevMonth, nextMonth } = usePeriod()

  const palette = getUserChipPalette(userEmail || userName)
  const initials = getInitials(userName || userEmail)

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

      <div className="flex items-center gap-2">
        <Link
          href="/user"
          title="Sua conta"
          className={cn(
            'group flex items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-sm font-medium tracking-tight transition-colors',
            palette.bg,
            palette.border,
            palette.text,
            'hover:shadow-sm',
          )}
        >
          <span
            className={cn(
              'flex size-7 items-center justify-center overflow-hidden rounded-full text-xs font-semibold',
              palette.dotBg,
            )}
          >
            {userImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={userImage} alt={userName} className="size-full object-cover" />
            ) : (
              initials
            )}
          </span>
          <span className="hidden max-w-[160px] truncate sm:inline">{userName}</span>
        </Link>
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

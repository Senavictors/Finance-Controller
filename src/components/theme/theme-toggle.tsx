'use client'

import { MoonStar, SunMedium } from 'lucide-react'
import { useTheme } from './theme-provider'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type ThemeToggleProps = {
  className?: string
  showLabel?: boolean
}

export function ThemeToggle({ className, showLabel = true }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme()
  const nextTheme = theme === 'dark' ? 'light' : 'dark'

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={toggleTheme}
      aria-label={`Ativar modo ${nextTheme}`}
      title={`Tema atual: ${theme}. Clique para ativar ${nextTheme}.`}
      className={cn(
        'border-border/70 bg-background/80 rounded-full px-3 backdrop-blur-sm',
        className,
      )}
    >
      <span className="relative flex size-4 items-center justify-center">
        <SunMedium
          className={cn(
            'absolute size-4 transition-all duration-200',
            theme === 'dark'
              ? 'scale-0 rotate-90 text-amber-500 opacity-0'
              : 'scale-100 rotate-0 text-amber-500 opacity-100',
          )}
        />
        <MoonStar
          className={cn(
            'absolute size-4 transition-all duration-200',
            theme === 'dark'
              ? 'scale-100 rotate-0 text-sky-400 opacity-100'
              : 'scale-0 -rotate-90 text-sky-400 opacity-0',
          )}
        />
      </span>
      {showLabel && <span className="hidden sm:inline">{theme === 'dark' ? 'Dark' : 'Light'}</span>}
    </Button>
  )
}

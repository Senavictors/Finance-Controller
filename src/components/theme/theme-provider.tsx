'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import {
  THEME_COOKIE_MAX_AGE,
  THEME_COOKIE_NAME,
  THEME_STORAGE_KEY,
  resolveTheme,
  type Theme,
} from '@/lib/theme'

type ThemeContextValue = {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function applyTheme(theme: Theme) {
  const root = document.documentElement
  root.dataset.theme = theme
  root.style.colorScheme = theme
  root.classList.toggle('dark', theme === 'dark')
}

function persistTheme(theme: Theme) {
  window.localStorage.setItem(THEME_STORAGE_KEY, theme)

  const secureFlag = window.location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${THEME_COOKIE_NAME}=${theme}; Path=/; Max-Age=${THEME_COOKIE_MAX_AGE}; SameSite=Lax${secureFlag}`
}

type ThemeProviderProps = {
  initialTheme: Theme
  children: ReactNode
}

export function ThemeProvider({ initialTheme, children }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof document !== 'undefined') {
      return (
        resolveTheme(document.documentElement.dataset.theme) ??
        resolveTheme(window.localStorage.getItem(THEME_STORAGE_KEY)) ??
        (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      )
    }

    return initialTheme
  })

  useEffect(() => {
    applyTheme(theme)
    persistTheme(theme)

    function handleStorage(event: StorageEvent) {
      if (event.key !== THEME_STORAGE_KEY) return

      const nextTheme = resolveTheme(event.newValue)
      if (!nextTheme) return

      applyTheme(nextTheme)
      setThemeState(nextTheme)
    }

    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [theme])

  function setTheme(nextTheme: Theme) {
    applyTheme(nextTheme)
    persistTheme(nextTheme)
    setThemeState(nextTheme)
  }

  const value: ThemeContextValue = {
    theme,
    setTheme,
    toggleTheme: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
  }

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)

  if (!context) {
    throw new Error('useTheme must be used inside ThemeProvider')
  }

  return context
}

'use client'

import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { useCallback, useEffect, useMemo } from 'react'

const PERIOD_ENABLED_PATHS = ['/dashboard', '/transactions', '/goals']

export function usePeriod() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const monthParam = searchParams.get('month')
  const isPeriodPage = PERIOD_ENABLED_PATHS.some((p) => pathname.startsWith(p))

  const { year, month } = useMemo(() => {
    if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
      const [y, m] = monthParam.split('-').map(Number)
      return { year: y, month: m }
    }
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() + 1 }
  }, [monthParam])

  const label = useMemo(() => {
    const date = new Date(year, month - 1)
    return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  }, [year, month])

  const startDate = useMemo(() => new Date(year, month - 1, 1), [year, month])
  const endDate = useMemo(() => new Date(year, month, 0, 23, 59, 59, 999), [year, month])

  useEffect(() => {
    if (!isPeriodPage || monthParam) return
    const params = new URLSearchParams(searchParams.toString())
    params.set('month', `${year}-${String(month).padStart(2, '0')}`)
    router.replace(`${pathname}?${params.toString()}`)
  }, [isPeriodPage, monthParam, year, month, searchParams, router, pathname])

  const setMonth = useCallback(
    (y: number, m: number) => {
      const params = new URLSearchParams(searchParams.toString())
      params.set('month', `${y}-${String(m).padStart(2, '0')}`)
      router.replace(`${pathname}?${params.toString()}`)
    },
    [searchParams, router, pathname],
  )

  const prevMonth = useCallback(() => {
    const m = month === 1 ? 12 : month - 1
    const y = month === 1 ? year - 1 : year
    setMonth(y, m)
  }, [month, year, setMonth])

  const nextMonth = useCallback(() => {
    const m = month === 12 ? 1 : month + 1
    const y = month === 12 ? year + 1 : year
    setMonth(y, m)
  }, [month, year, setMonth])

  return { year, month, label, startDate, endDate, setMonth, prevMonth, nextMonth }
}

import { vi } from 'vitest'

/** Instante de referência de toda a suíte: meio-dia UTC de 2026-10-05 (ADR: datas ao meio-dia UTC). */
export const FIXED_NOW_ISO = '2026-10-05T12:00:00.000Z'

/** Relógio fixo para injetar em use-cases/engines. Sempre devolve um novo `Date`. */
export function fixedNow(iso: string = FIXED_NOW_ISO): Date {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    throw new Error(`fixedNow: data inválida "${iso}"`)
  }
  return date
}

/**
 * Executa `fn` com fake timers e `Date.now()` congelado em `iso`.
 * Restaura os timers reais ao terminar (mesmo em erro). Suporta funções assíncronas.
 */
export async function withFakeTime<T>(
  fn: () => T | Promise<T>,
  iso: string = FIXED_NOW_ISO,
): Promise<T> {
  vi.useFakeTimers()
  vi.setSystemTime(fixedNow(iso))
  try {
    return await fn()
  } finally {
    vi.useRealTimers()
  }
}

/**
 * Classificação de erros de concorrência do banco (Postgres via Prisma). O texto/código pode
 * vir em `code`, `meta`, `cause` (adapter `pg`) ou só na mensagem, então varremos a cadeia.
 */

const RETRYABLE_SQLSTATE = /\b(?:40P01|40001)\b|deadlock detected|could not serialize access/i

function describe(error: unknown, depth = 0): string {
  if (error === null || error === undefined || depth > 4) return ''
  if (typeof error === 'string') return error
  if (typeof error !== 'object') return String(error)
  const record = error as Record<string, unknown>
  const parts: string[] = []
  for (const key of ['code', 'originalCode', 'message', 'kind']) {
    const value = record[key]
    if (typeof value === 'string') parts.push(value)
  }
  for (const key of ['meta', 'cause', 'driverAdapterError', 'originalError']) {
    parts.push(describe(record[key], depth + 1))
  }
  return parts.join(' ')
}

function prismaCode(error: unknown): string | null {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code: unknown }).code
    return typeof code === 'string' ? code : null
  }
  return null
}

/** Deadlock (40P01), falha de serialização (40001) ou P2034 (conflito de escrita/deadlock). */
export function isRetryableConcurrencyError(error: unknown): boolean {
  return prismaCode(error) === 'P2034' || RETRYABLE_SQLSTATE.test(describe(error))
}

/** P2025: a linha a mutar não existe mais (apagada por outra transação). */
export function isMissingRowError(error: unknown): boolean {
  return prismaCode(error) === 'P2025'
}

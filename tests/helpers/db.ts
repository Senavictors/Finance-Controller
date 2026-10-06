import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@/generated/prisma/client'

/**
 * Banco de teste opcional (RN-06). Testes de integração só rodam contra `DATABASE_URL_TEST`
 * explícito, apontando para um database descartável (ex.: branch Neon efêmero).
 *
 * Uso:
 *   const db = getTestDb()
 *   describe.skipIf(!db)('integração', () => { ... })
 */

/** Nome do database (último segmento do path da URL), sem query string. */
export function databaseNameFromUrl(url: string): string {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('DATABASE_URL_TEST inválida: não é uma URL de conexão')
  }
  return decodeURIComponent(parsed.pathname.replace(/^\//, ''))
}

/** Lança se a URL não apontar para um database claramente de teste, ou for o banco principal. */
export function assertTestDatabaseUrl(url: string, mainUrl: string | undefined = undefined): void {
  const name = databaseNameFromUrl(url).toLowerCase()
  if (!name.includes('test') && !name.includes('branch')) {
    throw new Error(
      `DATABASE_URL_TEST recusada: o nome do database ("${name || '(vazio)'}") precisa conter ` +
        '"test" ou "branch". Nunca aponte testes para o banco principal.',
    )
  }
  if (mainUrl && mainUrl === url) {
    throw new Error('DATABASE_URL_TEST recusada: é idêntica a DATABASE_URL (banco principal).')
  }
}

/**
 * Retorna um `PrismaClient` para o banco de teste, ou `null` se `DATABASE_URL_TEST` não existir.
 * Lança se a URL não for segura (ver `assertTestDatabaseUrl`). A conexão é preguiçosa.
 */
export function getTestDb(
  env: Partial<Record<string, string | undefined>> = process.env,
): PrismaClient | null {
  const url = env.DATABASE_URL_TEST
  if (!url) return null
  assertTestDatabaseUrl(url, env.DATABASE_URL)
  return new PrismaClient({ adapter: new PrismaPg(url) })
}

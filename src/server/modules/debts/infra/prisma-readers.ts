import type { PrismaClient } from '@/generated/prisma/client'
import type { CardRevolvingReader, CategoryKeyLookup, RevolvingBalance } from '../application/ports'

/**
 * Leitor de rotativo: faturas do cartão vencidas e não quitadas (leitura-somente; o dono da
 * tabela é o módulo de cartões, F1-03). Hoje em São Paulo é recebido por parâmetro.
 */
export function createPrismaCardRevolvingReader(db: PrismaClient): CardRevolvingReader {
  return {
    async revolvingBalance(userId, cardAccountId, today): Promise<RevolvingBalance> {
      const statements = await db.creditCardStatement.findMany({
        where: {
          userId,
          accountId: cardAccountId,
          dueDate: { lt: today },
          status: { not: 'PAID' },
        },
        orderBy: { closingDate: 'asc' },
      })
      let unpaid = 0
      let originalPrincipal = 0
      let since: Date | null = null
      for (const statement of statements) {
        const open = statement.totalAmount - statement.paidAmount
        if (open <= 0) continue
        unpaid += open
        originalPrincipal += statement.totalAmount
        since ??= statement.closingDate
      }
      return { unpaid, originalPrincipal, since }
    },
  }
}

/** Resolve categorias de sistema por `key` (única por usuário). */
export function createPrismaCategoryKeyLookup(db: PrismaClient): CategoryKeyLookup {
  return {
    async idsByKey(userId, keys) {
      const rows = await db.category.findMany({
        where: { userId, key: { in: [...keys] } },
        select: { id: true, key: true },
      })
      const byKey = new Map(rows.map((row) => [row.key, row.id]))
      return Object.fromEntries(keys.map((key) => [key, byKey.get(key) ?? null]))
    },
  }
}

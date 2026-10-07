import { randomUUID } from 'node:crypto'
import { prisma } from '@/server/db'
import { getLedgerService } from '@/server/modules/ledger/service'
import type { DebtsDeps } from '../application/ports'
import { createPrismaLoanRepository } from './prisma-loan-repository'
import { createPrismaCardRevolvingReader, createPrismaCategoryKeyLookup } from './prisma-readers'

let deps: DebtsDeps | undefined

/**
 * Dependências ligadas ao Prisma real e ao serviço do ledger (abre conexão ao importar
 * `@/server/db`): usadas por rotas, bot e MCP. Testes usam repositórios em memória.
 */
export function getDebtsDeps(): DebtsDeps {
  deps ??= {
    loans: createPrismaLoanRepository(prisma),
    ledger: getLedgerService(),
    cardStatements: createPrismaCardRevolvingReader(prisma),
    categories: createPrismaCategoryKeyLookup(prisma),
    newId: () => randomUUID(),
  }
  return deps
}

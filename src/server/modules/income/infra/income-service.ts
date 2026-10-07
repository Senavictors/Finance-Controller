import { randomUUID } from 'node:crypto'
import { prisma } from '@/server/db'
import { getLedgerService } from '@/server/modules/ledger/service'
import { createIncomeService, type IncomeService } from '../application/income-service'
import { createPrismaIncomeRepository } from './prisma-income-repository'

let service: IncomeService | undefined

/**
 * Serviço de renda MEI ligado ao Prisma real, ao ledger real, ao relógio do sistema e a
 * `crypto.randomUUID`. É o que as rotas e o futuro job diário (ver `docs/domain/renda-mei.md`)
 * consomem.
 */
export function getIncomeService(): IncomeService {
  service ??= createIncomeService({
    repo: createPrismaIncomeRepository(prisma),
    ledger: getLedgerService(),
    clock: () => new Date(),
    newId: () => randomUUID(),
  })
  return service
}

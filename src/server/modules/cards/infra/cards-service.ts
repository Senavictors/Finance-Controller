import { randomUUID } from 'node:crypto'
import { prisma } from '@/server/db'
import { getLedgerService } from '@/server/modules/ledger/service'
import { createCardsService, type CardsService } from '../application/cards-service'
import { PrismaCardsRepository } from './prisma-cards-repository'

let service: CardsService | undefined

/** Serviço de cartões ligado ao Prisma real, ao ledger real, ao relógio do sistema e a `randomUUID`. */
export function getCardsService(): CardsService {
  service ??= createCardsService({
    ledger: getLedgerService(),
    repo: new PrismaCardsRepository(prisma),
    clock: () => new Date(),
    uuid: () => randomUUID(),
  })
  return service
}

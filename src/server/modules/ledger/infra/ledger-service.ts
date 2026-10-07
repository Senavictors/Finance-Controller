import { randomUUID } from 'node:crypto'
import { prisma } from '@/server/db'
import { createLedgerService, type LedgerService } from '../application/ledger-service'
import { PrismaLedgerRepository } from './prisma-ledger-repository'

let service: LedgerService | undefined

/** Serviço do ledger ligado ao Prisma real, relógio do sistema e `crypto.randomUUID`. */
export function getLedgerService(): LedgerService {
  service ??= createLedgerService({
    repo: new PrismaLedgerRepository(prisma),
    clock: () => new Date(),
    uuid: () => randomUUID(),
  })
  return service
}

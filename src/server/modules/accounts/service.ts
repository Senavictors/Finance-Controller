import { randomUUID } from 'node:crypto'

import { prisma } from '@/server/db'
import { getLedgerService } from '@/server/modules/ledger/service'

import { createAccountsService, type AccountsService } from './application/accounts-service'
import { createPrismaAccountRepository } from './infra/prisma-account-repository'

let service: AccountsService | undefined

/**
 * Serviço de contas ligado ao Prisma real, ao ledger real e ao relógio do sistema. Separado de
 * `./index` para que testes com repositório em memória não carreguem o cliente do banco.
 */
export function getAccountsService(): AccountsService {
  service ??= createAccountsService({
    accounts: createPrismaAccountRepository(prisma),
    ledger: getLedgerService(),
    clock: () => new Date(),
    newId: () => randomUUID(),
  })
  return service
}

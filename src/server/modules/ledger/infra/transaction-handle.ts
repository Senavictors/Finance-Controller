import type { Prisma } from '@/generated/prisma/client'
import type { TransactionHandle } from '../application/ports'

/**
 * Implementações do handle opaco da transação do ledger (`TransactionHandle`).
 * Outros módulos NÃO importam este arquivo: usam `prismaClientOf`/`memoryTxOf`, reexportados
 * por `@/server/modules/ledger` (API pública). Este arquivo só tem `import type` do Prisma.
 */

/** Handle da transação interativa do Prisma aberta pelo `PrismaLedgerRepository`. */
export class PrismaTransactionHandle implements TransactionHandle {
  readonly backend = 'prisma' as const
  constructor(readonly client: Prisma.TransactionClient) {}
}

/** Handle da transação em memória: permite a outro repositório em memória entrar no rollback. */
export class InMemoryTransactionHandle implements TransactionHandle {
  readonly backend = 'memory' as const
  constructor(private readonly register: (undo: () => void) => void) {}

  /**
   * Registra como desfazer uma escrita do módulo consumidor. Se a unit of work falhar, os
   * callbacks rodam na ordem inversa do registro, junto com o rollback do ledger.
   * Chame DEPOIS de aplicar a escrita (ou antes, desde que o undo seja seguro).
   */
  onRollback(undo: () => void): void {
    this.register(undo)
  }
}

/**
 * Cliente transacional entregue a outros módulos: o `Prisma.TransactionClient` sem os delegates
 * `transaction` e `accountBalance` (o ledger é o único dono dessas tabelas; leia por
 * `uow.listTransactions`/`findTransaction`). `$queryRaw`/`$executeRaw` continuam no tipo e a
 * proibição de SQL de escrita nessas tabelas fica com o guard `ledger-boundaries`.
 */
export type ConsumerTransactionClient = Omit<
  Prisma.TransactionClient,
  'transaction' | 'accountBalance'
>

/**
 * Cliente transacional do Prisma da unit of work, para o repositório Prisma de outro módulo
 * escrever as próprias tabelas na mesma transação. Lança se o handle não for do Prisma.
 * Não use para escrever em `transactions`/`account_balances` (guard `ledger-boundaries`).
 */
export function prismaClientOf(handle: TransactionHandle): ConsumerTransactionClient {
  if (handle instanceof PrismaTransactionHandle) return handle.client
  throw new Error(
    `TransactionHandle "${handle.backend}" não é do Prisma: use o repositório em memória do módulo.`,
  )
}

/** Handle em memória (testes). Lança se o handle for do Prisma. */
export function memoryTxOf(handle: TransactionHandle): InMemoryTransactionHandle {
  if (handle instanceof InMemoryTransactionHandle) return handle
  throw new Error(
    `TransactionHandle "${handle.backend}" não é em memória: use o repositório Prisma do módulo.`,
  )
}

/**
 * Atalho para repositórios em memória de outros módulos: registra o `undo` no rollback da
 * unit of work. Com handle do Prisma não faz nada (o banco desfaz sozinho). Sem handle
 * (escrita fora de unit of work) também não faz nada.
 */
export function onRollback(handle: TransactionHandle | undefined, undo: () => void): void {
  if (handle instanceof InMemoryTransactionHandle) handle.onRollback(undo)
}

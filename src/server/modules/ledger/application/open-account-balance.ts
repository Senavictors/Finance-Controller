import type { AccountPosition } from '../domain/types'
import type { LedgerContext, LedgerDeps } from './ports'
import { loadAccount, positionsFor } from './shared'

/**
 * Cria a linha de `AccountBalance` da conta, zerada (idempotente: se já existe, não altera).
 * É o único jeito de outro módulo (contas) garantir a linha do cache sem escrever em
 * `account_balances`. A conta precisa existir e ser do usuário (numa unit of work, pode ter
 * sido criada milissegundos antes, na mesma transação, pelo repositório do módulo de contas).
 */
export async function openAccountBalance(
  deps: LedgerDeps,
  ctx: LedgerContext,
  accountId: string,
): Promise<AccountPosition> {
  return deps.repo.withTransaction(async (tx) => {
    await loadAccount(tx, ctx.userId, accountId)
    await tx.ensureBalance(ctx.userId, accountId)
    const [position] = await positionsFor(tx, ctx.userId, [accountId])
    return position!
  })
}

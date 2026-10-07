import { AsyncLocalStorage } from 'node:async_hooks'
import { LedgerError } from '../domain/types'

/**
 * Marca "estamos dentro da transação do ledger" ao longo da cadeia assíncrona da `fn`.
 * Abrir outra transação (`ledger.runInTransaction` ou qualquer método do serviço) de dentro
 * da `fn` pegaria outra conexão e esperaria para sempre os locks da primeira (até o timeout
 * de 15 s, com erro cru do Prisma) ou, pior, confirmaria depois do rollback externo. Em vez
 * disso lançamos `LEDGER_NESTED_TRANSACTION` na hora. Dentro da unit of work use `uow.*`.
 *
 * Os repositórios (Prisma e memória) envolvem `withTransaction` nesta guarda. O `afterLedgerMutation`
 * roda depois do commit, já fora do escopo, então pode chamar o ledger livremente.
 */
const scope = new AsyncLocalStorage<true>()

export function runInLedgerTransactionScope<T>(fn: () => Promise<T>): Promise<T> {
  if (scope.getStore() === true) {
    return Promise.reject(
      new LedgerError(
        'LEDGER_NESTED_TRANSACTION',
        'Transação do ledger aninhada: dentro de runInTransaction use as operações do uow, não o serviço.',
      ),
    )
  }
  return scope.run(true, fn)
}

import { describe, expect, it } from 'vitest'
import { LedgerError } from '../domain/types'
import {
  cachedBuckets,
  day,
  expectCacheMatchesLedger,
  ledgerErrorCode,
  makeLedgerEnv,
  type LedgerEnv,
} from './test-helpers'

/**
 * FC2-F1-01, ciclo de correção 1 (B1/I1): mutações simultâneas sobre o MESMO lançamento (duplo
 * clique, retry, bot + UI) e sobre as duas pernas de um par. O repositório em memória não
 * serializa leituras (como o READ COMMITTED do Postgres) e simula o lock de linha; sem
 * `lockTxns` o delta seria aplicado duas vezes e o cache divergiria do ledger.
 */

async function seedExpense(env: LedgerEnv, status: 'CLEARED' | 'PENDING' = 'CLEARED') {
  await env.svc.createTransaction(env.ctx, {
    accountId: 'acc-a',
    kind: 'INCOME',
    amount: 5000,
    date: day('2026-10-01'),
    description: 'Base',
  })
  return env.svc.createTransaction(env.ctx, {
    accountId: 'acc-a',
    kind: 'EXPENSE',
    amount: 1000,
    status,
    date: day('2026-10-02'),
    description: 'Alvo',
  })
}

async function seedTransfer(env: LedgerEnv) {
  await env.svc.createTransaction(env.ctx, {
    accountId: 'acc-a',
    kind: 'ADJUSTMENT',
    amount: 100000,
    date: day('2026-10-01'),
    description: 'Saldo inicial',
    excludeFromBudget: true,
  })
  return env.svc.createTransfer(env.ctx, {
    sourceAccountId: 'acc-a',
    destinationAccountId: 'acc-b',
    amount: 10000,
    date: day('2026-10-05'),
    description: 'Transferência',
  })
}

describe('mutações concorrentes no mesmo lançamento', () => {
  it('DELETE x2: um apaga, o outro recebe 404; o saldo reverte uma única vez', async () => {
    const env = makeLedgerEnv()
    const t = await seedExpense(env)
    const id = t.transaction.id
    const outcomes = await Promise.allSettled([
      env.svc.deleteTransaction(env.ctx, id),
      env.svc.deleteTransaction(env.ctx, id),
    ])
    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1)
    const rejected = outcomes.find((o) => o.status === 'rejected') as PromiseRejectedResult
    expect((rejected.reason as LedgerError).code).toBe('LEDGER_TXN_NOT_FOUND')
    expect(cachedBuckets(env.repo, 'acc-a').cleared).toBe(5000)
    expectCacheMatchesLedger(env.repo)
  })

  it('status PENDING -> CLEARED x2: o segundo vê o estado commitado e não duplica o delta', async () => {
    const env = makeLedgerEnv()
    const t = await seedExpense(env, 'PENDING')
    await Promise.all([
      env.svc.changeTransactionStatus(env.ctx, t.transaction.id, 'CLEARED'),
      env.svc.changeTransactionStatus(env.ctx, t.transaction.id, 'CLEARED'),
    ])
    expect(cachedBuckets(env.repo, 'acc-a')).toEqual({ cleared: 4000, pending: 0, planned: 0 })
    expectCacheMatchesLedger(env.repo)
  })

  it('3 PATCH de valor simultâneos: vence a última escrita e o cache acompanha o ledger', async () => {
    const env = makeLedgerEnv()
    const t = await seedExpense(env)
    await Promise.all([
      env.svc.updateTransaction(env.ctx, t.transaction.id, { amount: 2000 }),
      env.svc.updateTransaction(env.ctx, t.transaction.id, { amount: 3000 }),
      env.svc.updateTransaction(env.ctx, t.transaction.id, { amount: 4000 }),
    ])
    expect(env.repo.txns.get(t.transaction.id)?.amount).toBe(-4000)
    expect(cachedBuckets(env.repo, 'acc-a').cleared).toBe(1000)
    expectCacheMatchesLedger(env.repo)
  })

  it('PATCH x DELETE: o cache nunca sobra com delta de um lançamento já apagado', async () => {
    const env = makeLedgerEnv()
    const t = await seedExpense(env)
    await Promise.allSettled([
      env.svc.updateTransaction(env.ctx, t.transaction.id, { amount: 2000 }),
      env.svc.deleteTransaction(env.ctx, t.transaction.id),
    ])
    expect(env.repo.txns.has(t.transaction.id)).toBe(false)
    expect(cachedBuckets(env.repo, 'acc-a').cleared).toBe(5000)
    expectCacheMatchesLedger(env.repo)
  })

  it('DELETE que apaga menos linhas que o esperado aborta com LEDGER_CONCURRENT_UPDATE', async () => {
    const env = makeLedgerEnv()
    const t = await seedExpense(env)
    // Simula um repositório cujo lock não segurou: o delete encontra a linha já removida.
    const realWithTransaction = env.repo.withTransaction.bind(env.repo)
    env.repo.withTransaction = (fn) =>
      realWithTransaction(async (tx) => {
        const original = tx.deleteTxns.bind(tx)
        tx.deleteTxns = async (userId, ids) => {
          await original(userId, ids)
          return 0
        }
        return fn(tx)
      })
    const code = await ledgerErrorCode(() => env.svc.deleteTransaction(env.ctx, t.transaction.id))
    expect(code).toBe('LEDGER_CONCURRENT_UPDATE')
    // Rollback integral: lançamento e saldo intactos.
    expect(env.repo.txns.has(t.transaction.id)).toBe(true)
    expect(cachedBuckets(env.repo, 'acc-a').cleared).toBe(4000)
  })
})

describe('mutações concorrentes nas duas pernas de um par (I1)', () => {
  it('edições simultâneas de valor em pernas opostas não travam e mantêm o par somando zero', async () => {
    const env = makeLedgerEnv()
    const pair = await seedTransfer(env)
    await Promise.all([
      env.svc.updateTransaction(env.ctx, pair.outgoing.id, { amount: 15000 }),
      env.svc.updateTransaction(env.ctx, pair.incoming.id, { amount: 20000 }),
    ])
    const out = env.repo.txns.get(pair.outgoing.id)!
    const inc = env.repo.txns.get(pair.incoming.id)!
    expect(out.amount + inc.amount).toBe(0)
    expect(cachedBuckets(env.repo, 'acc-b').cleared).toBe(inc.amount)
    expectCacheMatchesLedger(env.repo)
  })

  it('status e DELETE em pernas opostas: ou o par some inteiro ou fica consistente', async () => {
    const env = makeLedgerEnv()
    const pair = await seedTransfer(env)
    await Promise.allSettled([
      env.svc.changeTransactionStatus(env.ctx, pair.outgoing.id, 'PENDING'),
      env.svc.deleteTransaction(env.ctx, pair.incoming.id),
      env.svc.updateTransaction(env.ctx, pair.incoming.id, { description: 'Renomeada' }),
    ])
    const legs = [...env.repo.txns.values()].filter((t) => t.transferId === pair.transferId)
    expect([0, 2]).toContain(legs.length)
    expectCacheMatchesLedger(env.repo)
  })

  it('rajada de 20 mutações misturadas sobre o mesmo par mantém cache == ledger', async () => {
    const env = makeLedgerEnv()
    const pair = await seedTransfer(env)
    const ops = Array.from({ length: 20 }, (_, i) => {
      const id = i % 2 === 0 ? pair.outgoing.id : pair.incoming.id
      return i % 5 === 0
        ? env.svc.changeTransactionStatus(env.ctx, id, i % 10 === 0 ? 'PENDING' : 'CLEARED')
        : env.svc.updateTransaction(env.ctx, id, { amount: 1000 + i })
    })
    await Promise.allSettled(ops)
    expectCacheMatchesLedger(env.repo)
  })
})

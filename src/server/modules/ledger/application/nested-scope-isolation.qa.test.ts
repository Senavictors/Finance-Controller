import { describe, expect, it } from 'vitest'
import { isLedgerError } from '../index'
import { cachedBuckets, day, expectCacheMatchesLedger, makeLedgerEnv } from '../testing'

// QA (FC2-F1-09, re-revisão): o escopo do LEDGER_NESTED_TRANSACTION (AsyncLocalStorage) não pode
// vazar para requisições independentes que rodam concorrentemente com uma unit of work aberta.

function gate() {
  let open!: () => void
  const promise = new Promise<void>((resolve) => {
    open = resolve
  })
  return { promise, open }
}

const income = (accountId: string, amount: number, description: string) => ({
  accountId,
  kind: 'INCOME' as const,
  amount,
  date: day('2026-10-05'),
  description,
})

describe('LEDGER_NESTED_TRANSACTION não vaza entre requisições independentes', () => {
  it('chamada do serviço iniciada fora da cadeia da fn, enquanto a uow está aberta, funciona', async () => {
    const env = makeLedgerEnv()
    const g = gate()
    const entered = gate()

    const outer = env.svc.runInTransaction(env.ctx, async (uow) => {
      await uow.createTransaction(income('acc-a', 100, 'externa'))
      entered.open()
      await g.promise
    })
    await entered.promise

    // "Outra requisição": cadeia assíncrona independente (conta diferente, sem disputa de lock).
    const other = await env.svc.createTransaction(env.ctx, income('acc-b', 200, 'outra requisicao'))
    const otherUow = await env.svc.runInTransaction(env.ctx, (uow) =>
      uow.createTransaction(income('acc-sav', 300, 'outra uow')),
    )
    expect(other.transaction.amount).toBe(200)
    expect(otherUow.transaction.amount).toBe(300)

    g.open()
    await outer
    expect(env.repo.txns.size).toBe(3)
    expect(cachedBuckets(env.repo, 'acc-a')).toEqual({ cleared: 100, pending: 0, planned: 0 })
    expectCacheMatchesLedger(env.repo)
  })

  it('timers/callbacks agendados dentro da fn herdam o escopo (e são barrados); fora, não', async () => {
    const env = makeLedgerEnv()
    let inner: unknown
    await env.svc.runInTransaction(env.ctx, async () => {
      await new Promise<void>((resolve) => {
        setTimeout(() => {
          env.svc
            .createTransaction(env.ctx, income('acc-a', 1, 'timer'))
            .catch((e: unknown) => {
              inner = e
            })
            .finally(resolve)
        }, 0)
      })
    })
    expect(isLedgerError(inner) && inner.code).toBe('LEDGER_NESTED_TRANSACTION')
    expect(env.repo.txns.size).toBe(0)

    // Depois do fim da uow o escopo some: o serviço volta a funcionar na mesma "requisição".
    const after = await env.svc.createTransaction(env.ctx, income('acc-a', 5, 'depois'))
    expect(after.transaction.amount).toBe(5)
  })

  it('uow que falha por aninhamento não deixa o escopo "preso" para as próximas', async () => {
    const env = makeLedgerEnv()
    for (let i = 0; i < 3; i++) {
      await expect(
        env.svc.runInTransaction(env.ctx, async () => {
          await env.svc.createTransaction(env.ctx, income('acc-a', 1, 'interna'))
        }),
      ).rejects.toMatchObject({ code: 'LEDGER_NESTED_TRANSACTION' })
    }
    const ok = await env.svc.runInTransaction(env.ctx, (uow) =>
      uow.createTransaction(income('acc-a', 7, 'ok')),
    )
    expect(ok.transaction.amount).toBe(7)
    expect(env.repo.txns.size).toBe(1)
  })

  it('várias uows concorrentes independentes (contas distintas) não se bloqueiam como aninhadas', async () => {
    const env = makeLedgerEnv()
    const accounts = ['acc-a', 'acc-b', 'acc-sav']
    const results = await Promise.allSettled(
      Array.from({ length: 30 }, (_, i) =>
        env.svc.runInTransaction(env.ctx, async (uow) => {
          await new Promise((resolve) => setTimeout(resolve, i % 3))
          return uow.createTransaction(income(accounts[i % 3]!, 10, `c${i}`))
        }),
      ),
    )
    expect(results.filter((r) => r.status === 'rejected')).toEqual([])
    expect(env.repo.txns.size).toBe(30)
    expectCacheMatchesLedger(env.repo)
  })
})

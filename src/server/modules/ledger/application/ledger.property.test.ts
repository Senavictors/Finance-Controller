import { describe, expect, it } from 'vitest'
import { TXN_STATUSES, isLedgerError, type LedgerTxn, type TxnStatus } from '../domain/types'
import { day, expectCacheMatchesLedger, makeLedgerEnv, type LedgerEnv } from './test-helpers'

/** PRNG determinístico (mulberry32): sem dependência nova, semente fixa. */
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const ACCOUNTS = ['acc-a', 'acc-b', 'acc-sav', 'acc-card', 'acc-old']
const FLOW_KINDS = ['EXPENSE', 'INCOME', 'FEE', 'INTEREST', 'ADJUSTMENT'] as const
const STATUSES_NO_RECONCILED = ['PLANNED', 'PENDING', 'CLEARED'] as const

function assertPairs(env: LedgerEnv) {
  const byTransfer = new Map<string, LedgerTxn[]>()
  for (const txn of env.repo.txns.values()) {
    if (txn.transferId)
      byTransfer.set(txn.transferId, [...(byTransfer.get(txn.transferId) ?? []), txn])
  }
  for (const [transferId, legs] of byTransfer) {
    expect(legs, `par ${transferId}`).toHaveLength(2)
    expect(legs[0].amount + legs[1].amount).toBe(0)
    expect(legs[0].accountId).not.toBe(legs[1].accountId)
  }
}

async function runSequence(seed: number, operations: number) {
  const env = makeLedgerEnv()
  const rand = mulberry32(seed)
  const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)]
  const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1))
  const randomTxn = () => {
    const all = [...env.repo.txns.values()]
    return all.length === 0 ? undefined : pick(all)
  }
  const counts = { ok: 0, rejected: 0 }

  for (let i = 0; i < operations; i++) {
    const roll = rand()
    try {
      if (roll < 0.35) {
        const kind = pick(FLOW_KINDS)
        const amount = int(1, 500) * 100
        await env.svc.createTransaction(env.ctx, {
          accountId: pick(ACCOUNTS),
          kind,
          amount: kind === 'ADJUSTMENT' && rand() < 0.5 ? -amount : amount,
          date: day(`2026-10-${String(int(1, 28)).padStart(2, '0')}`),
          description: `op ${i}`,
          status: pick(STATUSES_NO_RECONCILED),
        })
      } else if (roll < 0.5) {
        const source = pick(ACCOUNTS)
        const destination = pick(ACCOUNTS)
        await env.svc.createTransfer(env.ctx, {
          sourceAccountId: source,
          destinationAccountId: destination,
          amount: int(1, 300) * 100,
          date: day('2026-10-10'),
          description: `transferência ${i}`,
          status: pick(STATUSES_NO_RECONCILED),
          kind: destination === 'acc-card' && rand() < 0.7 ? 'CARD_PAYMENT' : 'TRANSFER',
        })
      } else if (roll < 0.65) {
        const target = randomTxn()
        if (target)
          await env.svc.updateTransaction(env.ctx, target.id, { amount: int(1, 500) * 100 })
      } else if (roll < 0.75) {
        const target = randomTxn()
        if (target) {
          await env.svc.updateTransaction(env.ctx, target.id, {
            accountId: pick(ACCOUNTS),
            date: day('2026-10-15'),
          })
        }
      } else if (roll < 0.9) {
        const target = randomTxn()
        // inclui RECONCILED como destino para exercitar travas e conciliação por perna
        if (target)
          await env.svc.changeTransactionStatus(
            env.ctx,
            target.id,
            pick(TXN_STATUSES as readonly TxnStatus[]),
          )
      } else {
        const target = randomTxn()
        if (target) await env.svc.deleteTransaction(env.ctx, target.id)
      }
      counts.ok += 1
    } catch (error) {
      // Rejeições de regra são esperadas (conta arquivada, conciliado, etc.); qualquer outra
      // exceção é bug. Em ambos os casos o invariante abaixo precisa continuar valendo.
      if (!isLedgerError(error)) throw error
      counts.rejected += 1
    }
    expectCacheMatchesLedger(env.repo)
    assertPairs(env)
  }
  return { env, counts }
}

describe('CA-01: AccountBalance == computeBalances(ledger) após sequência aleatória', () => {
  it.each([1, 42, 7_777, 20_261_005, 987_654_321])(
    'semente %i: 200 operações mantêm cache e ledger idênticos',
    async (seed) => {
      const { env, counts } = await runSequence(seed, 200)
      expect(counts.ok).toBeGreaterThan(60)
      expect(env.repo.txns.size).toBeGreaterThan(0)

      // O reparo não encontra deriva alguma (e continua idempotente).
      for (const accountId of ['acc-a', 'acc-b', 'acc-sav', 'acc-card', 'acc-old']) {
        const result = await env.svc.rebuildAccountBalance(env.ctx, accountId)
        expect(result.drifted, `deriva em ${accountId}`).toBe(false)
      }
    },
  )

  it('a mesma semente reproduz exatamente o mesmo estado (determinismo)', async () => {
    const a = await runSequence(99, 120)
    const b = await runSequence(99, 120)
    expect([...a.env.repo.balances.values()]).toEqual([...b.env.repo.balances.values()])
    expect(a.counts).toEqual(b.counts)
  })
})

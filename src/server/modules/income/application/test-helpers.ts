import { OTHER_USER, USER, makeLedgerEnv } from '@/server/modules/ledger/testing'
import { InMemoryIncomeRepository } from '../infra/in-memory-income-repository'
import type { IncomeRuleInput } from '../domain/validation'
import { createIncomeService } from './income-service'
import type { IncomeDeps } from './ports'

export { OTHER_USER, USER }

export const day = (iso: string) => new Date(`${iso}T12:00:00.000Z`)

/** Instante de referência dos testes: quarta-feira 07/10/2026 12:00 em São Paulo. */
export const NOW_ISO = '2026-10-07T15:00:00.000Z'

/**
 * Ambiente de teste de aplicação: ledger e repositório de renda em memória, com contas
 * sintéticas (`pj` BUSINESS, `pf` CHECKING, `card` CREDIT_CARD, `old` arquivada, `other` de
 * outro usuário) e as categorias de sistema. Valores fictícios e redondos.
 */
export function makeIncomeEnv(nowIso: string = NOW_ISO) {
  const ledgerEnv = makeLedgerEnv()
  const { repo: ledgerRepo } = ledgerEnv
  ledgerRepo.addAccount({ id: 'pj', userId: USER, type: 'BUSINESS' })
  ledgerRepo.addAccount({ id: 'pj2', userId: USER, type: 'BUSINESS' })
  ledgerRepo.addAccount({ id: 'pf', userId: USER, type: 'CHECKING', overdraftLimit: 100_000 })
  ledgerRepo.addAccount({ id: 'card', userId: USER, type: 'CREDIT_CARD', creditLimit: 500_000 })
  ledgerRepo.addAccount({ id: 'old', userId: USER, type: 'BUSINESS', isArchived: true })
  ledgerRepo.addAccount({ id: 'other', userId: OTHER_USER, type: 'BUSINESS' })

  const repo = new InMemoryIncomeRepository(ledgerRepo)
  for (const userId of [USER, OTHER_USER]) {
    repo.addCategory(userId, 'renda-mei', `cat-renda-${userId}`)
    repo.addCategory(userId, 'das-mei', `cat-das-${userId}`)
  }

  let now = new Date(nowIso)
  let idSeq = 0
  const deps: IncomeDeps = {
    repo,
    ledger: ledgerEnv.svc,
    clock: () => now,
    newId: () => `id-${String(++idSeq).padStart(4, '0')}`,
  }
  return {
    ...ledgerEnv,
    ledgerRepo,
    incomeRepo: repo,
    deps,
    income: createIncomeService(deps),
    ctx: { userId: USER },
    otherCtx: { userId: OTHER_USER },
    setNow: (iso: string) => {
      now = new Date(iso)
    },
  }
}

export type IncomeEnv = ReturnType<typeof makeIncomeEnv>

/** Regra fictícia: base 3.000,00 + 40,00 por dia (ter-qui), paga no dia 15. */
export function sampleRule(over: Partial<IncomeRuleInput> = {}): IncomeRuleInput {
  return {
    name: 'Renda mensal',
    baseCents: 300_000,
    perDayCents: 4_000,
    weekdays: [2, 3, 4],
    payDay: 15,
    destinationAccountId: 'pj',
    startDate: day('2026-01-01'),
    ...over,
  }
}

import type { LedgerUnitOfWork } from '@/server/modules/ledger'
import { calendarDateInZone } from '../domain/dates'
import { IncomeError } from '../domain/errors'
import { DEFAULT_MEI_ANNUAL_CEILING_CENTS, proportionalCeiling } from '../domain/mei-ceiling'
import {
  buildMeiYearSummary,
  firstActiveMonthOf,
  monthsElapsedIn,
  type MeiYearSummary,
} from '../domain/mei-year'
import { normalizeMeiProfileInput, type MeiProfileInput } from '../domain/validation'
import type {
  IncomeContext,
  IncomeDeps,
  IncomeWarning,
  MeiLedgerRecord,
  MeiProfileRecord,
} from './ports'
import {
  DAS_CATEGORY_KEY,
  computeMeiByMonth,
  resolveWindow,
  syncDasPlanned,
  type SyncSummary,
} from './shared'

function profileNotFound(): IncomeError {
  return new IncomeError(
    'MEI_PROFILE_NOT_FOUND',
    'Perfil do MEI não configurado. Informe o valor do DAS e o teto anual.',
  )
}

async function checkAccount(
  deps: IncomeDeps,
  userId: string,
  accountId: string,
  field: 'dasAccountId' | 'businessAccountId',
  warnings: IncomeWarning[],
): Promise<void> {
  const account = await deps.repo.findAccount(userId, accountId)
  if (!account) {
    throw new IncomeError('INCOME_ACCOUNT_NOT_FOUND', 'Conta não encontrada.', { field })
  }
  if (field === 'businessAccountId' && account.type !== 'BUSINESS') {
    warnings.push({
      code: 'INCOME_ACCOUNT_NOT_BUSINESS',
      message: 'A conta informada para o faturamento do MEI não é do tipo PJ.',
    })
  }
}

export interface UpsertMeiProfileResult {
  profile: MeiProfileRecord
  warnings: IncomeWarning[]
  /** Reconciliação dos previstos de DAS depois da mudança. */
  das: SyncSummary
}

/**
 * Grava o perfil do MEI (teto, DAS, contas). O teto é parâmetro legal editável (padrão
 * 8100000). Valida as contas (404 se de outro usuário) e reajusta os previstos do DAS e o
 * `MeiLedger` do ano corrente na mesma transação.
 */
export async function upsertMeiProfile(
  deps: IncomeDeps,
  ctx: IncomeContext,
  input: MeiProfileInput,
  opts: { now?: Date } = {},
): Promise<UpsertMeiProfileResult> {
  const data = normalizeMeiProfileInput(input, DEFAULT_MEI_ANNUAL_CEILING_CENTS)
  const warnings: IncomeWarning[] = []
  if (data.dasAccountId !== null) {
    await checkAccount(deps, ctx.userId, data.dasAccountId, 'dasAccountId', warnings)
  } else if (data.dasAmountCents > 0) {
    warnings.push({
      code: 'DAS_ACCOUNT_NOT_SET',
      message: 'Sem conta pagadora do DAS: nenhum previsto de DAS será gerado.',
    })
  }
  if (data.businessAccountId !== null) {
    await checkAccount(deps, ctx.userId, data.businessAccountId, 'businessAccountId', warnings)
  }
  const categoryId = await deps.repo.resolveCategoryId(ctx.userId, DAS_CATEGORY_KEY)
  const window = resolveWindow(deps, { now: opts.now })
  const now = opts.now ?? deps.clock()
  const id = deps.newId()

  const { profile, das } = await deps.ledger.runInTransaction(ctx, async (uow) => {
    const existing = await deps.repo.lockProfile(ctx.userId, uow.tx)
    const saved = await deps.repo.upsertProfile(ctx.userId, existing?.id ?? id, data, uow.tx)
    const sync = await syncDasPlanned(uow, { profile: saved, categoryId, window })
    await recomputeMeiLedgerInTransaction(deps, uow, ctx, window.today.getUTCFullYear(), now)
    return { profile: saved, das: sync }
  })
  return { profile, warnings, das }
}

export async function getMeiProfile(
  deps: IncomeDeps,
  ctx: IncomeContext,
): Promise<MeiProfileRecord | null> {
  return deps.repo.findProfile(ctx.userId)
}

export interface MaterializeDasResult extends SyncSummary {
  from: Date
  until: Date
}

/**
 * Materializa os vencimentos do DAS de hoje até `until` (padrão: +90 dias) como `EXPENSE`
 * `PLANNED` idempotentes (`occurrenceKey = das:AAAA-MM-DD`) na conta pagadora do perfil, com
 * vencimento ajustado para o próximo dia útil. Ponto de plug do job diário.
 */
export async function materializeDas(
  deps: IncomeDeps,
  ctx: IncomeContext,
  input: { now?: Date; until?: Date } = {},
): Promise<MaterializeDasResult> {
  const window = resolveWindow(deps, input)
  const categoryId = await deps.repo.resolveCategoryId(ctx.userId, DAS_CATEGORY_KEY)
  const summary = await deps.ledger.runInTransaction(ctx, async (uow) => {
    const profile = await deps.repo.lockProfile(ctx.userId, uow.tx)
    if (!profile) throw profileNotFound()
    return syncDasPlanned(uow, { profile, categoryId, window })
  })
  return { ...summary, from: window.today, until: window.until }
}

/**
 * Recalcula e persiste o `MeiLedger` do ano dentro de uma unit of work (a mesma transação da
 * mudança que o afetou). `null` quando não há perfil (sem teto não há o que gravar).
 */
export async function recomputeMeiLedgerInTransaction(
  deps: IncomeDeps,
  uow: LedgerUnitOfWork,
  ctx: IncomeContext,
  year: number,
  now: Date,
): Promise<MeiLedgerRecord | null> {
  const profile = await deps.repo.lockProfile(ctx.userId, uow.tx)
  if (!profile) return null
  const { byMonth } = await computeMeiByMonth(
    deps,
    (input) => uow.listTransactions(input),
    ctx.userId,
    profile,
    year,
  )
  return deps.repo.upsertMeiLedger(
    {
      userId: ctx.userId,
      year,
      accumulatedCents: byMonth.reduce((sum, value) => sum + value, 0),
      proportionalCeilingCents: proportionalCeiling({
        annualCeiling: profile.annualCeilingCents,
        openedAt: profile.openedAt,
        year,
      }),
      byMonth,
      lastRecomputedAt: now,
    },
    uow.tx,
  )
}

/**
 * Soma, por mês do recebimento (regime de caixa), os `INCOME` `CLEARED|RECONCILED` das contas PJ
 * no ano (a `businessAccountId` do perfil, senão todas as `BUSINESS`), ignorando transferências,
 * ajustes, estornos e previstos, e grava o `MeiLedger`. Idempotente.
 */
export async function recomputeMeiLedger(
  deps: IncomeDeps,
  ctx: IncomeContext,
  input: { year: number; now?: Date },
): Promise<MeiLedgerRecord> {
  if (!Number.isInteger(input.year) || input.year < 2000 || input.year > 2100) {
    throw new IncomeError('INCOME_INVALID_INPUT', 'year inválido.', { field: 'year' })
  }
  const now = input.now ?? deps.clock()
  const record = await deps.ledger.runInTransaction(ctx, (uow) =>
    recomputeMeiLedgerInTransaction(deps, uow, ctx, input.year, now),
  )
  if (!record) throw profileNotFound()
  return record
}

export interface MeiStatus extends MeiYearSummary {
  annualCeilingCents: number
  openedAt: Date | null
  /** Premissas que a UI mostra junto do número. */
  assumptions: {
    regime: 'CASH'
    accountIds: string[]
    firstActiveMonth: number
    monthsElapsed: number
  }
}

/**
 * Situação do teto no ano: acumulado (do ledger, ao vivo), teto proporcional, restante,
 * percentual, nível de alerta, mensagem informativa e projeção de fim de ano. Não grava nada.
 * Informativo: não substitui contador.
 */
export async function getMeiStatus(
  deps: IncomeDeps,
  ctx: IncomeContext,
  input: { year?: number; now?: Date } = {},
): Promise<MeiStatus> {
  const profile = await deps.repo.findProfile(ctx.userId)
  if (!profile) throw profileNotFound()
  const today = calendarDateInZone(input.now ?? deps.clock())
  const year = input.year ?? today.getUTCFullYear()
  const { byMonth, accountIds } = await computeMeiByMonth(
    deps,
    (i) => deps.ledger.listTransactions(ctx, i),
    ctx.userId,
    profile,
    year,
  )
  const summary = buildMeiYearSummary({
    year,
    today,
    annualCeilingCents: profile.annualCeilingCents,
    openedAt: profile.openedAt,
    byMonth,
  })
  return {
    ...summary,
    annualCeilingCents: profile.annualCeilingCents,
    openedAt: profile.openedAt,
    assumptions: {
      regime: 'CASH',
      accountIds,
      firstActiveMonth: firstActiveMonthOf(profile.openedAt, year),
      monthsElapsed: monthsElapsedIn(year, today),
    },
  }
}

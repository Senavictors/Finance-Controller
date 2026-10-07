import { isValidIso } from '../domain/dates'
import { IncomeError } from '../domain/errors'
import {
  normalizeIncomeRuleInput,
  type IncomeRuleInput,
  type NormalizedIncomeRuleInput,
} from '../domain/validation'
import type { IncomeContext, IncomeDeps, IncomeRuleRecord, IncomeWarning } from './ports'
import { INCOME_CATEGORY_KEY, resolveWindow, syncIncomePlanned, type SyncSummary } from './shared'

export interface IncomeRuleResult {
  rule: IncomeRuleRecord
  warnings: IncomeWarning[]
  /** O que a reconciliação dos previstos futuros fez (criou, atualizou, removeu). */
  planned: SyncSummary
}

/** Conta destino: do usuário (404 caso contrário), nunca cartão; fora de `BUSINESS` só avisa. */
async function checkDestinationAccount(
  deps: IncomeDeps,
  userId: string,
  accountId: string,
  warnings: IncomeWarning[],
): Promise<void> {
  const account = await deps.repo.findAccount(userId, accountId)
  if (!account) {
    throw new IncomeError('INCOME_ACCOUNT_NOT_FOUND', 'Conta de destino não encontrada.', {
      field: 'destinationAccountId',
    })
  }
  if (account.type === 'CREDIT_CARD') {
    throw new IncomeError(
      'INCOME_INVALID_INPUT',
      'A renda não pode ser recebida em um cartão de crédito.',
      { field: 'destinationAccountId' },
    )
  }
  if (account.type !== 'BUSINESS') {
    warnings.push({
      code: 'INCOME_ACCOUNT_NOT_BUSINESS',
      message:
        'A conta de destino não é do tipo PJ: o faturamento do MEI só conta recebimentos em contas PJ.',
    })
  }
}

async function categoryWarning(
  deps: IncomeDeps,
  userId: string,
  warnings: IncomeWarning[],
): Promise<string | null> {
  const categoryId = await deps.repo.resolveCategoryId(userId, INCOME_CATEGORY_KEY)
  if (categoryId === null) {
    warnings.push({
      code: 'CATEGORY_NOT_FOUND',
      message: `Categoria "${INCOME_CATEGORY_KEY}" não encontrada: os previstos ficam sem categoria.`,
    })
  }
  return categoryId
}

/**
 * Cria a regra e já materializa os previstos do horizonte (idempotente). Valida os campos
 * (400), a conta (404 se de outro usuário) e avisa quando a conta não é PJ.
 */
export async function createIncomeRule(
  deps: IncomeDeps,
  ctx: IncomeContext,
  input: IncomeRuleInput,
  opts: { now?: Date } = {},
): Promise<IncomeRuleResult> {
  const data = normalizeIncomeRuleInput(input)
  const warnings: IncomeWarning[] = []
  await checkDestinationAccount(deps, ctx.userId, data.destinationAccountId, warnings)
  const categoryId = await categoryWarning(deps, ctx.userId, warnings)
  const id = deps.newId()
  const window = resolveWindow(deps, { now: opts.now })

  const { rule, planned } = await deps.ledger.runInTransaction(ctx, async (uow) => {
    const inserted = await deps.repo.insertRule(
      { id, userId: ctx.userId, ...data, isActive: true },
      uow.tx,
    )
    const summary = await syncIncomePlanned(uow, { rules: [inserted], categoryId, window })
    return { rule: inserted, planned: summary }
  })
  return { rule, warnings, planned }
}

export type UpdateIncomeRuleInput = Partial<IncomeRuleInput> & { isActive?: boolean }

/**
 * Atualiza a regra e RECALCULA os previstos futuros dela (valor, data, remoção dos que deixaram
 * de existir). Previstos já confirmados e campos travados pelo usuário não são tocados.
 */
export async function updateIncomeRule(
  deps: IncomeDeps,
  ctx: IncomeContext,
  id: string,
  patch: UpdateIncomeRuleInput,
  opts: { now?: Date } = {},
): Promise<IncomeRuleResult> {
  const warnings: IncomeWarning[] = []
  const categoryId = await categoryWarning(deps, ctx.userId, warnings)
  const window = resolveWindow(deps, { now: opts.now })

  const { rule, planned, accountWarnings } = await deps.ledger.runInTransaction(
    ctx,
    async (uow) => {
      const [current] = await deps.repo.lockRules(ctx.userId, { ruleId: id }, uow.tx)
      if (!current) throw ruleNotFound()
      const merged = mergeRule(current, patch)
      const accountWarnings: IncomeWarning[] = []
      if (merged.destinationAccountId !== current.destinationAccountId) {
        await checkDestinationAccount(
          deps,
          ctx.userId,
          merged.destinationAccountId,
          accountWarnings,
        )
      }
      const updated = await deps.repo.updateRule(
        ctx.userId,
        id,
        { ...merged, isActive: patch.isActive ?? current.isActive },
        uow.tx,
      )
      const summary = await syncIncomePlanned(uow, { rules: [updated], categoryId, window })
      return { rule: updated, planned: summary, accountWarnings }
    },
  )
  return { rule, warnings: [...warnings, ...accountWarnings], planned }
}

/** Desativa a regra (histórico preservado) e remove os previstos futuros dela. */
export async function archiveIncomeRule(
  deps: IncomeDeps,
  ctx: IncomeContext,
  id: string,
  opts: { now?: Date } = {},
): Promise<IncomeRuleResult> {
  const categoryId = await deps.repo.resolveCategoryId(ctx.userId, INCOME_CATEGORY_KEY)
  const window = resolveWindow(deps, { now: opts.now })
  const { rule, planned } = await deps.ledger.runInTransaction(ctx, async (uow) => {
    const [current] = await deps.repo.lockRules(ctx.userId, { ruleId: id }, uow.tx)
    if (!current) throw ruleNotFound()
    const updated = await deps.repo.updateRule(ctx.userId, id, { isActive: false }, uow.tx)
    const summary = await syncIncomePlanned(uow, { rules: [updated], categoryId, window })
    return { rule: updated, planned: summary }
  })
  return { rule, warnings: [], planned }
}

/**
 * Grava (`present: true|false`) ou remove (`null`) o ajuste de presença de uma data e
 * recalcula os previstos afetados. `true` inclui um dia fora da regra; `false` remove um dia
 * que contaria.
 */
export async function setAttendanceOverride(
  deps: IncomeDeps,
  ctx: IncomeContext,
  input: { ruleId: string; date: string; present: boolean | null },
  opts: { now?: Date } = {},
): Promise<IncomeRuleResult> {
  if (!isValidIso(input.date)) {
    throw new IncomeError('INCOME_INVALID_INPUT', `Data inválida: ${input.date}.`, {
      field: 'date',
    })
  }
  if (input.present !== null && typeof input.present !== 'boolean') {
    throw new IncomeError('INCOME_INVALID_INPUT', 'present deve ser true, false ou null.', {
      field: 'present',
    })
  }
  const categoryId = await deps.repo.resolveCategoryId(ctx.userId, INCOME_CATEGORY_KEY)
  const window = resolveWindow(deps, { now: opts.now })
  const { rule, planned } = await deps.ledger.runInTransaction(ctx, async (uow) => {
    const [current] = await deps.repo.lockRules(ctx.userId, { ruleId: input.ruleId }, uow.tx)
    if (!current) throw ruleNotFound()
    const overrides = { ...current.attendanceOverrides }
    if (input.present === null) delete overrides[input.date]
    else overrides[input.date] = input.present
    const updated = await deps.repo.updateRule(
      ctx.userId,
      input.ruleId,
      { attendanceOverrides: overrides },
      uow.tx,
    )
    const summary = await syncIncomePlanned(uow, { rules: [updated], categoryId, window })
    return { rule: updated, planned: summary }
  })
  return { rule, warnings: [], planned }
}

export async function listIncomeRules(
  deps: IncomeDeps,
  ctx: IncomeContext,
  opts: { activeOnly?: boolean } = {},
): Promise<IncomeRuleRecord[]> {
  return deps.repo.listRules(ctx.userId, opts)
}

export async function getIncomeRule(
  deps: IncomeDeps,
  ctx: IncomeContext,
  id: string,
): Promise<IncomeRuleRecord> {
  const rule = await deps.repo.findRule(ctx.userId, id)
  if (!rule) throw ruleNotFound()
  return rule
}

function ruleNotFound(): IncomeError {
  return new IncomeError('INCOME_RULE_NOT_FOUND', 'Regra de renda não encontrada.')
}

/** Aplica o patch sobre a regra atual e revalida tudo pelo mesmo caminho da criação. */
function mergeRule(
  current: IncomeRuleRecord,
  patch: UpdateIncomeRuleInput,
): NormalizedIncomeRuleInput {
  return normalizeIncomeRuleInput({
    name: patch.name ?? current.name,
    baseCents: patch.baseCents ?? current.baseCents,
    perDayCents: patch.perDayCents ?? current.perDayCents,
    weekdays: patch.weekdays ?? current.weekdays,
    payDay: patch.payDay ?? current.payDay,
    paymentAdjust: patch.paymentAdjust ?? current.paymentAdjust,
    additionalBasis: patch.additionalBasis ?? current.additionalBasis,
    destinationAccountId: patch.destinationAccountId ?? current.destinationAccountId,
    extraDaysOff: patch.extraDaysOff ?? current.extraDaysOff,
    attendanceOverrides: patch.attendanceOverrides ?? current.attendanceOverrides,
    startDate: patch.startDate ?? current.startDate,
    endDate: patch.endDate === undefined ? current.endDate : patch.endDate,
  })
}

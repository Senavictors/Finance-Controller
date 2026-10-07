import type { MeiProfileInput, IncomeRuleInput } from '../domain/validation'
import {
  confirmIncomeReceipt,
  materializeIncome,
  projectIncome,
  type ConfirmIncomeReceiptInput,
} from './income'
import {
  getMeiProfile,
  getMeiStatus,
  materializeDas,
  recomputeMeiLedger,
  upsertMeiProfile,
} from './mei'
import type { IncomeContext, IncomeDeps } from './ports'
import {
  archiveIncomeRule,
  createIncomeRule,
  getIncomeRule,
  listIncomeRules,
  setAttendanceOverride,
  updateIncomeRule,
  type UpdateIncomeRuleInput,
} from './rules'

/**
 * Fachada com as dependências ligadas: é o que rotas, bot, MCP e jobs consomem (ADR-025).
 * Cada método recebe `{ userId }` como primeiro argumento.
 */
export function createIncomeService(deps: IncomeDeps) {
  return {
    createIncomeRule: (ctx: IncomeContext, input: IncomeRuleInput) =>
      createIncomeRule(deps, ctx, input),
    updateIncomeRule: (ctx: IncomeContext, id: string, patch: UpdateIncomeRuleInput) =>
      updateIncomeRule(deps, ctx, id, patch),
    archiveIncomeRule: (ctx: IncomeContext, id: string) => archiveIncomeRule(deps, ctx, id),
    setAttendanceOverride: (
      ctx: IncomeContext,
      input: { ruleId: string; date: string; present: boolean | null },
    ) => setAttendanceOverride(deps, ctx, input),
    listIncomeRules: (ctx: IncomeContext, opts?: { activeOnly?: boolean }) =>
      listIncomeRules(deps, ctx, opts),
    getIncomeRule: (ctx: IncomeContext, id: string) => getIncomeRule(deps, ctx, id),
    /** Renda prevista por período: contrato de leitura da engine Disponível (F3-02) e do Planejar. */
    projectIncome: (ctx: IncomeContext, input: { from: Date; to: Date }) =>
      projectIncome(deps, ctx, input),
    /** Ponto de plug do job diário de renda. */
    materializeIncome: (ctx: IncomeContext, input?: { now?: Date; until?: Date }) =>
      materializeIncome(deps, ctx, input),
    confirmIncomeReceipt: (ctx: IncomeContext, input: ConfirmIncomeReceiptInput) =>
      confirmIncomeReceipt(deps, ctx, input),
    upsertMeiProfile: (ctx: IncomeContext, input: MeiProfileInput) =>
      upsertMeiProfile(deps, ctx, input),
    getMeiProfile: (ctx: IncomeContext) => getMeiProfile(deps, ctx),
    /** Ponto de plug do job diário do DAS. */
    materializeDas: (ctx: IncomeContext, input?: { now?: Date; until?: Date }) =>
      materializeDas(deps, ctx, input),
    recomputeMeiLedger: (ctx: IncomeContext, input: { year: number; now?: Date }) =>
      recomputeMeiLedger(deps, ctx, input),
    getMeiStatus: (ctx: IncomeContext, input?: { year?: number; now?: Date }) =>
      getMeiStatus(deps, ctx, input),
  }
}

export type IncomeService = ReturnType<typeof createIncomeService>

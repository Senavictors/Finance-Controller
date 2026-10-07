/**
 * API pública do módulo `income` (renda MEI, DAS e teto anual; FC2-F1-06) para OUTROS módulos
 * (engine Disponível F3-02, Planejar F3-05, Hoje F3-04, jobs F5). Não importa `@/server/db`:
 * seguro em testes com repositórios em memória. A instância ligada ao Prisma está em
 * `./infra/income-service` (`getIncomeService()`). Documentação: `docs/domain/renda-mei.md`.
 */

// ---- fábrica e contratos de aplicação ----------------------------------------------------
export { createIncomeService, type IncomeService } from './application/income-service'
export type {
  IncomeContext,
  IncomeDeps,
  IncomeRepository,
  IncomeRuleRecord,
  IncomeWarning,
  MeiLedgerRecord,
  MeiProfileRecord,
} from './application/ports'
export type {
  ConfirmIncomeReceiptInput,
  ConfirmIncomeReceiptResult,
  IncomeProjection,
  IncomeProjectionEvent,
  MaterializeIncomeResult,
} from './application/income'
export type { MaterializeDasResult, MeiStatus, UpsertMeiProfileResult } from './application/mei'
export type { IncomeRuleResult, UpdateIncomeRuleInput } from './application/rules'
export type { SyncSummary } from './application/shared'

// ---- domínio puro (cálculo sem I/O) ------------------------------------------------------
export { brazilNationalHolidays, easterSunday, isHoliday, type Holiday } from './domain/holidays'
export {
  adjustToBusinessDay,
  isBusinessDay,
  presentialDays,
  type AttendanceOverrides,
  type BusinessDayRule,
} from './domain/calendar'
export {
  competencePeriod,
  expectedIncome,
  incomeOccurrenceKey,
  paymentDateFor,
  projectIncomeEvents,
  type AdditionalBasis,
  type ExpectedIncome,
  type IncomeEvent,
  type IncomeRuleParams,
} from './domain/income-rule'
export {
  dasCompetence,
  dasDueDate,
  dasOccurrenceKey,
  projectDasEvents,
  type DasEvent,
} from './domain/das'
export {
  DEFAULT_MEI_ANNUAL_CEILING_CENTS,
  ceilingRemaining,
  meiLevel,
  meiMessage,
  projectYearEnd,
  proportionalCeiling,
  type MeiLevel,
  type YearEndProjection,
} from './domain/mei-ceiling'
export { buildMeiYearSummary, type MeiYearSummary } from './domain/mei-year'
export {
  INCOME_ERROR_CODES,
  IncomeError,
  isIncomeError,
  type IncomeErrorCode,
} from './domain/errors'
export type { IncomeRuleInput, MeiProfileInput } from './domain/validation'

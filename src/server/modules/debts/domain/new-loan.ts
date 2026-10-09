/**
 * Planejamento de um contrato novo (RN-01..RN-03, RN-07): valida a entrada por `kind` e monta o
 * `Loan` + cronograma de `LoanInstallment` sem tocar em banco. Domínio puro.
 */
import { toCalendarDate } from './calendar'
import { DebtError } from './errors'
import {
  buildAmortizationSchedule,
  impliedMonthlyRate,
  outstandingBalance,
  priceInstallment,
} from './price'
import { DEFAULT_LATE_FEE_RATE, DEFAULT_LATE_INTEREST_MONTHLY } from './late-charges'
import {
  isInstallmentKind,
  MAX_INSTALLMENT_COUNT,
  MAX_MONTHLY_RATE,
  type LoanKind,
  type StoredInstallmentStatus,
} from './types'

export interface NewLoanInput {
  kind: LoanKind
  name: string
  /** Texto livre do credor (sem documentos: ver `assertNoLongDigits`). */
  lenderName?: string | null
  /** Conta de débito (parcelados), do cheque especial ou do cartão (rotativo). */
  accountId?: string | null
  principalCents?: number
  /** Fração mensal. Parcelados: opcional se `installmentAmountCents` vier (taxa implícita). */
  monthlyRate?: number
  installmentCount?: number
  installmentAmountCents?: number
  firstDueDate?: Date
  contractedAt?: Date | null
  /** Contrato em andamento: as N primeiras parcelas entram como pagas (sem lançamento). */
  alreadyPaidInstallments?: number
  /** Multa por atraso (fração). Padrão 2%. */
  lateFeeRate?: number
  /** Mora mensal (fração). Padrão 1% a.m. */
  lateInterestMonthlyRate?: number
  categoryId?: string | null
  notes?: string | null
}

export interface PlannedInstallment {
  number: number
  dueDate: Date
  principalCents: number
  interestCents: number
  amountCents: number
  status: StoredInstallmentStatus
  paidAt: Date | null
  paidAmountCents: number | null
}

export interface PlannedLoan {
  kind: LoanKind
  name: string
  lenderName: string | null
  accountId: string | null
  principalCents: number
  /** Fração mensal, já com a precisão de armazenamento (6 casas). */
  monthlyRate: number
  installmentCount: number | null
  installmentAmountCents: number | null
  firstDueDate: Date | null
  contractedAt: Date | null
  outstandingCents: number
  lateFeeRate: number
  lateInterestMonthlyRate: number
  categoryId: string | null
  notes: string | null
  /** `true` quando a taxa foi inferida da parcela informada (mostrar como "efetiva"). */
  rateInferred: boolean
}

export interface LoanPlan {
  loan: PlannedLoan
  installments: PlannedInstallment[]
}

const MAX_NAME_LENGTH = 80
const MAX_NOTES_LENGTH = 500

/** Taxa guardada com 6 casas (Decimal(9,6)): o cronograma usa o mesmo valor que será lido. */
export function roundRateForStorage(rate: number): number {
  return Math.round(rate * 1e6) / 1e6
}

/**
 * Multa e mora são guardadas como percentual `Decimal(5,2)` (2 casas): frações cujo percentual
 * tem mais de 2 casas (ex.: 0,01275 = 1,275%) seriam truncadas na gravação. Recusa na entrada.
 */
export function assertPercentPrecision(rate: number, field: string): void {
  const hundredths = rate * 1e4 // percentual em centésimos: 0.0199 -> 199
  if (!Number.isFinite(hundredths) || Math.abs(hundredths - Math.round(hundredths)) > 1e-6) {
    throw new DebtError(
      'DEBT_INVALID_INPUT',
      'Multa e mora aceitam no máximo 2 casas decimais em percentual (ex.: 1,25%).',
      { field },
    )
  }
}

/**
 * Rejeita sequências longas de dígitos (>= 11, ignorando `.`, `-`, `/` e espaços) em texto livre:
 * evita CPF/CNPJ/conta digitados por engano no nome do contrato ou do credor.
 */
export function assertNoLongDigits(value: string, field: string): void {
  const compact = value.replace(/[.\-/\s]/g, '')
  if (/\d{11,}/.test(compact)) {
    throw new DebtError(
      'DEBT_INVALID_INPUT',
      `${field} não pode conter sequências longas de dígitos (CPF, CNPJ ou conta).`,
      { field },
    )
  }
}

function cleanText(value: string | null | undefined, field: string, max: number): string | null {
  if (value === undefined || value === null) return null
  const text = value.trim()
  if (text.length === 0) return null
  if (text.length > max) {
    throw new DebtError('DEBT_INVALID_INPUT', `${field} deve ter no máximo ${max} caracteres.`, {
      field,
    })
  }
  assertNoLongDigits(text, field)
  return text
}

function assertRateRange(rate: number, field = 'monthlyRate'): void {
  if (!Number.isFinite(rate) || rate < 0 || rate > MAX_MONTHLY_RATE) {
    throw new DebtError(
      'DEBT_INVALID_INPUT',
      `Taxa mensal fora da faixa (0% a ${Math.round(MAX_MONTHLY_RATE * 100)}% a.m.).`,
      { field },
    )
  }
}

export function planNewLoan(input: NewLoanInput): LoanPlan {
  const name = cleanText(input.name, 'name', MAX_NAME_LENGTH)
  if (!name)
    throw new DebtError('DEBT_INVALID_INPUT', 'Informe o nome da dívida.', { field: 'name' })
  const lenderName = cleanText(input.lenderName, 'lenderName', MAX_NAME_LENGTH)
  const notes =
    input.notes === undefined || input.notes === null
      ? null
      : input.notes.trim().slice(0, MAX_NOTES_LENGTH) || null

  const lateFeeRate = input.lateFeeRate ?? DEFAULT_LATE_FEE_RATE
  const lateInterestMonthlyRate = input.lateInterestMonthlyRate ?? DEFAULT_LATE_INTEREST_MONTHLY
  if (
    !(lateFeeRate >= 0 && lateFeeRate <= 1) ||
    !(lateInterestMonthlyRate >= 0 && lateInterestMonthlyRate <= 1)
  ) {
    throw new DebtError('DEBT_INVALID_INPUT', 'Multa e mora devem ser frações entre 0 e 1.')
  }
  assertPercentPrecision(lateFeeRate, 'lateFeeRate')
  assertPercentPrecision(lateInterestMonthlyRate, 'lateInterestMonthlyRate')

  const common = {
    kind: input.kind,
    name,
    lenderName,
    accountId: input.accountId ?? null,
    contractedAt: input.contractedAt ? toCalendarDate(input.contractedAt) : null,
    lateFeeRate,
    lateInterestMonthlyRate,
    categoryId: input.categoryId ?? null,
    notes,
  }

  if (!isInstallmentKind(input.kind)) {
    // OVERDRAFT / CARD_REVOLVING: sem cronograma; o saldo vem do ledger/fatura.
    if (!common.accountId) {
      throw new DebtError(
        'DEBT_INVALID_INPUT',
        'Informe a conta do cheque especial ou o cartão do rotativo.',
        { field: 'accountId' },
      )
    }
    if (input.monthlyRate === undefined) {
      throw new DebtError('DEBT_INVALID_INPUT', 'Informe a taxa mensal.', { field: 'monthlyRate' })
    }
    assertRateRange(input.monthlyRate)
    return {
      loan: {
        ...common,
        principalCents: 0,
        monthlyRate: roundRateForStorage(input.monthlyRate),
        installmentCount: null,
        installmentAmountCents: null,
        firstDueDate: null,
        outstandingCents: 0,
        rateInferred: false,
      },
      installments: [],
    }
  }

  // Parcelados (Price)
  const { principalCents, installmentCount, firstDueDate, installmentAmountCents } = input
  if (principalCents === undefined || !Number.isInteger(principalCents) || principalCents <= 0) {
    throw new DebtError('DEBT_INVALID_INPUT', 'Informe o valor contratado em centavos (> 0).', {
      field: 'principalCents',
    })
  }
  if (
    installmentCount === undefined ||
    !Number.isInteger(installmentCount) ||
    installmentCount < 1 ||
    installmentCount > MAX_INSTALLMENT_COUNT
  ) {
    throw new DebtError(
      'DEBT_INVALID_INPUT',
      `Número de parcelas deve estar entre 1 e ${MAX_INSTALLMENT_COUNT}.`,
      { field: 'installmentCount' },
    )
  }
  if (!firstDueDate || Number.isNaN(firstDueDate.getTime())) {
    throw new DebtError('DEBT_INVALID_INPUT', 'Informe o vencimento da 1ª parcela.', {
      field: 'firstDueDate',
    })
  }
  if (
    installmentAmountCents !== undefined &&
    (!Number.isInteger(installmentAmountCents) || installmentAmountCents <= 0)
  ) {
    throw new DebtError(
      'DEBT_INVALID_INPUT',
      'Valor da parcela deve ser um inteiro de centavos (> 0).',
      { field: 'installmentAmountCents' },
    )
  }
  if (input.monthlyRate === undefined && installmentAmountCents === undefined) {
    throw new DebtError(
      'DEBT_INVALID_INPUT',
      'Informe a taxa mensal ou o valor da parcela do contrato.',
      { field: 'monthlyRate' },
    )
  }
  const alreadyPaid = input.alreadyPaidInstallments ?? 0
  if (!Number.isInteger(alreadyPaid) || alreadyPaid < 0 || alreadyPaid >= installmentCount) {
    throw new DebtError(
      'DEBT_INVALID_INPUT',
      'Parcelas já pagas devem ser >= 0 e menores que o total.',
      { field: 'alreadyPaidInstallments' },
    )
  }

  let monthlyRate: number
  let rateInferred = false
  if (input.monthlyRate !== undefined) {
    assertRateRange(input.monthlyRate)
    monthlyRate = roundRateForStorage(input.monthlyRate)
  } else {
    // Só a parcela do contrato: a taxa é inferida (efetiva, inclui seguros e tarifas).
    if (installmentAmountCents! * installmentCount < principalCents) {
      throw new DebtError(
        'DEBT_INCONSISTENT_CONTRACT',
        'A soma das parcelas é menor que o valor contratado.',
        { field: 'installmentAmountCents' },
      )
    }
    monthlyRate = roundRateForStorage(
      impliedMonthlyRate({
        principal: principalCents,
        installmentAmount: installmentAmountCents!,
        installments: installmentCount,
      }),
    )
    assertRateRange(monthlyRate, 'installmentAmountCents')
    rateInferred = true
  }

  const firstDue = toCalendarDate(firstDueDate)
  const schedule = buildAmortizationSchedule({
    principal: principalCents,
    monthlyRate,
    installments: installmentCount,
    firstDueDate: firstDue,
    installmentAmount: installmentAmountCents,
  })

  const installments: PlannedInstallment[] = schedule.map((row) => {
    const paid = row.number <= alreadyPaid
    return {
      number: row.number,
      dueDate: row.dueDate,
      principalCents: row.principal,
      interestCents: row.interest,
      amountCents: row.amount,
      status: paid ? 'PAID' : 'PENDING',
      paidAt: paid ? row.dueDate : null,
      paidAmountCents: paid ? row.amount : null,
    }
  })

  return {
    loan: {
      ...common,
      principalCents,
      monthlyRate,
      installmentCount,
      installmentAmountCents:
        installmentAmountCents ??
        priceInstallment({
          principal: principalCents,
          monthlyRate,
          installments: installmentCount,
        }),
      firstDueDate: firstDue,
      outstandingCents: outstandingBalance(schedule, alreadyPaid),
      rateInferred,
    },
    installments,
  }
}

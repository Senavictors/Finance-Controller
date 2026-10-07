/**
 * Tipos do domínio de dívidas (ADR-028). Espelham `Loan`/`LoanInstallment` sem acoplar ao
 * Prisma: dinheiro em centavos inteiros, taxas como FRAÇÃO (`Decimal` do banco é convertido com
 * `.toNumber()` só na borda do repositório), datas de calendário ao meio-dia UTC.
 */

export const LOAN_KINDS = [
  'CONSIGNADO',
  'PERSONAL',
  'OVERDRAFT',
  'CARD_REVOLVING',
  'CARD_REFINANCE',
  'PIX_CREDIT',
] as const
export type LoanKind = (typeof LOAN_KINDS)[number]

/** Contratos parcelados (Price): têm cronograma de `LoanInstallment`. */
export const INSTALLMENT_KINDS = [
  'CONSIGNADO',
  'PERSONAL',
  'CARD_REFINANCE',
  'PIX_CREDIT',
] as const satisfies readonly LoanKind[]
export type InstallmentLoanKind = (typeof INSTALLMENT_KINDS)[number]

/** Dívidas sem cronograma: custo sobre o saldo em uso (conta de cheque especial / cartão). */
export const REVOLVING_KINDS = [
  'OVERDRAFT',
  'CARD_REVOLVING',
] as const satisfies readonly LoanKind[]
export type RevolvingLoanKind = (typeof REVOLVING_KINDS)[number]

export function isInstallmentKind(kind: LoanKind): kind is InstallmentLoanKind {
  return (INSTALLMENT_KINDS as readonly string[]).includes(kind)
}

export type LoanStatus = 'ACTIVE' | 'PAID_OFF' | 'DEFAULTED'

/** Status persistido da parcela. `OVERDUE` é calculado na leitura (`installmentStatus`). */
export type StoredInstallmentStatus = 'PENDING' | 'PAID' | 'SKIPPED'

/** Limites de validação (ADR-028 "Riscos": taxa digitada errada distorce os custos). */
export const MAX_MONTHLY_RATE = 0.3
export const MAX_INSTALLMENT_COUNT = 120

export interface LoanRecord {
  id: string
  userId: string
  kind: LoanKind
  name: string
  lenderName: string | null
  /** Conta de débito (parcelados) / conta do cheque especial / cartão (rotativo). */
  accountId: string | null
  principalCents: number
  /** Fração mensal (0.02 = 2% a.m.). */
  monthlyRate: number
  installmentCount: number | null
  installmentAmountCents: number | null
  firstDueDate: Date | null
  contractedAt: Date | null
  /** Cache do saldo devedor (parcelados). */
  outstandingCents: number
  /** Multa por atraso como fração (o banco guarda percentual: 2 = 2%). */
  lateFeeRate: number
  /** Juros de mora mensais como fração (o banco guarda percentual: 1 = 1% a.m.). */
  lateInterestMonthlyRate: number
  status: LoanStatus
  categoryId: string | null
  notes: string | null
  createdAt: Date
  updatedAt: Date
}

export interface InstallmentRecord {
  id: string
  loanId: string
  number: number
  dueDate: Date
  principalCents: number
  interestCents: number
  amountCents: number
  status: StoredInstallmentStatus
  paidAt: Date | null
  paidAmountCents: number | null
  lateChargesCents: number
  transactionId: string | null
}

import type { AccountPosition, LedgerTxn, TxnSource } from '@/server/modules/ledger'
import { buildInstallmentSchedule } from '../domain/installments'
import type { CardsContext, CardsDeps, PurchaseRow } from './ports'
import {
  cycleFor,
  draftStatement,
  ensureAndLockStatements,
  loadCard,
  refreshStatement,
  statusFor,
  type StatementSummary,
} from './shared'

export interface CreateCardPurchaseInput {
  accountId: string
  /** Valor TOTAL da compra, centavos (> 0). */
  amount: number
  /** 1 = à vista; até 24. Padrão 1. */
  installmentCount?: number
  /** Data da compra (meio-dia UTC). */
  date: Date
  description: string
  categoryId?: string | null
  merchantId?: string | null
  notes?: string | null
  source?: TxnSource
}

export interface CreatedInstallment {
  installmentNumber: number
  /** Valor da parcela em módulo, centavos. */
  amount: number
  date: Date
  transactionId: string
  statementId: string
  statementKey: string
  status: LedgerTxn['status']
}

export interface CreateCardPurchaseResult {
  purchase: PurchaseRow
  installments: CreatedInstallment[]
  transactions: LedgerTxn[]
  /** Faturas tocadas (totais já recalculados), da mais antiga para a mais nova. */
  statements: StatementSummary[]
  /** Posição do cartão no ledger depois da compra (uso do limite inclui parcelas futuras). */
  position: AccountPosition
  /** Informativo: o novo uso passou do `creditLimit`. Não bloqueia (RN-09). */
  limitWarning?: 'LIMIT_EXCEEDED'
}

/**
 * Compra no cartão (à vista ou parcelada): um lançamento `EXPENSE` negativo por parcela, cada um
 * na fatura do ciclo da data da parcela, mais `CardPurchase`/`CardInstallment` 1:1 com o
 * lançamento, tudo na MESMA transação do ledger (falhou na parcela 2, nada fica gravado).
 *
 * Status (convenção do módulo): data futura => `PLANNED`; data <= hoje em fatura aberta =>
 * `PENDING`; em fatura já fechada => `CLEARED`.
 */
export async function createCardPurchase(
  deps: CardsDeps,
  ctx: CardsContext,
  input: CreateCardPurchaseInput,
): Promise<CreateCardPurchaseResult> {
  const count = input.installmentCount ?? 1
  // Valida valor, quantidade e data antes de abrir a transação.
  const schedule = buildInstallmentSchedule(input.amount, count, input.date)
  const description = input.description.trim()
  const purchaseId = deps.uuid()

  return deps.ledger.runInTransaction(ctx, async (uow) => {
    const card = await loadCard(deps, ctx, input.accountId, uow.tx)

    const cycles = schedule.map((item) => cycleFor(card, item.date))
    const locked = await ensureAndLockStatements(
      deps,
      uow,
      ctx,
      cycles.map((cycle) => draftStatement(ctx, card, cycle, deps.uuid())),
    )

    const purchase: PurchaseRow = {
      id: purchaseId,
      userId: ctx.userId,
      accountId: card.id,
      categoryId: input.categoryId ?? null,
      merchantId: input.merchantId ?? null,
      description,
      notes: input.notes ?? null,
      purchaseDate: schedule[0]!.date,
      totalAmount: input.amount,
      installmentCount: count,
    }
    await deps.repo.insertPurchase(purchase, uow.tx)

    const transactions: LedgerTxn[] = []
    const installments: CreatedInstallment[] = []
    let position: AccountPosition | undefined

    for (const [index, item] of schedule.entries()) {
      const statement = locked.get(cycles[index]!.statementKey)!
      const created = await uow.createTransaction({
        accountId: card.id,
        kind: 'EXPENSE',
        amount: item.amount,
        date: item.date,
        description:
          count > 1 ? `${description} (${item.installmentNumber}/${count})` : description,
        categoryId: input.categoryId ?? null,
        merchantId: input.merchantId ?? null,
        notes: input.notes ?? null,
        status: statusFor(deps, item.date, statement),
        source: input.source,
        statementId: statement.id,
        statementKey: statement.statementKey,
      })
      transactions.push(created.transaction)
      position = created.position
      await deps.repo.insertInstallment(
        {
          id: deps.uuid(),
          purchaseId,
          advanceId: null,
          installmentNumber: item.installmentNumber,
          originalAmount: item.amount,
          originalDate: item.date,
          ledgerTransactionId: created.transaction.id,
        },
        uow.tx,
      )
      installments.push({
        installmentNumber: item.installmentNumber,
        amount: item.amount,
        date: item.date,
        transactionId: created.transaction.id,
        statementId: statement.id,
        statementKey: statement.statementKey,
        status: created.transaction.status,
      })
    }

    const statements: StatementSummary[] = []
    for (const row of [...locked.values()].sort((a, b) =>
      a.statementKey < b.statementKey ? -1 : 1,
    )) {
      statements.push((await refreshStatement(deps, uow, ctx, row)).summary)
    }

    const finalPosition = position!
    const exceeded = finalPosition.warnings.some((w) => w.code === 'CREDIT_LIMIT_EXCEEDED')
    return {
      purchase,
      installments,
      transactions,
      statements,
      position: finalPosition,
      ...(exceeded ? { limitWarning: 'LIMIT_EXCEEDED' as const } : {}),
    }
  })
}

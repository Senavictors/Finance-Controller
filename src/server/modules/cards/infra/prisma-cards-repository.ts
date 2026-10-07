import type { PrismaClient } from '@/generated/prisma/client'
import {
  prismaClientOf,
  type ConsumerTransactionClient,
  type TransactionHandle,
} from '@/server/modules/ledger'
import type {
  AdvanceRow,
  CardAccountRow,
  CardsRepository,
  InstallmentRow,
  NewStatement,
  PurchaseRow,
  PurchaseWithInstallments,
  StatementRow,
  StatementTotalsUpdate,
} from '../application/ports'

/**
 * Implementação Prisma das portas de cartões (FC2-F1-03). Com `tx` (o handle de
 * `ledger.runInTransaction`) as consultas e escritas entram na MESMA transação do ledger; sem
 * `tx` usam o cliente normal. Nunca toca `transactions`/`account_balances` (só o ledger escreve
 * lá: guard `ledger-boundaries`). Toda consulta filtra por `userId`.
 */
export class PrismaCardsRepository implements CardsRepository {
  constructor(private readonly client: PrismaClient) {}

  private db(tx?: TransactionHandle): ConsumerTransactionClient {
    return tx ? prismaClientOf(tx) : (this.client as unknown as ConsumerTransactionClient)
  }

  // ---- contas (leitura) ---------------------------------------------------------------

  async findAccount(userId: string, accountId: string, tx?: TransactionHandle) {
    const row = await this.db(tx).account.findFirst({ where: { id: accountId, userId } })
    return row ? toAccountRow(row) : null
  }

  async listAccounts(userId: string, tx?: TransactionHandle) {
    const rows = await this.db(tx).account.findMany({
      where: { userId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    })
    return rows.map(toAccountRow)
  }

  async listActiveCards(userId: string, tx?: TransactionHandle) {
    const rows = await this.db(tx).account.findMany({
      where: { userId, type: 'CREDIT_CARD', isArchived: false },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    })
    return rows.map(toAccountRow)
  }

  // ---- faturas ------------------------------------------------------------------------

  async findStatement(userId: string, id: string, tx?: TransactionHandle) {
    const row = await this.db(tx).creditCardStatement.findFirst({ where: { id, userId } })
    return row ? toStatementRow(row) : null
  }

  async findStatementByKey(
    userId: string,
    accountId: string,
    statementKey: string,
    tx?: TransactionHandle,
  ) {
    const row = await this.db(tx).creditCardStatement.findFirst({
      where: { userId, accountId, statementKey },
    })
    return row ? toStatementRow(row) : null
  }

  async listStatements(userId: string, accountId: string, tx?: TransactionHandle) {
    const rows = await this.db(tx).creditCardStatement.findMany({
      where: { userId, accountId },
      orderBy: { statementKey: 'desc' },
    })
    return rows.map(toStatementRow)
  }

  async ensureStatements(userId: string, drafts: NewStatement[], tx?: TransactionHandle) {
    if (drafts.length === 0) return []
    const db = this.db(tx)
    // INSERT ... ON CONFLICT DO NOTHING: idempotente e sem corrida entre transações simultâneas
    // (quem perde a corrida espera o commit do outro e segue com a linha dele).
    await db.creditCardStatement.createMany({
      data: drafts.map((draft) => ({
        id: draft.id,
        userId,
        accountId: draft.accountId,
        periodStart: draft.periodStart,
        periodEnd: draft.periodEnd,
        closingDate: draft.closingDate,
        dueDate: draft.dueDate,
        statementKey: draft.statementKey,
      })),
      skipDuplicates: true,
    })
    const rows = await db.creditCardStatement.findMany({
      where: {
        userId,
        OR: drafts.map((draft) => ({
          accountId: draft.accountId,
          statementKey: draft.statementKey,
        })),
      },
      orderBy: { statementKey: 'asc' },
    })
    for (const draft of drafts) {
      if (
        !rows.some((r) => r.accountId === draft.accountId && r.statementKey === draft.statementKey)
      ) {
        // só acontece se a unicidade (conta, início do ciclo) colidiu com outra chave
        throw new Error(
          `Fatura ${draft.statementKey} não pôde ser criada (conflito de ciclo na conta ${draft.accountId}).`,
        )
      }
    }
    return rows.map(toStatementRow)
  }

  async lockStatements(userId: string, ids: string[], tx?: TransactionHandle) {
    const unique = [...new Set(ids)]
    if (unique.length === 0) return []
    const db = this.db(tx)
    // Um único SELECT ... FOR UPDATE ordenado por id: mesma ordem em todas as transações, sem
    // deadlock entre use-cases que travam as mesmas faturas. Em READ COMMITTED quem esperou o
    // lock relê o estado commitado na leitura seguinte.
    await db.$queryRaw`
      SELECT id FROM credit_card_statements
      WHERE user_id = ${userId} AND id = ANY(${unique}::text[])
      ORDER BY id
      FOR UPDATE`
    const rows = await db.creditCardStatement.findMany({
      where: { userId, id: { in: unique } },
      orderBy: { id: 'asc' },
    })
    return rows.map(toStatementRow)
  }

  async updateStatementTotals(
    userId: string,
    id: string,
    update: StatementTotalsUpdate,
    tx?: TransactionHandle,
  ) {
    const row = await this.db(tx).creditCardStatement.update({
      where: { id, userId },
      data: {
        totalAmount: update.totalAmount,
        paidAmount: update.paidAmount,
        status: update.status,
      },
    })
    return toStatementRow(row)
  }

  // ---- compras e parcelas -------------------------------------------------------------

  async insertPurchase(row: PurchaseRow, tx?: TransactionHandle) {
    await this.db(tx).cardPurchase.create({ data: row })
  }

  async insertInstallment(row: InstallmentRow, tx?: TransactionHandle) {
    await this.db(tx).cardInstallment.create({ data: row })
  }

  async lockPurchase(userId: string, id: string, tx?: TransactionHandle) {
    await this.db(tx).$queryRaw`
      SELECT id FROM card_purchases
      WHERE user_id = ${userId} AND id = ${id}
      FOR UPDATE`
    return this.findPurchase(userId, id, tx)
  }

  async findPurchase(userId: string, id: string, tx?: TransactionHandle) {
    const row = await this.db(tx).cardPurchase.findFirst({
      where: { id, userId },
      include: PURCHASE_INCLUDE,
    })
    return row ? toPurchase(row) : null
  }

  async listPurchases(userId: string, accountId: string, tx?: TransactionHandle) {
    const rows = await this.db(tx).cardPurchase.findMany({
      where: { userId, accountId },
      include: PURCHASE_INCLUDE,
      orderBy: { purchaseDate: 'desc' },
    })
    return rows.map(toPurchase)
  }

  async insertAdvance(row: AdvanceRow, tx?: TransactionHandle) {
    await this.db(tx).cardInstallmentAdvance.create({ data: row })
  }

  async setInstallmentsAdvance(
    installmentIds: string[],
    advanceId: string,
    tx?: TransactionHandle,
  ) {
    if (installmentIds.length === 0) return
    await this.db(tx).cardInstallment.updateMany({
      where: { id: { in: installmentIds } },
      data: { advanceId },
    })
  }

  async deletePurchase(userId: string, id: string, tx?: TransactionHandle) {
    // parcelas e antecipações caem em cascata (FK ON DELETE CASCADE)
    await this.db(tx).cardPurchase.deleteMany({ where: { id, userId } })
  }
}

const PURCHASE_INCLUDE = {
  installments: { orderBy: { installmentNumber: 'asc' as const } },
  advances: true,
}

type AccountRecord = Awaited<ReturnType<ConsumerTransactionClient['account']['findFirstOrThrow']>>
type StatementRecord = Awaited<
  ReturnType<ConsumerTransactionClient['creditCardStatement']['findFirstOrThrow']>
>
type PurchaseRecord = Awaited<
  ReturnType<ConsumerTransactionClient['cardPurchase']['findFirstOrThrow']>
> & {
  installments: Awaited<ReturnType<ConsumerTransactionClient['cardInstallment']['findMany']>>
  advances: Awaited<ReturnType<ConsumerTransactionClient['cardInstallmentAdvance']['findMany']>>
}

function toAccountRow(row: AccountRecord): CardAccountRow {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    type: row.type,
    isArchived: row.isArchived,
    overdraftLimit: row.overdraftLimit,
    creditLimit: row.creditLimit,
    closingDay: row.closingDay,
    dueDay: row.dueDay,
  }
}

function toStatementRow(row: StatementRecord): StatementRow {
  return {
    id: row.id,
    userId: row.userId,
    accountId: row.accountId,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    closingDate: row.closingDate,
    dueDate: row.dueDate,
    statementKey: row.statementKey,
    totalAmount: row.totalAmount,
    paidAmount: row.paidAmount,
    status: row.status,
  }
}

function toPurchase(row: PurchaseRecord): PurchaseWithInstallments {
  return {
    id: row.id,
    userId: row.userId,
    accountId: row.accountId,
    categoryId: row.categoryId,
    merchantId: row.merchantId,
    description: row.description,
    notes: row.notes,
    purchaseDate: row.purchaseDate,
    totalAmount: row.totalAmount,
    installmentCount: row.installmentCount,
    installments: row.installments.map((i) => ({
      id: i.id,
      purchaseId: i.purchaseId,
      advanceId: i.advanceId,
      installmentNumber: i.installmentNumber,
      originalAmount: i.originalAmount,
      originalDate: i.originalDate,
      ledgerTransactionId: i.ledgerTransactionId,
    })),
    advances: row.advances.map((a) => ({
      id: a.id,
      userId: a.userId,
      purchaseId: a.purchaseId,
      accountId: a.accountId,
      advancedAt: a.advancedAt,
      totalOriginalAmount: a.totalOriginalAmount,
      totalPaidAmount: a.totalPaidAmount,
      totalDiscountAmount: a.totalDiscountAmount,
      notes: a.notes,
    })),
  }
}

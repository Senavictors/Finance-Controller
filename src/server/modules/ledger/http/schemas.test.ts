import { describe, expect, it } from 'vitest'
import {
  changeStatusSchema,
  createTransactionSchema,
  createTransferSchema,
  listTransactionsQuerySchema,
  updateTransactionSchema,
} from './schemas'

const baseCreate = {
  accountId: 'acc-1',
  kind: 'EXPENSE',
  amount: 2500,
  date: '2026-10-05',
  description: 'Mercado',
}

describe('createTransactionSchema', () => {
  it('aceita despesa em módulo e converte a data para meio-dia UTC', () => {
    const parsed = createTransactionSchema.parse(baseCreate)
    expect(parsed.amount).toBe(2500)
    expect(parsed.date.toISOString()).toBe('2026-10-05T12:00:00.000Z')
  })

  it('rejeita valor negativo para kinds que não são ADJUSTMENT (a API recebe o módulo)', () => {
    for (const kind of ['EXPENSE', 'INCOME', 'FEE', 'INTEREST']) {
      expect(createTransactionSchema.safeParse({ ...baseCreate, kind, amount: -100 }).success).toBe(
        false,
      )
    }
  })

  it('ADJUSTMENT recebe valor assinado, mas nunca zero', () => {
    expect(
      createTransactionSchema.safeParse({ ...baseCreate, kind: 'ADJUSTMENT', amount: -100 })
        .success,
    ).toBe(true)
    expect(
      createTransactionSchema.safeParse({ ...baseCreate, kind: 'ADJUSTMENT', amount: 100 }).success,
    ).toBe(true)
    expect(
      createTransactionSchema.safeParse({ ...baseCreate, kind: 'ADJUSTMENT', amount: 0 }).success,
    ).toBe(false)
  })

  it('rejeita fração, zero, acima do limite e não-número', () => {
    for (const amount of [10.5, 0, 2_000_000_001, '100', null, Number.NaN]) {
      expect(createTransactionSchema.safeParse({ ...baseCreate, amount }).success).toBe(false)
    }
    expect(
      createTransactionSchema.safeParse({ ...baseCreate, amount: 2_000_000_000 }).success,
    ).toBe(true)
  })

  it('rejeita TRANSFER/CARD_PAYMENT (usam /api/transfers), status RECONCILED e campos extras', () => {
    expect(createTransactionSchema.safeParse({ ...baseCreate, kind: 'TRANSFER' }).success).toBe(
      false,
    )
    expect(createTransactionSchema.safeParse({ ...baseCreate, kind: 'CARD_PAYMENT' }).success).toBe(
      false,
    )
    expect(createTransactionSchema.safeParse({ ...baseCreate, status: 'RECONCILED' }).success).toBe(
      false,
    )
    expect(createTransactionSchema.safeParse({ ...baseCreate, userId: 'x' }).success).toBe(false)
    expect(
      createTransactionSchema.safeParse({ ...baseCreate, userLocked: { amount: true } }).success,
    ).toBe(false)
  })

  it('valida datas estritamente e descrição 1-255', () => {
    expect(createTransactionSchema.safeParse({ ...baseCreate, date: '2026-02-30' }).success).toBe(
      false,
    )
    expect(createTransactionSchema.safeParse({ ...baseCreate, date: '05/10/2026' }).success).toBe(
      false,
    )
    expect(createTransactionSchema.safeParse({ ...baseCreate, description: '' }).success).toBe(
      false,
    )
    expect(createTransactionSchema.safeParse({ ...baseCreate, description: '   ' }).success).toBe(
      false,
    )
    expect(
      createTransactionSchema.safeParse({ ...baseCreate, description: 'x'.repeat(256) }).success,
    ).toBe(false)
    expect(
      createTransactionSchema.safeParse({ ...baseCreate, description: 'x'.repeat(255) }).success,
    ).toBe(true)
  })

  it('aceita campos opcionais', () => {
    const parsed = createTransactionSchema.parse({
      ...baseCreate,
      categoryId: 'cat-1',
      merchantId: 'mer-1',
      status: 'PENDING',
      notes: 'obs',
      tags: ['a', 'b'],
      postedDate: '2026-10-06',
    })
    expect(parsed.status).toBe('PENDING')
    expect(parsed.postedDate?.toISOString()).toBe('2026-10-06T12:00:00.000Z')
  })
})

describe('updateTransactionSchema', () => {
  it('aceita patch parcial com nulos para limpar rótulos', () => {
    const parsed = updateTransactionSchema.parse({
      categoryId: null,
      notes: null,
      postedDate: null,
    })
    expect(parsed).toEqual({ categoryId: null, notes: null, postedDate: null })
  })

  it('rejeita patch vazio e campos desconhecidos', () => {
    expect(updateTransactionSchema.safeParse({}).success).toBe(false)
    expect(updateTransactionSchema.safeParse({ userId: 'x' }).success).toBe(false)
    expect(updateTransactionSchema.safeParse({ excludeFromBudget: true }).success).toBe(false)
  })

  it('valida valor inteiro não nulo; o sinal é decidido pelo use-case com o kind final', () => {
    expect(updateTransactionSchema.safeParse({ amount: 0 }).success).toBe(false)
    expect(updateTransactionSchema.safeParse({ amount: 1.5 }).success).toBe(false)
    expect(updateTransactionSchema.safeParse({ amount: 5000 }).success).toBe(true)
    expect(updateTransactionSchema.safeParse({ amount: -5000 }).success).toBe(true)
    expect(updateTransactionSchema.safeParse({ kind: 'TRANSFER' }).success).toBe(false)
  })
})

describe('changeStatusSchema e createTransferSchema', () => {
  it('status aceita os quatro valores e rejeita outros', () => {
    for (const status of ['PLANNED', 'PENDING', 'CLEARED', 'RECONCILED']) {
      expect(changeStatusSchema.safeParse({ status }).success).toBe(true)
    }
    expect(changeStatusSchema.safeParse({ status: 'DONE' }).success).toBe(false)
    expect(changeStatusSchema.safeParse({}).success).toBe(false)
  })

  const baseTransfer = {
    sourceAccountId: 'a',
    destinationAccountId: 'b',
    amount: 10000,
    date: '2026-10-05',
    description: 'Transferência',
  }

  it('aceita transferência válida', () => {
    expect(createTransferSchema.parse(baseTransfer).amount).toBe(10000)
  })

  it('rejeita origem = destino, valor <= 0, status RECONCILED e campos extras', () => {
    expect(
      createTransferSchema.safeParse({ ...baseTransfer, destinationAccountId: 'a' }).success,
    ).toBe(false)
    expect(createTransferSchema.safeParse({ ...baseTransfer, amount: 0 }).success).toBe(false)
    expect(createTransferSchema.safeParse({ ...baseTransfer, amount: -1 }).success).toBe(false)
    expect(createTransferSchema.safeParse({ ...baseTransfer, status: 'RECONCILED' }).success).toBe(
      false,
    )
    expect(createTransferSchema.safeParse({ ...baseTransfer, kind: 'CARD_PAYMENT' }).success).toBe(
      false,
    )
  })
})

describe('listTransactionsQuerySchema', () => {
  it('converte limit e datas; aplica limites', () => {
    const parsed = listTransactionsQuerySchema.parse({
      from: '2026-10-01',
      to: '2026-10-31',
      limit: '25',
      q: 'mercado',
    })
    expect(parsed.limit).toBe(25)
    expect(parsed.from?.toISOString()).toBe('2026-10-01T12:00:00.000Z')
    expect(listTransactionsQuerySchema.safeParse({ limit: '0' }).success).toBe(false)
    expect(listTransactionsQuerySchema.safeParse({ limit: '101' }).success).toBe(false)
  })

  it('rejeita intervalo invertido, status inválido e parâmetros desconhecidos', () => {
    expect(
      listTransactionsQuerySchema.safeParse({ from: '2026-10-31', to: '2026-10-01' }).success,
    ).toBe(false)
    expect(listTransactionsQuerySchema.safeParse({ status: 'X' }).success).toBe(false)
    expect(listTransactionsQuerySchema.safeParse({ userId: 'x' }).success).toBe(false)
    expect(listTransactionsQuerySchema.safeParse({}).success).toBe(true)
  })
})

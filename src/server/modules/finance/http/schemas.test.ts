import { describe, expect, it } from 'vitest'
import {
  createCreditCardInstallmentAdvanceSchema,
  createAccountSchema,
  createTransactionSchema,
  createWishlistCategorySchema,
  createWishlistItemSchema,
  purchaseWishlistItemSchema,
  updateAccountSchema,
  updateWishlistItemSchema,
} from './schemas'

describe('finance/http schemas - account', () => {
  it('aceita cartao de credito com emissor, bandeira e icones nulos opcionais', () => {
    const parsed = createAccountSchema.safeParse({
      name: 'Cartao Itau',
      type: 'CREDIT_CARD',
      initialBalance: 0,
      creditLimit: 250_000,
      statementClosingDay: 8,
      statementDueDay: 15,
      color: '#FF6200',
      icon: 'itau',
      networkBrandKey: 'mastercard',
    })

    expect(parsed.success).toBe(true)
  })

  it('mantem a validacao de billing obrigatorio para cartao de credito', () => {
    const parsed = createAccountSchema.safeParse({
      name: 'Cartao sem fechamento',
      type: 'CREDIT_CARD',
      initialBalance: 0,
      creditLimit: 250_000,
      statementDueDay: 15,
      icon: null,
      networkBrandKey: null,
    })

    expect(parsed.success).toBe(false)
    if (parsed.success) return
    expect(parsed.error.flatten().fieldErrors.statementClosingDay).toContain(
      'Dia de fechamento obrigatorio para cartao de credito',
    )
  })

  it('aceita limpar emissor e bandeira em updates parciais', () => {
    const parsed = updateAccountSchema.safeParse({
      icon: null,
      networkBrandKey: null,
    })

    expect(parsed.success).toBe(true)
  })
})

describe('finance/http schemas - wishlist', () => {
  it('aceita criar item com link, categoria e data desejada', () => {
    const parsed = createWishlistItemSchema.safeParse({
      name: 'Kindle Paperwhite',
      categoryId: 'wish-cat-1',
      desiredPrice: 79990,
      productUrl: 'https://www.amazon.com.br/kindle',
      priority: 'HIGH',
      status: 'READY_TO_BUY',
      desiredPurchaseDate: '2026-04-30',
    })

    expect(parsed.success).toBe(true)
  })

  it('bloqueia marcar item como comprado fora do fluxo de compra', () => {
    const parsed = createWishlistItemSchema.safeParse({
      name: 'Headphone',
      desiredPrice: 39990,
      priority: 'HIGH',
      status: 'PURCHASED',
    })

    expect(parsed.success).toBe(false)
    if (parsed.success) return
    expect(parsed.error.flatten().fieldErrors.status).toContain(
      'Use o fluxo de compra para marcar um item como comprado',
    )
  })

  it('aceita limpar categoria, link e data em updates', () => {
    const parsed = updateWishlistItemSchema.safeParse({
      categoryId: null,
      productUrl: null,
      desiredPurchaseDate: null,
      status: 'CANCELED',
    })

    expect(parsed.success).toBe(true)
  })

  it('aceita criar categoria propria da wishlist', () => {
    const parsed = createWishlistCategorySchema.safeParse({
      name: 'Tecnologia',
    })

    expect(parsed.success).toBe(true)
  })

  it('aceita payload de compra com conta e valor pago', () => {
    const parsed = purchaseWishlistItemSchema.safeParse({
      accountId: 'acc-1',
      categoryId: 'cat-expense',
      amount: 75990,
      date: '2026-04-21',
      notes: 'Comprado em promocao',
    })

    expect(parsed.success).toBe(true)
  })

  it('aceita compra parcelada na wishlist para cartao de credito', () => {
    const parsed = purchaseWishlistItemSchema.safeParse({
      accountId: 'acc-card',
      categoryId: 'cat-expense',
      amount: 259990,
      date: '2026-04-21',
      paymentMode: 'INSTALLMENT',
      installmentCount: 12,
      notes: 'Notebook parcelado',
    })

    expect(parsed.success).toBe(true)
  })
})

describe('finance/http schemas - transactions', () => {
  it('aceita compra parcelada no cartao com ate 24 parcelas', () => {
    const parsed = createTransactionSchema.safeParse({
      accountId: 'acc-card',
      categoryId: 'cat-expense',
      amount: 199990,
      date: '2026-04-21',
      description: 'Celular novo',
      type: 'EXPENSE',
      paymentMode: 'INSTALLMENT',
      installmentCount: 24,
    })

    expect(parsed.success).toBe(true)
  })

  it('bloqueia parcelamento para transacao que nao seja despesa', () => {
    const parsed = createTransactionSchema.safeParse({
      accountId: 'acc-card',
      amount: 199990,
      date: '2026-04-21',
      description: 'Receita incorreta',
      type: 'INCOME',
      paymentMode: 'INSTALLMENT',
      installmentCount: 3,
    })

    expect(parsed.success).toBe(false)
    if (parsed.success) return
    expect(parsed.error.flatten().fieldErrors.paymentMode).toContain(
      'Parcelamento so pode ser usado em despesas',
    )
  })
})

describe('finance/http schemas - credit card advances', () => {
  it('aceita adiantamento manual de multiplas parcelas', () => {
    const parsed = createCreditCardInstallmentAdvanceSchema.safeParse({
      advancedAt: '2026-04-22',
      notes: 'Antecipado pelo app do banco',
      installments: [
        { installmentId: 'inst-1', paidAmount: 15000 },
        { installmentId: 'inst-2', paidAmount: 14900 },
      ],
    })

    expect(parsed.success).toBe(true)
  })

  it('bloqueia parcelas duplicadas no mesmo adiantamento', () => {
    const parsed = createCreditCardInstallmentAdvanceSchema.safeParse({
      advancedAt: '2026-04-22',
      installments: [
        { installmentId: 'inst-1', paidAmount: 15000 },
        { installmentId: 'inst-1', paidAmount: 14900 },
      ],
    })

    expect(parsed.success).toBe(false)
    if (parsed.success) return
    expect(parsed.error.flatten().fieldErrors.installments).toContain(
      'Parcela duplicada no adiantamento',
    )
  })
})

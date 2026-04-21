import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  prismaMock,
  txMock,
  invalidateAnalyticsSnapshotsMock,
  syncCreditCardTransactionStatementMock,
} = vi.hoisted(() => {
  const txMock = {
    transaction: {
      create: vi.fn(),
    },
    wishlistItem: {
      update: vi.fn(),
    },
  }

  return {
    txMock,
    prismaMock: {
      wishlistItem: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      wishlistCategory: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
      },
      account: {
        findFirst: vi.fn(),
      },
      category: {
        findFirst: vi.fn(),
      },
      $transaction: vi.fn(),
    },
    invalidateAnalyticsSnapshotsMock: vi.fn(),
    syncCreditCardTransactionStatementMock: vi.fn(),
  }
})

vi.mock('@/server/db', () => ({
  prisma: prismaMock,
}))

vi.mock('../analytics', () => ({
  ANALYTICS_MUTATION_MODULES: {
    transaction: ['summary', 'goals', 'forecast', 'score', 'insights', 'credit-card'],
  },
  invalidateAnalyticsSnapshots: invalidateAnalyticsSnapshotsMock,
}))

vi.mock('../credit-card/billing', () => ({
  syncCreditCardTransactionStatement: syncCreditCardTransactionStatementMock,
}))

import {
  createWishlistCategory,
  listWishlistItems,
  purchaseWishlistItem,
  updateWishlistItem,
} from './use-cases'

describe('wishlist/use-cases', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.$transaction.mockImplementation(async (callback: typeof txMock) => callback(txMock))
  })

  it('lista itens filtrando sempre por userId', async () => {
    prismaMock.wishlistItem.findMany.mockResolvedValue([])

    await listWishlistItems('user-1', {
      status: 'READY_TO_BUY',
      priority: 'HIGH',
      q: 'notebook',
    })

    expect(prismaMock.wishlistItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user-1',
          status: 'READY_TO_BUY',
          priority: 'HIGH',
          name: expect.objectContaining({
            contains: 'notebook',
          }),
        }),
      }),
    )
  })

  it('impede criar categoria duplicada ignorando maiusculas/minusculas', async () => {
    prismaMock.wishlistCategory.findFirst.mockResolvedValue({ id: 'cat-1' })

    await expect(createWishlistCategory({ name: 'Eletronicos' }, 'user-1')).rejects.toThrow(
      'Categoria de desejos ja existe',
    )
  })

  it('impede editar item apontando para categoria de outro usuario', async () => {
    prismaMock.wishlistItem.findFirst.mockResolvedValue({
      id: 'item-1',
      name: 'Notebook',
      categoryId: null,
      desiredPrice: 450000,
      paidPrice: null,
      productUrl: null,
      priority: 'HIGH',
      status: 'DESIRED',
      desiredPurchaseDate: null,
      purchasedAt: null,
      purchaseTransactionId: null,
      createdAt: new Date('2026-04-21T10:00:00.000Z'),
      updatedAt: new Date('2026-04-21T10:00:00.000Z'),
      category: null,
      purchaseTransaction: null,
    })
    prismaMock.wishlistCategory.findFirst.mockResolvedValue(null)

    await expect(
      updateWishlistItem('item-1', { categoryId: 'cat-other-user' }, 'user-1'),
    ).rejects.toThrow('Categoria de desejos nao encontrada')
  })

  it('compra item de forma atomica, cria despesa e vincula a transacao', async () => {
    prismaMock.wishlistItem.findFirst.mockResolvedValue({
      id: 'item-1',
      name: 'Kindle Paperwhite',
      categoryId: 'wish-cat-1',
      desiredPrice: 79900,
      paidPrice: null,
      productUrl: 'https://example.com/kindle',
      priority: 'HIGH',
      status: 'READY_TO_BUY',
      desiredPurchaseDate: new Date('2026-04-25T12:00:00.000Z'),
      purchasedAt: null,
      purchaseTransactionId: null,
      createdAt: new Date('2026-04-20T12:00:00.000Z'),
      updatedAt: new Date('2026-04-20T12:00:00.000Z'),
      category: { id: 'wish-cat-1', name: 'Leitura' },
      purchaseTransaction: null,
    })
    prismaMock.account.findFirst.mockResolvedValue({ id: 'acc-1' })
    prismaMock.category.findFirst.mockResolvedValue({ id: 'cat-1' })
    txMock.transaction.create.mockResolvedValue({
      id: 'tx-1',
      userId: 'user-1',
      accountId: 'acc-1',
      categoryId: 'cat-1',
      creditCardStatementId: null,
      type: 'EXPENSE',
      amount: 75900,
      description: 'Kindle Paperwhite',
      notes: 'Promo relampago',
      date: new Date('2026-04-21T12:00:00.000Z'),
      transferId: null,
      createdAt: new Date('2026-04-21T12:00:00.000Z'),
      updatedAt: new Date('2026-04-21T12:00:00.000Z'),
    })
    txMock.wishlistItem.update.mockResolvedValue({
      id: 'item-1',
      name: 'Kindle Paperwhite',
      categoryId: 'wish-cat-1',
      desiredPrice: 79900,
      paidPrice: 75900,
      productUrl: 'https://example.com/kindle',
      priority: 'HIGH',
      status: 'PURCHASED',
      desiredPurchaseDate: new Date('2026-04-25T12:00:00.000Z'),
      purchasedAt: new Date('2026-04-21T12:00:00.000Z'),
      purchaseTransactionId: 'tx-1',
      createdAt: new Date('2026-04-20T12:00:00.000Z'),
      updatedAt: new Date('2026-04-21T12:00:00.000Z'),
      category: { id: 'wish-cat-1', name: 'Leitura' },
      purchaseTransaction: {
        id: 'tx-1',
        accountId: 'acc-1',
        date: new Date('2026-04-21T12:00:00.000Z'),
        amount: 75900,
        description: 'Kindle Paperwhite',
      },
    })
    syncCreditCardTransactionStatementMock.mockResolvedValue({ id: 'statement-1' })

    const result = await purchaseWishlistItem(
      'item-1',
      {
        accountId: 'acc-1',
        categoryId: 'cat-1',
        amount: 75900,
        date: new Date('2026-04-21T12:00:00.000Z'),
        notes: 'Promo relampago',
      },
      'user-1',
    )

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1)
    expect(txMock.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-1',
          accountId: 'acc-1',
          categoryId: 'cat-1',
          type: 'EXPENSE',
          amount: 75900,
          description: 'Kindle Paperwhite',
        }),
      }),
    )
    expect(txMock.wishlistItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'item-1' },
        data: expect.objectContaining({
          paidPrice: 75900,
          status: 'PURCHASED',
          purchaseTransactionId: 'tx-1',
        }),
      }),
    )
    expect(syncCreditCardTransactionStatementMock).toHaveBeenCalledWith('tx-1')
    expect(invalidateAnalyticsSnapshotsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        accountIds: ['acc-1'],
        categoryIds: ['cat-1'],
        statementIds: ['statement-1'],
      }),
    )
    expect(result.item.status).toBe('PURCHASED')
    expect(result.transaction.id).toBe('tx-1')
  })

  it('bloqueia compra de item ja comprado', async () => {
    prismaMock.wishlistItem.findFirst.mockResolvedValue({
      id: 'item-1',
      name: 'Monitor',
      categoryId: null,
      desiredPrice: 120000,
      paidPrice: 115000,
      productUrl: null,
      priority: 'MEDIUM',
      status: 'PURCHASED',
      desiredPurchaseDate: null,
      purchasedAt: new Date('2026-04-20T12:00:00.000Z'),
      purchaseTransactionId: 'tx-1',
      createdAt: new Date('2026-04-18T12:00:00.000Z'),
      updatedAt: new Date('2026-04-20T12:00:00.000Z'),
      category: null,
      purchaseTransaction: {
        id: 'tx-1',
        accountId: 'acc-1',
        date: new Date('2026-04-20T12:00:00.000Z'),
        amount: 115000,
        description: 'Monitor',
      },
    })

    await expect(
      purchaseWishlistItem(
        'item-1',
        {
          accountId: 'acc-1',
          amount: 115000,
          date: new Date('2026-04-20T12:00:00.000Z'),
        },
        'user-1',
      ),
    ).rejects.toThrow('Item ja foi comprado')
  })
})

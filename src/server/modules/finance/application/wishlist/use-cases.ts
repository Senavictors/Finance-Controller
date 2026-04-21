import type { Prisma, WishlistItemPriority, WishlistItemStatus } from '@/generated/prisma/client'
import { prisma } from '@/server/db'
import type {
  CreateWishlistCategoryInput,
  CreateWishlistItemInput,
  PurchaseWishlistItemInput,
  UpdateWishlistItemInput,
  WishlistItemQuery,
} from '../../http'
import { syncCreditCardTransactionStatement } from '../credit-card/billing'
import { ANALYTICS_MUTATION_MODULES, invalidateAnalyticsSnapshots } from '../analytics'
import type {
  WishlistCategorySummary,
  WishlistItemFilters,
  WishlistListItem,
  WishlistPurchaseResult,
} from './types'

const wishlistItemInclude = {
  category: {
    select: {
      id: true,
      name: true,
    },
  },
  purchaseTransaction: {
    select: {
      id: true,
      accountId: true,
      date: true,
      amount: true,
      description: true,
    },
  },
} satisfies Prisma.WishlistItemInclude

const priorityOrder: Record<WishlistItemPriority, number> = {
  HIGH: 0,
  MEDIUM: 1,
  LOW: 2,
}

const statusOrder: Record<WishlistItemStatus, number> = {
  READY_TO_BUY: 0,
  MONITORING: 1,
  DESIRED: 2,
  PURCHASED: 3,
  CANCELED: 4,
}

function trimOrNull(value?: string | null) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function toWishlistListItem(
  item: Prisma.WishlistItemGetPayload<{ include: typeof wishlistItemInclude }>,
): WishlistListItem {
  return {
    id: item.id,
    name: item.name,
    categoryId: item.categoryId,
    desiredPrice: item.desiredPrice,
    paidPrice: item.paidPrice,
    productUrl: item.productUrl,
    priority: item.priority,
    status: item.status,
    desiredPurchaseDate: item.desiredPurchaseDate,
    purchasedAt: item.purchasedAt,
    purchaseTransactionId: item.purchaseTransactionId,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    category: item.category,
    purchaseTransaction: item.purchaseTransaction,
  }
}

function sortWishlistItems(items: WishlistListItem[]) {
  return [...items].sort((a, b) => {
    const statusDelta = statusOrder[a.status] - statusOrder[b.status]
    if (statusDelta !== 0) return statusDelta

    const priorityDelta = priorityOrder[a.priority] - priorityOrder[b.priority]
    if (priorityDelta !== 0) return priorityDelta

    const dateA = a.desiredPurchaseDate?.getTime() ?? Number.MAX_SAFE_INTEGER
    const dateB = b.desiredPurchaseDate?.getTime() ?? Number.MAX_SAFE_INTEGER
    if (dateA !== dateB) return dateA - dateB

    return b.createdAt.getTime() - a.createdAt.getTime()
  })
}

async function ensureWishlistCategory(categoryId: string, userId: string) {
  const category = await prisma.wishlistCategory.findFirst({
    where: { id: categoryId, userId },
    select: { id: true },
  })

  if (!category) {
    throw new Error('Categoria de desejos nao encontrada')
  }
}

async function ensureExpenseCategory(categoryId: string, userId: string) {
  const category = await prisma.category.findFirst({
    where: { id: categoryId, userId, type: 'EXPENSE' },
    select: { id: true },
  })

  if (!category) {
    throw new Error('Categoria financeira nao encontrada')
  }
}

async function getWishlistItemOrThrow(itemId: string, userId: string) {
  const item = await prisma.wishlistItem.findFirst({
    where: { id: itemId, userId },
    include: wishlistItemInclude,
  })

  if (!item) {
    throw new Error('Item da wishlist nao encontrado')
  }

  return item
}

export async function listWishlistCategories(userId: string): Promise<WishlistCategorySummary[]> {
  return prisma.wishlistCategory.findMany({
    where: { userId },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  })
}

export async function createWishlistCategory(input: CreateWishlistCategoryInput, userId: string) {
  const name = input.name.trim()

  const existing = await prisma.wishlistCategory.findFirst({
    where: {
      userId,
      name: { equals: name, mode: 'insensitive' },
    },
    select: { id: true },
  })

  if (existing) {
    throw new Error('Categoria de desejos ja existe')
  }

  return prisma.wishlistCategory.create({
    data: {
      userId,
      name,
    },
    select: { id: true, name: true },
  })
}

export async function listWishlistItems(
  userId: string,
  filters: WishlistItemQuery | WishlistItemFilters = {},
): Promise<WishlistListItem[]> {
  const where: Prisma.WishlistItemWhereInput = {
    userId,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.priority ? { priority: filters.priority } : {}),
    ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
    ...(filters.q
      ? {
          name: {
            contains: filters.q,
            mode: 'insensitive',
          },
        }
      : {}),
  }

  const items = await prisma.wishlistItem.findMany({
    where,
    include: wishlistItemInclude,
  })

  return sortWishlistItems(items.map(toWishlistListItem))
}

export async function createWishlistItem(input: CreateWishlistItemInput, userId: string) {
  if (input.categoryId) {
    await ensureWishlistCategory(input.categoryId, userId)
  }

  const item = await prisma.wishlistItem.create({
    data: {
      userId,
      name: input.name.trim(),
      categoryId: input.categoryId ?? null,
      desiredPrice: input.desiredPrice,
      productUrl: trimOrNull(input.productUrl),
      priority: input.priority,
      status: input.status,
      desiredPurchaseDate: input.desiredPurchaseDate ?? null,
    },
    include: wishlistItemInclude,
  })

  return toWishlistListItem(item)
}

export async function updateWishlistItem(
  itemId: string,
  input: UpdateWishlistItemInput,
  userId: string,
) {
  await getWishlistItemOrThrow(itemId, userId)

  if (input.categoryId) {
    await ensureWishlistCategory(input.categoryId, userId)
  }

  const item = await prisma.wishlistItem.update({
    where: { id: itemId },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
      ...(input.desiredPrice !== undefined ? { desiredPrice: input.desiredPrice } : {}),
      ...(input.productUrl !== undefined ? { productUrl: trimOrNull(input.productUrl) } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.desiredPurchaseDate !== undefined
        ? { desiredPurchaseDate: input.desiredPurchaseDate }
        : {}),
    },
    include: wishlistItemInclude,
  })

  return toWishlistListItem(item)
}

export async function deleteWishlistItem(itemId: string, userId: string) {
  await getWishlistItemOrThrow(itemId, userId)

  return prisma.wishlistItem.delete({
    where: { id: itemId },
    select: { id: true },
  })
}

export async function purchaseWishlistItem(
  itemId: string,
  input: PurchaseWishlistItemInput,
  userId: string,
): Promise<WishlistPurchaseResult> {
  const item = await getWishlistItemOrThrow(itemId, userId)

  if (item.status === 'PURCHASED') {
    throw new Error('Item ja foi comprado')
  }

  if (item.status === 'CANCELED') {
    throw new Error('Itens cancelados nao podem ser comprados')
  }

  const account = await prisma.account.findFirst({
    where: { id: input.accountId, userId, isArchived: false },
    select: { id: true },
  })

  if (!account) {
    throw new Error('Conta nao encontrada')
  }

  if (input.categoryId) {
    await ensureExpenseCategory(input.categoryId, userId)
  }

  const result = await prisma.$transaction(async (tx) => {
    const transaction = await tx.transaction.create({
      data: {
        userId,
        accountId: input.accountId,
        categoryId: input.categoryId ?? null,
        type: 'EXPENSE',
        amount: input.amount,
        date: input.date,
        description: item.name,
        notes: trimOrNull(input.notes),
      },
    })

    const purchasedItem = await tx.wishlistItem.update({
      where: { id: itemId },
      data: {
        paidPrice: input.amount,
        purchasedAt: input.date,
        status: 'PURCHASED',
        purchaseTransactionId: transaction.id,
      },
      include: wishlistItemInclude,
    })

    return {
      item: toWishlistListItem(purchasedItem),
      transaction,
    }
  })

  const statement = await syncCreditCardTransactionStatement(result.transaction.id)

  await invalidateAnalyticsSnapshots({
    userId,
    modules: ANALYTICS_MUTATION_MODULES.transaction,
    dates: [result.transaction.date],
    accountIds: [result.transaction.accountId],
    categoryIds: [result.transaction.categoryId],
    statementIds: [statement?.id],
  })

  return result
}

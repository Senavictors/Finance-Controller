import type { PrismaClient } from '@/generated/prisma/client'
import { prismaClientOf, type TransactionHandle } from '@/server/modules/ledger'

import { AccountError } from '../domain/errors'
import type { AccountRecord } from '../domain/types'
import type { AccountRepository } from '../application/ports'

/**
 * Repositório Prisma de contas. Recebe o cliente por parâmetro (app usa `@/server/db`; testes de
 * integração usam `getTestDb()`), então importar este arquivo não abre conexão. Toda consulta
 * filtra por `userId`. Com `tx` (handle da unit of work do ledger) escreve na mesma transação
 * do ledger; nunca toca `transactions`/`account_balances` (o ledger é o dono delas).
 */
export function createPrismaAccountRepository(client: PrismaClient): AccountRepository {
  const dbOf = (tx?: TransactionHandle) => (tx ? prismaClientOf(tx) : client)

  return {
    listByUser(userId, tx) {
      return dbOf(tx).account.findMany({
        where: { userId },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }],
      }) as Promise<AccountRecord[]>
    },

    findById(userId, id, tx) {
      return dbOf(tx).account.findFirst({ where: { id, userId } }) as Promise<AccountRecord | null>
    },

    async insert(row, tx) {
      try {
        return (await dbOf(tx).account.create({
          data: { ...row, isArchived: false },
        })) as AccountRecord
      } catch (error) {
        throw translate(error)
      }
    },

    async update(userId, id, patch, tx) {
      const db = dbOf(tx)
      try {
        // `updateMany` escopa por userId; devolve a linha atualizada em seguida.
        const { count } = await db.account.updateMany({ where: { id, userId }, data: patch })
        if (count === 0) return null
      } catch (error) {
        throw translate(error)
      }
      return (await db.account.findFirst({ where: { id, userId } })) as AccountRecord | null
    },

    async delete(userId, id, tx) {
      try {
        await dbOf(tx).account.deleteMany({ where: { id, userId } })
      } catch (error) {
        throw translate(error)
      }
    },

    async setSortOrders(userId, orderedIds, tx) {
      const db = dbOf(tx)
      // Uma atualização por conta: a lista de contas de um usuário é pequena.
      for (const [index, id] of orderedIds.entries()) {
        await db.account.updateMany({ where: { id, userId }, data: { sortOrder: index } })
      }
    },

    async nextSortOrder(userId, tx) {
      const { _max } = await dbOf(tx).account.aggregate({
        where: { userId },
        _max: { sortOrder: true },
      })
      return (_max.sortOrder ?? -1) + 1
    },
  }
}

function prismaCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code: unknown }).code
    return typeof code === 'string' ? code : undefined
  }
  return undefined
}

/** Violações de unicidade e de chave estrangeira viram erros de domínio (sem vazar detalhes). */
function translate(error: unknown): unknown {
  switch (prismaCode(error)) {
    case 'P2002':
      return new AccountError('ACCOUNT_NAME_TAKEN', 'Já existe uma conta com esse nome.')
    case 'P2003':
      return new AccountError(
        'ACCOUNT_IN_USE',
        'A conta é usada por outros registros e não pode ser excluída: arquive-a.',
      )
    default:
      return error
  }
}

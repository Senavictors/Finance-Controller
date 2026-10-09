import { AccountError } from '../domain/errors'
import { OPENING_DESCRIPTION, todayNoonUtc, type AccountView } from '../domain/rules'
import type { AccountFields } from '../domain/types'
import {
  hasErrors,
  normalizeAccountFields,
  validateAccountFields,
  validateOpeningBalance,
} from '../domain/validation'
import type { AccountDeps, AccountWarning } from './ports'
import { assertNameAvailable } from './shared'
import { toAccountView } from '../domain/rules'

export interface CreateAccountInput extends AccountFields {
  /**
   * Saldo inicial assinado, em centavos (não é coluna: vira um `ADJUSTMENT` "Saldo inicial").
   * Em cartão representa a dívida já existente (valor negativo). Zero/omitido não cria lançamento.
   */
  openingBalance?: number
  /** Dia do saldo inicial, meio-dia UTC; padrão: hoje (São Paulo). */
  openingDate?: Date
}

export interface CreateAccountResult {
  account: AccountView
  warnings: AccountWarning[]
}

/**
 * Cria a conta, a linha zerada de `AccountBalance` e, se houver saldo inicial, o `ADJUSTMENT`
 * "Saldo inicial" (`CLEARED`, fora do orçamento) numa única transação do ledger (RN-01).
 * Falhou em qualquer passo, nada é criado.
 */
export async function createAccount(
  deps: AccountDeps,
  userId: string,
  input: CreateAccountInput,
): Promise<CreateAccountResult> {
  const errors = {
    ...validateAccountFields(input),
    ...validateOpeningBalance(input.type, input.openingBalance),
  }
  if (hasErrors(errors)) {
    throw new AccountError('ACCOUNT_INVALID', 'Dados da conta inválidos.', errors)
  }

  const fields = normalizeAccountFields(input)
  await assertNameAvailable(deps, userId, fields.name)

  // Ids e datas antes da unit of work: se o ledger refizer a transação (deadlock), as
  // chaves são as mesmas.
  const id = deps.newId()
  const sortOrder = await deps.accounts.nextSortOrder(userId)
  const openingBalance = input.openingBalance ?? 0
  const openingDate = input.openingDate ?? todayNoonUtc(deps.clock())

  const { record, position } = await deps.ledger.runInTransaction({ userId }, async (uow) => {
    const created = await deps.accounts.insert({ ...fields, id, userId, sortOrder }, uow.tx)
    await uow.openAccountBalance(id)
    if (openingBalance !== 0) {
      await uow.createTransaction({
        accountId: id,
        kind: 'ADJUSTMENT',
        amount: openingBalance,
        date: openingDate,
        description: OPENING_DESCRIPTION,
        status: 'CLEARED',
        source: 'MANUAL',
        review: 'REVIEWED',
        excludeFromBudget: true,
      })
    }
    return { record: created, position: await uow.getAccountPosition(id) }
  })

  return {
    account: toAccountView(record, position),
    warnings: position.warnings.map((warning) => warning.code),
  }
}

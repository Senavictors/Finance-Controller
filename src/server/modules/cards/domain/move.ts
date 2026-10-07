import { CardsError } from './errors'
import { isMonthKey, monthsBetweenKeys } from './calendar'

/**
 * Janela de faturas que um lançamento pode ser movido/estornado para uma fatura **ainda não
 * existente** (RN-08: "data coerente com o ciclo do cartão"): do ciclo natural da data do
 * lançamento, 1 mês antes até 2 meses depois. Faturas já existentes do cartão não têm essa
 * restrição (o usuário pode mover para qualquer fatura aberta que exista).
 */
export const MOVE_WINDOW_MONTHS_BEFORE = 1
export const MOVE_WINDOW_MONTHS_AFTER = 2

export function assertStatementKeyCreatable(input: {
  /** `statementKey` do ciclo natural da data do lançamento. */
  naturalKey: string
  targetKey: string
}): void {
  if (!isMonthKey(input.targetKey)) {
    throw new CardsError('INVALID_STATEMENT_KEY', 'statementKey deve estar no formato AAAA-MM.', {
      statementKey: input.targetKey,
    })
  }
  const delta = monthsBetweenKeys(input.naturalKey, input.targetKey)
  if (delta < -MOVE_WINDOW_MONTHS_BEFORE || delta > MOVE_WINDOW_MONTHS_AFTER) {
    throw new CardsError(
      'STATEMENT_TARGET_OUT_OF_RANGE',
      'A fatura de destino está longe demais do ciclo da data do lançamento.',
      {
        naturalKey: input.naturalKey,
        targetKey: input.targetKey,
        monthsBefore: MOVE_WINDOW_MONTHS_BEFORE,
        monthsAfter: MOVE_WINDOW_MONTHS_AFTER,
      },
    )
  }
}

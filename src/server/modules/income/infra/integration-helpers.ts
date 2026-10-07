/**
 * Soma de baldes a partir de linhas cruas de `transactions` (só para testes de integração do
 * módulo): `CLEARED|RECONCILED` -> cleared, `PENDING` -> pending, `PLANNED` -> planned. Espelha
 * a regra do ledger (ADR-019) sem importar internos dele.
 */
export function computeBalancesFromRows(rows: ReadonlyArray<{ status: string; amount: number }>): {
  cleared: number
  pending: number
  planned: number
} {
  const total = { cleared: 0, pending: 0, planned: 0 }
  for (const row of rows) {
    if (row.status === 'CLEARED' || row.status === 'RECONCILED') total.cleared += row.amount
    else if (row.status === 'PENDING') total.pending += row.amount
    else if (row.status === 'PLANNED') total.planned += row.amount
  }
  return total
}

// Funções puras de parcelamento extraídas do FC 1.x (tag fc-1.x-final).
// Comportamento preservado; a correção dos dias 29-31 e do relógio UTC é da FC2-F1-03.

function normalizeInstallmentDate(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 12, 0, 0, 0)
}

function addMonthsPreservingDay(value: Date, monthOffset: number) {
  const date = normalizeInstallmentDate(value)
  return new Date(date.getFullYear(), date.getMonth() + monthOffset, date.getDate(), 12, 0, 0, 0)
}

export function splitAmountIntoInstallments(totalAmount: number, installmentCount: number) {
  const baseAmount = Math.floor(totalAmount / installmentCount)
  const remainder = totalAmount % installmentCount

  return Array.from(
    { length: installmentCount },
    (_, index) => baseAmount + (index < remainder ? 1 : 0),
  )
}

export function buildInstallmentSchedule(
  totalAmount: number,
  installmentCount: number,
  date: Date,
) {
  const amounts = splitAmountIntoInstallments(totalAmount, installmentCount)

  return amounts.map((amount, index) => ({
    installmentNumber: index + 1,
    amount,
    date: addMonthsPreservingDay(date, index),
  }))
}

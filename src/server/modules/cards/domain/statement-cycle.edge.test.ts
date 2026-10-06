import { describe, expect, it } from 'vitest'
import { withFakeTime } from '../../../../../tests/helpers/clock'
import { getCreditCardStatementCycle, getCreditCardStatementStatus } from './statement-cycle'

// Casos de borda (virada de ano, dias 29/30/31, vencimento antes do fechamento) e status.
// Roda com TZ=America/Sao_Paulo (setup da suíte); o domínio 1.x ainda usa Date local.
const end = (y: number, m: number, d: number) => new Date(y, m, d, 23, 59, 59, 999)
const start = (y: number, m: number, d: number) => new Date(y, m, d, 0, 0, 0, 0)

describe('credit-card/statement-cycle: bordas', () => {
  it('virada de ano: compra de dezembro após o fechamento cai na fatura de janeiro', () => {
    const cycle = getCreditCardStatementCycle({
      transactionDate: new Date('2026-12-20T12:00:00.000Z'),
      closingDay: 10,
      dueDay: 17,
    })
    expect(cycle.periodStart).toEqual(start(2026, 11, 11))
    expect(cycle.closingDate).toEqual(end(2027, 0, 10))
    expect(cycle.dueDate).toEqual(end(2027, 0, 17))
  })

  it('compra em janeiro antes do fechamento tem início do ciclo em dezembro do ano anterior', () => {
    const cycle = getCreditCardStatementCycle({
      transactionDate: new Date('2026-01-05T12:00:00.000Z'),
      closingDay: 10,
      dueDay: 17,
    })
    expect(cycle.periodStart).toEqual(start(2025, 11, 11))
    expect(cycle.closingDate).toEqual(end(2026, 0, 10))
  })

  it('fechamento no dia 31 usa o último dia de meses curtos (fevereiro e abril)', () => {
    const feb = getCreditCardStatementCycle({
      transactionDate: new Date('2026-02-10T12:00:00.000Z'),
      closingDay: 31,
      dueDay: 31,
    })
    expect(feb.closingDate).toEqual(end(2026, 1, 28))
    expect(feb.periodStart).toEqual(start(2026, 1, 1))

    const apr = getCreditCardStatementCycle({
      transactionDate: new Date('2026-04-30T12:00:00.000Z'),
      closingDay: 31,
      dueDay: 31,
    })
    expect(apr.closingDate).toEqual(end(2026, 3, 30))
    expect(apr.periodStart).toEqual(start(2026, 3, 1))
  })

  it('compra exatamente no dia de fechamento ainda pertence à fatura que fecha naquele dia', () => {
    const cycle = getCreditCardStatementCycle({
      transactionDate: new Date('2026-10-10T12:00:00.000Z'),
      closingDay: 10,
      dueDay: 17,
    })
    expect(cycle.closingDate).toEqual(end(2026, 9, 10))
  })

  it('vencimento anterior ao fechamento vai para o mês seguinte (inclusive virada de ano)', () => {
    const oct = getCreditCardStatementCycle({
      transactionDate: new Date('2026-10-05T12:00:00.000Z'),
      closingDay: 25,
      dueDay: 5,
    })
    expect(oct.closingDate).toEqual(end(2026, 9, 25))
    expect(oct.dueDate).toEqual(end(2026, 10, 5))

    const dec = getCreditCardStatementCycle({
      transactionDate: new Date('2026-12-10T12:00:00.000Z'),
      closingDay: 25,
      dueDay: 5,
    })
    expect(dec.dueDate).toEqual(end(2027, 0, 5))
  })
})

describe('credit-card/statement-status', () => {
  const closingDate = end(2026, 9, 10)
  const dueDate = end(2026, 9, 17)

  it('PAID quando há total e nada em aberto (inclusive pagamento acima do total)', async () => {
    await withFakeTime(() => {
      expect(
        getCreditCardStatementStatus({
          closingDate,
          dueDate,
          totalAmount: 10000,
          paidAmount: 10000,
        }),
      ).toBe('PAID')
      expect(
        getCreditCardStatementStatus({
          closingDate,
          dueDate,
          totalAmount: 10000,
          paidAmount: 12000,
        }),
      ).toBe('PAID')
    }, '2026-10-20T12:00:00.000Z')
  })

  it('OVERDUE quando passou do vencimento com valor em aberto', async () => {
    await withFakeTime(() => {
      expect(
        getCreditCardStatementStatus({
          closingDate,
          dueDate,
          totalAmount: 10000,
          paidAmount: 4000,
        }),
      ).toBe('OVERDUE')
    }, '2026-10-20T12:00:00.000Z')
  })

  it('CLOSED depois do fechamento e antes do vencimento', async () => {
    await withFakeTime(() => {
      expect(
        getCreditCardStatementStatus({ closingDate, dueDate, totalAmount: 10000, paidAmount: 0 }),
      ).toBe('CLOSED')
    }, '2026-10-12T12:00:00.000Z')
  })

  it('OPEN antes do fechamento; fatura zerada nunca é PAID', async () => {
    await withFakeTime(() => {
      expect(
        getCreditCardStatementStatus({ closingDate, dueDate, totalAmount: 10000, paidAmount: 0 }),
      ).toBe('OPEN')
      expect(
        getCreditCardStatementStatus({ closingDate, dueDate, totalAmount: 0, paidAmount: 0 }),
      ).toBe('OPEN')
    }, '2026-10-05T12:00:00.000Z')
  })
})

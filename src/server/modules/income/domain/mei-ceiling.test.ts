import { describe, expect, it } from 'vitest'
import {
  ceilingRemaining,
  ceilingUsagePct,
  meiLevel,
  meiMessage,
  projectYearEnd,
  proportionalCeiling,
} from './mei-ceiling'

const d = (iso: string) => new Date(`${iso}T12:00:00.000Z`)
const CEILING = 8_100_000

describe('proportionalCeiling (RN-07)', () => {
  const ceil = (opened: string | null, year: number) =>
    proportionalCeiling({
      annualCeiling: CEILING,
      openedAt: opened === null ? null : d(opened),
      year,
    })

  it('CA-07', () => {
    expect(ceil('2026-03-10', 2026)).toBe(6_750_000)
    expect(ceil('2026-10-31', 2026)).toBe(2_025_000)
    expect(ceil('2026-01-02', 2026)).toBe(8_100_000)
    expect(ceil('2026-03-10', 2027)).toBe(8_100_000)
    expect(ceil('2026-03-10', 2025)).toBe(0)
  })

  it('por mês de abertura (jan a dez): 12 - mês + 1 meses', () => {
    const expected = [
      8_100_000, 7_425_000, 6_750_000, 6_075_000, 5_400_000, 4_725_000, 4_050_000, 3_375_000,
      2_700_000, 2_025_000, 1_350_000, 675_000,
    ]
    for (let month = 1; month <= 12; month += 1) {
      const iso = `2026-${String(month).padStart(2, '0')}-15`
      expect(ceil(iso, 2026)).toBe(expected[month - 1])
    }
  })

  it('abertura desconhecida => teto cheio', () => {
    expect(ceil(null, 2026)).toBe(8_100_000)
  })

  it('arredonda metade para cima quando o teto não divide por 12', () => {
    // 100 * 7 / 12 = 58,33 => 58; 100 * 6 / 12 = 50; 1000 * 7 / 12 = 583,33 => 583; 30 * 5 / 12 = 12,5 => 13
    expect(proportionalCeiling({ annualCeiling: 30, openedAt: d('2026-08-01'), year: 2026 })).toBe(
      13,
    )
    expect(proportionalCeiling({ annualCeiling: 100, openedAt: d('2026-06-01'), year: 2026 })).toBe(
      58,
    )
  })

  it('teto parametrizável (não é constante de código)', () => {
    expect(
      proportionalCeiling({ annualCeiling: 12_000, openedAt: d('2026-07-01'), year: 2026 }),
    ).toBe(6_000)
  })
})

describe('meiLevel (RN-09, só inteiros)', () => {
  const level = (accumulated: number, ceiling = 6_750_000) => meiLevel({ accumulated, ceiling })

  it('CA-08 com teto 6750000', () => {
    expect(level(5_399_999)).toBe('OK')
    expect(level(5_400_000)).toBe('ATTENTION')
    expect(level(6_412_499)).toBe('ATTENTION')
    expect(level(6_412_500)).toBe('CRITICAL')
    expect(level(6_749_999)).toBe('CRITICAL')
    expect(level(6_750_000)).toBe('EXCEEDED')
    expect(level(8_099_999)).toBe('EXCEEDED')
    expect(level(8_100_000)).toBe('SEVERE')
  })

  it('CA-08: teto 0 e acumulado 0 => OK (sem divisão por zero)', () => {
    expect(level(0, 0)).toBe('OK')
  })

  it('teto 0 com receita => SEVERE', () => {
    expect(level(1, 0)).toBe('SEVERE')
  })

  it('bordas 80/95/100/120% com teto 8100000 (-1 centavo, exato, +1 centavo)', () => {
    const c = 8_100_000
    expect(level(6_479_999, c)).toBe('OK')
    expect(level(6_480_000, c)).toBe('ATTENTION')
    expect(level(6_480_001, c)).toBe('ATTENTION')
    expect(level(7_694_999, c)).toBe('ATTENTION')
    expect(level(7_695_000, c)).toBe('CRITICAL')
    expect(level(7_695_001, c)).toBe('CRITICAL')
    expect(level(8_099_999, c)).toBe('CRITICAL')
    expect(level(8_100_000, c)).toBe('EXCEEDED')
    expect(level(8_100_001, c)).toBe('EXCEEDED')
    expect(level(9_719_999, c)).toBe('EXCEEDED')
    expect(level(9_720_000, c)).toBe('SEVERE')
    expect(level(9_720_001, c)).toBe('SEVERE')
  })

  // 79,99 / 80 / 94,99 / 95 / 99,99 / 100 / 119,99 / 120% do teto, em centavos exatos.
  describe.each([
    ['teto cheio 8100000', 8_100_000],
    ['teto proporcional 6750000 (aberto em março)', 6_750_000],
    ['teto proporcional 4050000 (aberto em julho)', 4_050_000],
  ])('bordas em percentual (%s)', (_label, ceiling) => {
    const at = (basisPoints: number) => (ceiling * basisPoints) / 10_000
    it.each([
      [7_999, 'OK'],
      [8_000, 'ATTENTION'],
      [9_499, 'ATTENTION'],
      [9_500, 'CRITICAL'],
      [9_999, 'CRITICAL'],
      [10_000, 'EXCEEDED'],
      [11_999, 'EXCEEDED'],
      [12_000, 'SEVERE'],
    ])('%i pontos-base do teto => %s', (basisPoints, expected) => {
      expect(meiLevel({ accumulated: at(basisPoints), ceiling })).toBe(expected)
    })
  })

  it('acumulado 0 com teto positivo => OK', () => {
    expect(level(0)).toBe('OK')
  })
})

describe('meiMessage', () => {
  it('textos informativos por nível', () => {
    expect(meiMessage('OK')).toBeNull()
    expect(meiMessage('ATTENTION')).toBe('Você usou 80% do teto do MEI')
    expect(meiMessage('CRITICAL')).toBe(
      'Você já usou 95% do teto do MEI: a margem restante é pequena',
    )
    expect(meiMessage('EXCEEDED')).toBe(
      'Teto ultrapassado: o excedente de até 20% exige DAS complementar',
    )
    expect(meiMessage('SEVERE')).toBe(
      'Acima de 120% do teto: risco de desenquadramento do MEI, fale com seu contador',
    )
  })
})

describe('ceilingRemaining / ceilingUsagePct', () => {
  it('restante pode ser negativo', () => {
    expect(ceilingRemaining(6_750_000, 5_400_000)).toBe(1_350_000)
    expect(ceilingRemaining(6_750_000, 7_000_000)).toBe(-250_000)
  })

  it('percentual com 2 casas; teto 0 => 0', () => {
    expect(ceilingUsagePct(5_400_000, 6_750_000)).toBe(80)
    expect(ceilingUsagePct(1, 3)).toBe(33.33)
    expect(ceilingUsagePct(10, 0)).toBe(0)
  })
})

describe('projectYearEnd', () => {
  const months = (values: number[]) => [...values, ...new Array(12 - values.length).fill(0)]

  it('0 meses decorridos: sem divisão por zero, projeção = realizado', () => {
    const result = projectYearEnd({
      byMonth: months([100_000]),
      monthsElapsed: 0,
      ceiling: 1_000_000,
    })
    expect(result.monthlyAverage).toBe(0)
    expect(result.projectedTotal).toBe(100_000)
    expect(result.willExceed).toBe(false)
    expect(result.exceedMonth).toBeNull()
  })

  it('média dos meses fechados aplicada aos restantes', () => {
    // 3 meses fechados de 500000: média 500000; projeção = 12 x 500000 = 6.000.000
    const result = projectYearEnd({
      byMonth: months([500_000, 500_000, 500_000]),
      monthsElapsed: 3,
      ceiling: 8_100_000,
    })
    expect(result.monthlyAverage).toBe(500_000)
    expect(result.projectedTotal).toBe(6_000_000)
    expect(result.willExceed).toBe(false)
  })

  it('excesso: indica o mês em que o acumulado projetado passa do teto', () => {
    // média 800000 x 12 = 9.600.000 > 8.100.000; passa em outubro (10 x 800000 = 8.000.000 não; 11 sim => nov)
    const result = projectYearEnd({
      byMonth: months([800_000, 800_000, 800_000, 800_000]),
      monthsElapsed: 4,
      ceiling: 8_100_000,
    })
    expect(result.projectedTotal).toBe(9_600_000)
    expect(result.willExceed).toBe(true)
    expect(result.exceedMonth).toBe(11)
  })

  it('excesso já realizado em mês fechado', () => {
    const result = projectYearEnd({
      byMonth: months([5_000_000, 5_000_000]),
      monthsElapsed: 2,
      ceiling: 8_100_000,
    })
    expect(result.exceedMonth).toBe(2)
  })

  it('mês corrente (aberto) mantém o realizado quando maior que a média', () => {
    const result = projectYearEnd({
      byMonth: months([100_000, 100_000, 100_000, 900_000]),
      monthsElapsed: 3,
      ceiling: 8_100_000,
    })
    // 3 x 100000 + 900000 (mês aberto, maior que a média) + 8 x 100000
    expect(result.projectedTotal).toBe(300_000 + 900_000 + 800_000)
  })

  it('ano de abertura: média só sobre os meses de atividade e zero antes', () => {
    // aberto em julho (mês 7); fechados julho-setembro (3 meses de 400000)
    const byMonth = [0, 0, 0, 0, 0, 0, 400_000, 400_000, 400_000]
    const result = projectYearEnd({
      byMonth: months(byMonth),
      monthsElapsed: 9,
      ceiling: 3_375_000, // teto proporcional de 6 meses (jul-dez)... ver proportionalCeiling
      firstActiveMonth: 7,
    })
    expect(result.monthlyAverage).toBe(400_000)
    expect(result.projectedByMonth.slice(0, 6)).toEqual([0, 0, 0, 0, 0, 0])
    expect(result.projectedTotal).toBe(6 * 400_000)
    expect(result.willExceed).toBe(false)
  })

  it('ano encerrado (12 meses fechados): projeção = total real', () => {
    const result = projectYearEnd({
      byMonth: new Array(12).fill(100_000),
      monthsElapsed: 12,
      ceiling: 1_000_000,
    })
    expect(result.projectedTotal).toBe(1_200_000)
    expect(result.willExceed).toBe(true)
    expect(result.exceedMonth).toBe(11)
  })
})

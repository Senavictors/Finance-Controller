import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  ALLOWED_EMAILS,
  checkFixtureFilename,
  findSensitivePatterns,
  isValidCnpj,
  isValidCpf,
  passesLuhn,
  type RuleName,
} from './no-real-data'
import {
  ALLOWLIST,
  formatFinding,
  isExcluded,
  maskMatch,
  scanFiles,
  scanRepo,
  staleAllowlistEntries,
  type AllowEntry,
} from './scan'

/**
 * Todos os exemplos sensíveis abaixo são MONTADOS EM TEMPO DE EXECUÇÃO (geradores e concatenação),
 * para que este arquivo não contenha, ele próprio, um padrão real que o guard recusaria.
 */

function cpfDv(digits: string, weightStart: number): number {
  let sum = 0
  for (let i = 0; i < digits.length; i++) sum += Number(digits[i]) * (weightStart - i)
  return ((sum * 10) % 11) % 10
}

/** CPF com DVs válidos a partir de 9 dígitos-base (somente dígitos). */
function makeCpf(base9: string): string {
  const d1 = cpfDv(base9, 10)
  const d2 = cpfDv(base9 + d1, 11)
  return `${base9}${d1}${d2}`
}

function cnpjDv(digits: string): number {
  const weights =
    digits.length === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  let sum = 0
  for (let i = 0; i < digits.length; i++) sum += Number(digits[i]) * weights[i]
  const rest = sum % 11
  return rest < 2 ? 0 : 11 - rest
}

/** CNPJ com DVs válidos a partir de 12 dígitos-base (somente dígitos). */
function makeCnpj(base12: string): string {
  const d1 = cnpjDv(base12)
  const d2 = cnpjDv(base12 + d1)
  return `${base12}${d1}${d2}`
}

/** Número com dígito de Luhn válido a partir do corpo (sem o dígito verificador). */
function makeLuhn(body: string): string {
  for (let check = 0; check <= 9; check++) {
    if (passesLuhn(`${body}${check}`)) return `${body}${check}`
  }
  throw new Error('impossível')
}

function rules(text: string): RuleName[] {
  return findSensitivePatterns(text).map((f) => f.rule)
}

const CPF = makeCpf('390533447')
const CPF_PUNCTUATED = `${CPF.slice(0, 3)}.${CPF.slice(3, 6)}.${CPF.slice(6, 9)}-${CPF.slice(9)}`
const CNPJ = makeCnpj('112223330001')
const CNPJ_PUNCTUATED = `${CNPJ.slice(0, 2)}.${CNPJ.slice(2, 5)}.${CNPJ.slice(5, 8)}/${CNPJ.slice(8, 12)}-${CNPJ.slice(12)}`
const CARD = makeLuhn('411111111111111') // 16 dígitos
const CARD_SPACED = CARD.replace(/(\d{4})(?=\d)/g, '$1 ')
const GMAIL = ['pessoa.real', ['gmail', 'com'].join('.')].join('@')

describe('validadores', () => {
  it('CPF: aceita DV válido; recusa DV errado e dígitos repetidos', () => {
    expect(isValidCpf(CPF)).toBe(true)
    expect(isValidCpf(CPF.slice(0, 10) + String((Number(CPF[10]) + 1) % 10))).toBe(false)
    expect(isValidCpf('1'.repeat(11))).toBe(false)
  })

  it('CNPJ: aceita DV válido; recusa DV errado e dígitos repetidos', () => {
    expect(isValidCnpj(CNPJ)).toBe(true)
    expect(isValidCnpj(CNPJ.slice(0, 13) + String((Number(CNPJ[13]) + 1) % 10))).toBe(false)
    expect(isValidCnpj('0'.repeat(14))).toBe(false)
  })

  it('Luhn: aceita número válido e recusa o corrompido', () => {
    expect(passesLuhn(CARD)).toBe(true)
    expect(passesLuhn(CARD.slice(0, 15) + String((Number(CARD[15]) + 1) % 10))).toBe(false)
  })
})

describe('findSensitivePatterns: positivos', () => {
  it('CPF formatado válido', () => {
    expect(rules(`titular ${CPF_PUNCTUATED}`)).toContain('cpf')
  })

  it('CPF formatado é sempre sinalizado, mesmo com DV inválido', () => {
    const invalid = ['123', '456', '789'].join('.') + '-00'
    expect(isValidCpf(invalid)).toBe(false)
    expect(rules(invalid)).toContain('cpf')
  })

  it('11 dígitos contíguos com DV válido', () => {
    expect(rules(`cpf ${CPF}`)).toContain('cpf')
  })

  it('CNPJ formatado e contíguo válido', () => {
    expect(rules(CNPJ_PUNCTUATED)).toContain('cnpj')
    expect(rules(`doc ${CNPJ}`)).toContain('cnpj')
  })

  it('cartão que passa em Luhn (contíguo e com espaços)', () => {
    expect(rules(`cartao ${CARD}`)).toContain('cartao')
    expect(rules(`cartao ${CARD_SPACED}`)).toContain('cartao')
    expect(rules(`cartao ${CARD.replace(/(\d{4})(?=\d)/g, '$1-')}`)).toContain('cartao')
  })

  it('agência e conta com números (montados em tempo de execução)', () => {
    expect(rules(['agencia', ' ', '1234'].join(''))).toContain('agencia-conta')
    expect(rules(['Ag', ': ', '0123'].join(''))).toContain('agencia-conta')
    expect(rules(['conta', ' ', '12345-6'].join(''))).toContain('agencia-conta')
    expect(rules(['Conta corrente', ' ', '987654-3'].join(''))).toContain('agencia-conta')
    expect(rules(['c/c', ' ', '123456'].join(''))).toContain('agencia-conta')
  })

  it('e-mail de provedor público', () => {
    expect(rules(`contato: ${GMAIL}`)).toContain('email')
  })

  it('telefone com DDD entre parênteses, com +55 e com hífens', () => {
    expect(rules(['(', '11', ') ', '9', '8765', '-', '4321'].join(''))).toContain('telefone-br')
    expect(rules(['+55 ', '11', ' ', '9', '8765', '-', '4321'].join(''))).toContain('telefone-br')
    expect(rules(['11', '-', '9', '8765', '-', '4321'].join(''))).toContain('telefone-br')
  })

  it('chave Pix aleatória (UUID v4) em contexto pix/chave', () => {
    const uuid = ['123e4567', 'e89b', '42d3', 'a456', '426614174000'].join('-')
    expect(rules(`chave pix: ${uuid}`)).toContain('chave-pix-aleatoria')
    expect(rules(`id ${uuid}`)).not.toContain('chave-pix-aleatoria')
  })

  it('CPF contíguo em CSV separado por vírgula (antes e depois do campo)', () => {
    expect(rules(`2026-01-01,${CPF},100.00`)).toContain('cpf')
    expect(rules(`2026-01-01,mercado,100,${CPF}`)).toContain('cpf')
    expect(rules(`${CPF},50`)).toContain('cpf')
    expect(rules(`0,${CPF}`)).toContain('cpf')
    expect(rules(`2026-01-01;${CPF};100,00`)).toContain('cpf')
  })

  it('CPF formatado precedido de ponto de prefixo (doc.<cpf>)', () => {
    expect(rules(`doc.${CPF_PUNCTUATED}`)).toContain('cpf')
    expect(rules(`1.${CPF_PUNCTUATED}`)).not.toContain('cpf')
  })

  it('cartão Luhn em CSV com vírgula e após hífen (cartao-<n>)', () => {
    expect(rules(`nome,${CARD},10`)).toContain('cartao')
    expect(rules(`${CARD},10`)).toContain('cartao')
    expect(rules(`cartao-${CARD}`)).toContain('cartao')
    expect(rules(`cartao-${CARD_SPACED}`)).toContain('cartao')
  })

  it('telefone com dígitos contíguos (11 dígitos) ou DDD + espaço + 9 dígitos', () => {
    const ddd = '11'
    const num = ['9', '9999', '8888'].join('')
    expect(rules(`tel ${ddd}${num}`)).toContain('telefone-br')
    expect(rules(`tel ${ddd} ${num}`)).toContain('telefone-br')
    expect(rules(`2026-01-01,mercado,${ddd}${num},100.00`)).toContain('telefone-br')
    expect(rules(`+55 ${ddd}${num}`)).toEqual(['telefone-br'])
    expect(rules(`tel-${ddd}${num}`)).toContain('telefone-br')
  })

  it('11 dígitos que são CPF válido e também têm formato de telefone: só `cpf`', () => {
    // procura em tempo de execução um CPF válido com formato DDD(11-99)+9+8 dígitos
    let found: string | null = null
    for (let n = 0; n < 100000 && !found; n++) {
      const base = `${(n % 90) + 10}9${String(Math.floor(n / 90)).padStart(6, '0')}`
      const candidate = makeCpf(base)
      if (/^[1-9][1-9]9\d{8}$/.test(candidate)) found = candidate
    }
    expect(found).not.toBeNull()
    expect(rules(`id ${found}`)).toEqual(['cpf'])
  })

  it('informa a linha (1-based) do achado', () => {
    const findings = findSensitivePatterns(`ok\nok\ncpf ${CPF}\nok`)
    expect(findings).toEqual([{ rule: 'cpf', match: CPF, line: 3 }])
  })
})

describe('findSensitivePatterns: negativos', () => {
  it('texto vazio não gera achados', () => {
    expect(findSensitivePatterns('')).toEqual([])
  })

  it('11 dígitos com DV inválido não são CPF', () => {
    const invalid = CPF.slice(0, 10) + String((Number(CPF[10]) + 1) % 10)
    expect(rules(invalid)).not.toContain('cpf')
  })

  it('valor monetário com 11 dígitos não é CPF (R$ antes, centavos depois)', () => {
    expect(rules(`total R$ ${CPF},50`)).not.toContain('cpf')
    expect(rules(`total R$${CPF}`)).not.toContain('cpf')
    expect(rules(`total R$  ${CPF},50`)).not.toContain('cpf')
  })

  it('CSV com vírgula: DV inválido, R$ explícito e valores comuns continuam não detectados', () => {
    const invalid = CPF.slice(0, 10) + String((Number(CPF[10]) + 1) % 10)
    expect(rules(`2026-01-01,${invalid},100.00`)).not.toContain('cpf')
    expect(rules(`2026-01-01,mercado,R$ 100,00`)).toEqual([])
    expect(rules(`2026-01-01,mercado,"1.234,56",05/10/2026`)).toEqual([])
    expect(rules(`0.${CARD}`)).not.toContain('cartao')
  })

  it('telefone contíguo: valor monetário (R$), 10 dígitos, DDD com zero e timestamps não disparam', () => {
    const num = ['9', '9999', '8888'].join('')
    expect(rules(`total R$ 11${num}`)).not.toContain('telefone-br')
    expect(rules(`tel 11${num.slice(0, 8)}`)).not.toContain('telefone-br') // 10 dígitos
    expect(rules(`tel 01${num}`)).not.toContain('telefone-br')
    expect(rules(`tel 10${num}`)).not.toContain('telefone-br')
    expect(rules(`tel 11${num}9`)).not.toContain('telefone-br') // 12 dígitos
    expect(rules('<DTPOSTED>20261005120000[-3:BRT]')).toEqual([])
    expect(rules('1.234,56 05/10/2026 20261005')).toEqual([])
  })

  it('16 dígitos sem Luhn não são cartão', () => {
    const invalid = CARD.slice(0, 15) + String((Number(CARD[15]) + 1) % 10)
    expect(rules(invalid)).not.toContain('cartao')
  })

  it('timestamp OFX compacto não é CNPJ nem cartão', () => {
    expect(rules('<DTPOSTED>20261005120000[-3:BRT]')).toEqual([])
    expect(rules('20261005120000')).toEqual([])
  })

  it('"agenda 2026" e números de conta sem rótulo não disparam', () => {
    expect(rules('agenda 2026')).not.toContain('agencia-conta')
    expect(rules('AGENCIA-EXEMPLO CONTA-EXEMPLO')).toEqual([])
  })

  it('número só de zeros após o rótulo é placeholder de layout', () => {
    expect(rules(['Conta', ': ', '00000-0'].join(''))).not.toContain('agencia-conta')
  })

  it('e-mails de domínios reservados e o e-mail público do dono são permitidos', () => {
    expect(rules('contato@example.com')).toEqual([])
    expect(rules('contato@example.org')).toEqual([])
    expect(rules('contato@dominio.test')).toEqual([])
    expect(rules('contato@dominio.invalid')).toEqual([])
    for (const owner of ALLOWED_EMAILS) expect(rules(`autor ${owner}`)).toEqual([])
  })

  it('URL de conexão com usuário e senha e usuario@localhost não contam como e-mail', () => {
    const url = ['postgresql://', 'ci:ci', '@', 'db.exemplo-host.net', ':5432/ci'].join('')
    expect(rules(url)).not.toContain('email')
    expect(rules('usuario@localhost')).toEqual([])
  })

  it('valores monetários formatados, datas e versões não disparam', () => {
    expect(rules('Total 1.234,56 em 05/10/2026 (R$ 10.000,00)')).toEqual([])
    expect(rules('next@16.2.3 e react@19.2.4')).toEqual([])
    expect(rules('2026-10-05T12:00:00.000Z')).toEqual([])
  })
})

describe('checkFixtureFilename', () => {
  it('aceita sintetico-/synthetic- com extensão permitida e README/.gitkeep', () => {
    expect(checkFixtureFilename('ofx/sintetico-conta.ofx')).toBeNull()
    expect(checkFixtureFilename('csv/synthetic-extrato.csv')).toBeNull()
    expect(checkFixtureFilename('README.md')).toBeNull()
    expect(checkFixtureFilename('pdf/.gitkeep')).toBeNull()
  })

  it('recusa nome sem prefixo ou extensão fora da lista', () => {
    expect(checkFixtureFilename('csv/extrato-real.csv')?.rule).toBe('filename')
    expect(checkFixtureFilename('ofx/sintetico-x.exe')?.rule).toBe('filename')
    expect(checkFixtureFilename('ofx/sintetico-sem-extensao')?.rule).toBe('filename')
  })
})

describe('scanFiles / allowlist', () => {
  const file = 'docs/exemplo.md'
  const allow = (count: number): Record<string, AllowEntry[]> => ({
    [file]: [{ rule: 'email', count, motivo: 'teste' }],
  })

  it('arquivo limpo não gera violações', () => {
    const r = scanFiles([{ path: file, content: 'texto simples' }], {})
    expect(r.violations).toEqual([])
    expect(r.allowlistErrors).toEqual([])
  })

  it('achado fora da allowlist vira violação com arquivo e linha', () => {
    const r = scanFiles([{ path: file, content: `a\n${GMAIL}` }], {})
    expect(r.violations).toHaveLength(1)
    expect(r.violations[0]).toMatchObject({ file, line: 2, rule: 'email' })
    expect(formatFinding(r.violations[0])).toContain(`${file}:2 [email]`)
    expect(formatFinding(r.violations[0])).not.toContain(GMAIL)
  })

  it('allowlist com contagem exata suprime os achados', () => {
    const r = scanFiles([{ path: file, content: GMAIL }], allow(1))
    expect(r.violations).toEqual([])
    expect(r.allowlistErrors).toEqual([])
  })

  it('contagem divergente (mais ou menos) falha: achados ficam e o erro é reportado', () => {
    const more = scanFiles([{ path: file, content: `${GMAIL}\n${GMAIL}` }], allow(1))
    expect(more.violations).toHaveLength(2)
    expect(more.allowlistErrors).toHaveLength(1)

    const fewer = scanFiles([{ path: file, content: 'limpo' }], allow(1))
    expect(fewer.violations).toEqual([])
    expect(fewer.allowlistErrors).toHaveLength(1)
  })

  it('fixtures nunca têm exceção, mesmo se listadas na allowlist', () => {
    const fixture = 'tests/fixtures/csv/sintetico-x.csv'
    const r = scanFiles([{ path: fixture, content: GMAIL }], {
      [fixture]: [{ rule: 'email', count: 1, motivo: 'tentativa' }],
    })
    expect(r.violations).toHaveLength(1)
  })

  it('fixture sem prefixo falha pela regra filename (binários só têm o nome validado)', () => {
    const r = scanFiles([{ path: 'tests/fixtures/csv/extrato-real.csv', content: 'a;b' }], {})
    expect(r.violations.map((v) => v.rule)).toEqual(['filename'])
    const pdf = scanFiles([{ path: 'tests/fixtures/pdf/fatura.pdf', content: null }], {})
    expect(pdf.violations.map((v) => v.rule)).toEqual(['filename'])
  })

  it('entrada de allowlist para arquivo ausente do escopo é obsoleta', () => {
    expect(staleAllowlistEntries(['a.md'], allow(1))).toHaveLength(1)
    expect(staleAllowlistEntries([file], allow(1))).toEqual([])
  })

  it('maskMatch esconde o trecho', () => {
    expect(maskMatch(CPF)).not.toContain(CPF)
    expect(maskMatch('abc')).toBe('***')
  })

  it('isExcluded cobre dependências, código gerado e lockfile', () => {
    expect(isExcluded('node_modules/x/index.js')).toBe(true)
    expect(isExcluded('src/generated/prisma/client.ts')).toBe(true)
    expect(isExcluded('package-lock.json')).toBe(true)
    expect(isExcluded('docs/readme.md')).toBe(false)
  })
})

describe('varredura do repositório (guard:data)', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

  it('nenhum dado real em arquivos versionados (tests/fixtures, docs, .agents, src...)', () => {
    const result = scanRepo(root)
    const report = [...result.violations.map(formatFinding), ...result.allowlistErrors]
    expect(report).toEqual([])
    expect(result.scannedFiles).toBeGreaterThan(50)
  })

  it('a allowlist é pequena e cada entrada tem motivo', () => {
    for (const [file, entries] of Object.entries(ALLOWLIST)) {
      expect(file.startsWith('tests/fixtures/')).toBe(false)
      for (const e of entries) {
        expect(e.motivo.length).toBeGreaterThan(10)
        expect(e.count).toBeGreaterThan(0)
      }
    }
  })
})

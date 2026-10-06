/**
 * Detectores puros de dados pessoais/financeiros reais (Constituição: dados reais fora do Git).
 *
 * Sem I/O. `findSensitivePatterns(text)` devolve achados com regra, trecho e linha (1-based).
 * A varredura de arquivos, a allowlist e o relatório ficam em `./scan.ts`.
 *
 * Decisões de desenho (ver task FC2-F0-07):
 * - CPF com pontuação (3 grupos de 3 dígitos, hífen, 2 dígitos) é SEMPRE sinalizado, mesmo com
 *   DV inválido.
 * - Agência/conta com número só de zeros é placeholder de layout (ex.: "Conta: 00000-0"), não dado.
 * - Sequências contíguas só são sinalizadas se passarem nos dígitos verificadores (CPF/CNPJ) ou em
 *   Luhn (cartão); timestamps compactos (AAAAMMDD...) nunca são tratados como CNPJ/cartão.
 * - Valores monetários (`R$ 12345678901,50`) não contam como CPF.
 * - Telefone exige DDD entre parênteses, prefixo +55, ou grupos separados por hífen/espaço.
 */

export type RuleName =
  | 'cpf'
  | 'cnpj'
  | 'agencia-conta'
  | 'cartao'
  | 'email'
  | 'telefone-br'
  | 'chave-pix-aleatoria'
  | 'filename'

export interface Finding {
  rule: RuleName
  match: string
  /** Linha 1-based; 0 para achados sobre o nome do arquivo. */
  line: number
}

/**
 * E-mails exatos que podem aparecer no repositório: identidade pública de commit do dono
 * (hook `.githooks/pre-commit`, AGENTS.md, regras). Comparação exata e case-insensitive.
 * NÃO adicionar outros e-mails aqui: use a allowlist por arquivo em `./scan.ts`
 * (com contagem fixa e motivo).
 */
export const ALLOWED_EMAILS: ReadonlySet<string> = new Set(['victorsena760@gmail.com'])

const ALLOWED_EMAIL_DOMAINS = new Set(['example.com', 'example.org'])
const ALLOWED_EMAIL_DOMAIN_SUFFIXES = ['.test', '.invalid']

// ---------- Validadores numéricos ----------

function allSameDigit(digits: string): boolean {
  return /^(\d)\1+$/.test(digits)
}

export function isValidCpf(input: string): boolean {
  const d = input.replace(/\D/g, '')
  if (d.length !== 11 || allSameDigit(d)) return false
  for (const len of [9, 10]) {
    let sum = 0
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i)
    const dv = ((sum * 10) % 11) % 10
    if (dv !== Number(d[len])) return false
  }
  return true
}

export function isValidCnpj(input: string): boolean {
  const d = input.replace(/\D/g, '')
  if (d.length !== 14 || allSameDigit(d)) return false
  const calc = (len: number): number => {
    const weights =
      len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    let sum = 0
    for (let i = 0; i < len; i++) sum += Number(d[i]) * weights[i]
    const rest = sum % 11
    return rest < 2 ? 0 : 11 - rest
  }
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13])
}

export function passesLuhn(input: string): boolean {
  const d = input.replace(/\D/g, '')
  if (d.length < 13 || d.length > 19) return false
  let sum = 0
  let double = false
  for (let i = d.length - 1; i >= 0; i--) {
    let n = Number(d[i])
    if (double) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
    double = !double
  }
  return sum % 10 === 0
}

/** Timestamps compactos (AAAAMMDD[HHMMSS...]) 2000-2099: nunca são CNPJ/cartão. */
function looksLikeCompactDate(digits: string): boolean {
  return /^20\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])/.test(digits)
}

/** Faixas de IIN plausíveis: 3, 4, 5, 6 e a série 2221-2720 do Mastercard. */
function plausibleCardPrefix(digits: string): boolean {
  if (/^[3-6]/.test(digits)) return true
  const p4 = Number(digits.slice(0, 4))
  return p4 >= 2221 && p4 <= 2720
}

// ---------- Detectores por linha ----------

function* matches(re: RegExp, line: string): Generator<RegExpExecArray> {
  const global = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')
  let m: RegExpExecArray | null
  while ((m = global.exec(line)) !== null) {
    if (m[0] === '') global.lastIndex++
    yield m
  }
}

function detectCpf(line: string): string[] {
  const out: string[] = []
  // Aceita prefixo textual colado por ponto (rótulo + CPF); recusa quando o CPF faz parte de um número maior.
  for (const m of matches(/(?<!\d|\d\.)\d{3}\.\d{3}\.\d{3}-\d{2}(?!\d)/, line)) out.push(m[0])
  for (const m of matches(/(?<!\w)\d{11}(?!\w)/, line)) {
    const before = line.slice(0, m.index)
    if (/R\$\s*$/.test(before)) continue // valor monetário explícito; vírgula/ponto NÃO excluem
    if (isValidCpf(m[0])) out.push(m[0])
  }
  return out
}

function detectCnpj(line: string): string[] {
  const out: string[] = []
  for (const m of matches(/(?<!\d|\d\.)\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}(?!\d)/, line))
    out.push(m[0])
  for (const m of matches(/(?<!\w)\d{14}(?!\w)/, line)) {
    if (looksLikeCompactDate(m[0])) continue
    if (isValidCnpj(m[0])) out.push(m[0])
  }
  return out
}

function detectCard(line: string): string[] {
  const out: string[] = []
  const candidates = [
    ...matches(/(?<!\w|\d\.)\d{13,19}(?![\w])/, line),
    ...matches(/(?<!\w|\d\.)\d{4}([ -])\d{4}\1\d{4}\1\d{1,7}(?![\w])/, line),
    ...matches(/(?<!\w|\d\.)\d{4}([ -])\d{6}\1\d{5}(?![\w])/, line),
  ]
  for (const m of candidates) {
    const digits = m[0].replace(/\D/g, '')
    if (allSameDigit(digits) || looksLikeCompactDate(digits)) continue
    if (plausibleCardPrefix(digits) && passesLuhn(digits)) out.push(m[0])
  }
  return out
}

function detectAgenciaConta(line: string): string[] {
  const out: string[] = []
  const candidates = [
    ...matches(/\b(?:ag[eê]ncia|ag\.?)[ \t]*[:-]?[ \t]*\d{3,5}/i, line),
    ...matches(/\b(?:conta(?:[ \t]+corrente)?|c\/c|cc)[ \t]*[:-]?[ \t]*\d{4,}-?\d?/i, line),
  ]
  for (const m of candidates) {
    const digits = m[0].replace(/\D/g, '')
    if (/^0+$/.test(digits)) continue // placeholder de layout, não é número real
    out.push(m[0])
  }
  return out
}

function emailAllowed(email: string): boolean {
  const lower = email.toLowerCase()
  if (ALLOWED_EMAILS.has(lower)) return true
  const domain = lower.slice(lower.indexOf('@') + 1)
  if (ALLOWED_EMAIL_DOMAINS.has(domain)) return true
  return ALLOWED_EMAIL_DOMAIN_SUFFIXES.some((suffix) => domain.endsWith(suffix))
}

function detectEmail(line: string): string[] {
  const out: string[] = []
  // user:senha@host em URLs de conexão não é e-mail.
  const urlSpans = [...matches(/[a-z][a-z0-9+.-]*:\/\/[^\s@/]*@[^\s/]+/i, line)].map((m) => [
    m.index,
    m.index + m[0].length,
  ])
  for (const m of matches(/[A-Za-z0-9._%+-]+@(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,}(?![\w-])/, line)) {
    const start = m.index
    if (urlSpans.some(([s, e]) => start >= s && start < e)) continue
    if (!emailAllowed(m[0])) out.push(m[0])
  }
  return out
}

function detectPhone(line: string): string[] {
  const out: string[] = []
  const spans: Array<[number, number]> = []
  const res = [
    /(?<![\w-])\+55[ \t]?\(?\d{2}\)?[ \t]?9?\d{4}-?\d{4}(?!\d)/,
    /(?<![\w-])\(\d{2}\)[ \t]?9?\d{4}-?\d{4}(?!\d)/,
    /(?<![\w-])\d{2}[ \t-]9?\d{4}-\d{4}(?![\d-])/,
  ]
  for (const re of res) {
    for (const m of matches(re, line)) {
      out.push(m[0])
      spans.push([m.index, m.index + m[0].length])
    }
  }
  // 11 dígitos contíguos (ou DDD + espaço + 9 dígitos): DDD 11-99 (sem zero) + 9 + 8 dígitos.
  for (const m of matches(/(?<!\w)[1-9][1-9][ \t]?9\d{8}(?!\w)/, line)) {
    const end = m.index + m[0].length
    if (spans.some(([s, e]) => m.index < e && end > s)) continue // já coberto por regra acima
    if (/R\$\s*$/.test(line.slice(0, m.index))) continue
    // Precedência: contíguo que também é CPF válido é reportado só como `cpf`.
    if (/^\d{11}$/.test(m[0]) && isValidCpf(m[0])) continue
    out.push(m[0])
  }
  return out
}

function detectPixKey(line: string): string[] {
  if (!/pix|chave/i.test(line)) return []
  return [
    ...matches(/\b[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i, line),
  ].map((m) => m[0])
}

const LINE_DETECTORS: ReadonlyArray<[RuleName, (line: string) => string[]]> = [
  ['cpf', detectCpf],
  ['cnpj', detectCnpj],
  ['agencia-conta', detectAgenciaConta],
  ['cartao', detectCard],
  ['email', detectEmail],
  ['telefone-br', detectPhone],
  ['chave-pix-aleatoria', detectPixKey],
]

/** Varre um texto e devolve todos os achados (sem aplicar allowlist). */
export function findSensitivePatterns(text: string): Finding[] {
  const findings: Finding[] = []
  const lines = text.split(/\r?\n/)
  lines.forEach((line, idx) => {
    for (const [rule, detect] of LINE_DETECTORS) {
      for (const match of detect(line)) findings.push({ rule, match, line: idx + 1 })
    }
  })
  return findings
}

// ---------- Nome de arquivo em tests/fixtures ----------

export const FIXTURE_ALLOWED_EXTENSIONS: readonly string[] = [
  '.ofx',
  '.csv',
  '.json',
  '.txt',
  '.pdf',
  '.md',
]
export const FIXTURE_ALLOWED_PLAIN_NAMES: readonly string[] = ['README.md', '.gitkeep']

/**
 * Valida o nome de um arquivo dentro de `tests/fixtures`: prefixo `sintetico-`/`synthetic-` e
 * extensão permitida (exceto `README.md` e `.gitkeep`). `relativePath` usa `/` como separador.
 */
export function checkFixtureFilename(relativePath: string): Finding | null {
  const base = relativePath.split('/').pop() ?? relativePath
  if (FIXTURE_ALLOWED_PLAIN_NAMES.includes(base)) return null
  const dot = base.lastIndexOf('.')
  const ext = dot >= 0 ? base.slice(dot).toLowerCase() : ''
  const prefixOk = /^(sintetico|synthetic)-/i.test(base)
  if (!prefixOk || !FIXTURE_ALLOWED_EXTENSIONS.includes(ext)) {
    return { rule: 'filename', match: base, line: 0 }
  }
  return null
}

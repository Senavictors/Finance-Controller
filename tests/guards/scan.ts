/**
 * Varredura de arquivos do repositório com os detectores de `./no-real-data.ts`.
 * Usada pelo teste `no-real-data.test.ts` (`npm run guard:data`) e pelo hook de pré-commit
 * (`scripts/guard-data.ts --staged`).
 *
 * Escopo (decisão FC2-F0-07): TODOS os arquivos de texto do repositório (rastreados pelo Git ou
 * não ignorados) e, adicionalmente, tudo que existir em `tests/fixtures/`, exceto o que está em
 * `SCAN_EXCLUDED_PREFIXES`/`SCAN_EXCLUDED_FILES` (dependências, código gerado e lockfile).
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import {
  checkFixtureFilename,
  findSensitivePatterns,
  type Finding,
  type RuleName,
} from './no-real-data'

export const FIXTURES_PREFIX = 'tests/fixtures/'

/** Caminhos (prefixos, com `/` final) fora do escopo: não são conteúdo autoral do repositório. */
export const SCAN_EXCLUDED_PREFIXES: readonly string[] = [
  'node_modules/',
  'src/generated/',
  '.next/',
  'coverage/',
  '.git/',
  '.claude/worktrees/',
]
/** Arquivos exatos fora do escopo. */
export const SCAN_EXCLUDED_FILES: readonly string[] = ['package-lock.json']

/** Extensões binárias: só o nome importa (a regra `filename` vale em `tests/fixtures`). */
export const BINARY_EXTENSIONS: readonly string[] = [
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.avif',
  '.ico',
  '.pdf',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.eot',
  '.zip',
  '.gz',
]

export interface AllowEntry {
  rule: RuleName
  /** Quantidade EXATA de achados dessa regra no arquivo (mudou para mais ou para menos = falha). */
  count: number
  /** Por que o trecho é aceitável (exemplo sintético de documentação etc.). */
  motivo: string
}

/**
 * Exceções por arquivo, com contagem fixa. Mecanismo explícito e revisável (RN-03 só admite
 * exceção documentada): adicionar uma entrada exige justificar o `motivo` em revisão e jamais
 * vale para `tests/fixtures/` (fixtures nunca têm exceção). Se o trecho for removido do arquivo,
 * a entrada fica obsoleta e o guard falha até ser apagada.
 */
export const ALLOWLIST: Readonly<Record<string, readonly AllowEntry[]>> = {
  // Tabela de redaction: exemplos de formato (valores fictícios clássicos de documentação)
  // que descrevem o que o redactor da F5-02 deve mascarar.
  '.agents/tasks/backlog/FC2-F5-02-cliente-openai-orcamento-redaction.md': [
    { rule: 'cpf', count: 1, motivo: 'exemplo de formato na tabela de redaction (valor fictício)' },
    {
      rule: 'cnpj',
      count: 1,
      motivo: 'exemplo de formato na tabela de redaction (valor fictício)',
    },
    {
      rule: 'agencia-conta',
      count: 5,
      motivo:
        'exemplos de formato de agência/conta na tabela e nos casos de teste (valores fictícios)',
    },
    { rule: 'telefone-br', count: 1, motivo: 'exemplo de formato na tabela de redaction' },
    { rule: 'cartao', count: 1, motivo: 'número de teste público de documentação de gateways' },
  ],
  // E-mail da conta demo do seed do 1.x (sintético, sem titular real).
  '.agents/decisions/ADR-007-demo-seed.md': [
    { rule: 'email', count: 1, motivo: 'e-mail sintético da conta demo do 1.x' },
  ],
  'docs/roadmap/legado/CHANGELOG-1x.md': [
    { rule: 'email', count: 1, motivo: 'e-mail sintético da conta demo do 1.x' },
  ],
  'docs/roadmap/legado/CONTEXT-1x.md': [
    { rule: 'email', count: 1, motivo: 'e-mail sintético da conta demo do 1.x' },
  ],
  'docs/roadmap/legado/README-1x.md': [
    {
      rule: 'email',
      count: 2,
      motivo: 'e-mail sintético da conta demo do 1.x e URL SSH pública de clone do GitHub',
    },
  ],
}

export interface FileFinding extends Finding {
  file: string
}

export interface ScanResult {
  violations: FileFinding[]
  /** Problemas na própria allowlist (contagem divergente ou entrada obsoleta). */
  allowlistErrors: string[]
  scannedFiles: number
}

export interface ScanInput {
  /** Caminho relativo à raiz, com `/`. */
  path: string
  /** Conteúdo de texto; `null` para binários (só o nome é validado). */
  content: string | null
}

function toPosix(p: string): string {
  return p.split(path.sep).join('/')
}

export function isExcluded(relPath: string): boolean {
  return (
    SCAN_EXCLUDED_FILES.includes(relPath) ||
    SCAN_EXCLUDED_PREFIXES.some((prefix) => relPath.startsWith(prefix))
  )
}

export function isBinaryPath(relPath: string): boolean {
  const ext = path.extname(relPath).toLowerCase()
  return BINARY_EXTENSIONS.includes(ext)
}

/** Mascara o trecho achado para não vazar o dado nos logs do CI (repositório público). */
export function maskMatch(match: string): string {
  if (match.length <= 4) return '*'.repeat(match.length)
  return `${match.slice(0, 2)}${'*'.repeat(Math.min(match.length - 2, 8))} (${match.length} chars)`
}

export function formatFinding(f: FileFinding): string {
  const where = f.line > 0 ? `${f.file}:${f.line}` : f.file
  return `${where} [${f.rule}] ${f.rule === 'filename' ? f.match : maskMatch(f.match)}`
}

/** Aplica detectores, regra de nome e allowlist aos arquivos informados. Função pura. */
export function scanFiles(
  inputs: readonly ScanInput[],
  allowlist: Readonly<Record<string, readonly AllowEntry[]>> = ALLOWLIST,
): ScanResult {
  const violations: FileFinding[] = []
  const allowlistErrors: string[] = []

  for (const input of inputs) {
    const file = input.path
    const isFixture = file.startsWith(FIXTURES_PREFIX)
    const found: FileFinding[] = []

    if (isFixture) {
      const nameFinding = checkFixtureFilename(file.slice(FIXTURES_PREFIX.length))
      if (nameFinding) found.push({ ...nameFinding, file })
    }
    if (input.content !== null) {
      for (const f of findSensitivePatterns(input.content)) found.push({ ...f, file })
    }

    const entries = isFixture ? [] : (allowlist[file] ?? [])
    const remaining = [...found]
    for (const entry of entries) {
      const ofRule = remaining.filter((f) => f.rule === entry.rule)
      if (ofRule.length === entry.count) {
        for (const f of ofRule) remaining.splice(remaining.indexOf(f), 1)
      } else {
        allowlistErrors.push(
          `${file}: allowlist de "${entry.rule}" espera ${entry.count} achado(s), encontrou ${ofRule.length}`,
        )
      }
    }
    violations.push(...remaining)
  }

  return { violations, allowlistErrors, scannedFiles: inputs.length }
}

/** Entradas da allowlist cujo arquivo não está (mais) no conjunto varrido. */
export function staleAllowlistEntries(
  scannedPaths: readonly string[],
  allowlist: Readonly<Record<string, readonly AllowEntry[]>> = ALLOWLIST,
): string[] {
  const scanned = new Set(scannedPaths)
  return Object.keys(allowlist)
    .filter((file) => !scanned.has(file))
    .map((file) => `${file}: entrada de allowlist obsoleta (arquivo ausente do escopo)`)
}

// ---------- Coleta de arquivos ----------

function walk(dir: string, root: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, root, out)
    else out.push(toPosix(path.relative(root, full)))
  }
}

function gitListFiles(root: string): string[] | null {
  try {
    const out = execFileSync(
      'git',
      ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
      {
        cwd: root,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    )
    return out.split('\0').filter(Boolean)
  } catch {
    return null
  }
}

/**
 * Lista os arquivos do escopo: `git ls-files` (rastreados + não ignorados) ou, sem Git,
 * caminhada no disco; sempre somada à caminhada completa de `tests/fixtures/` (inclui arquivos
 * ignorados pelo `.gitignore`, para que o ignore não esconda uma fixture).
 */
export function listScopeFiles(root: string): string[] {
  const set = new Set<string>()
  const tracked = gitListFiles(root)
  if (tracked) {
    for (const f of tracked) set.add(f)
  } else {
    const all: string[] = []
    walk(root, root, all)
    for (const f of all) set.add(f)
  }
  const fixturesDir = path.join(root, FIXTURES_PREFIX)
  if (existsSync(fixturesDir)) {
    const all: string[] = []
    walk(fixturesDir, root, all)
    for (const f of all) set.add(f)
  }
  return [...set]
    .filter((f) => !isExcluded(f))
    .filter((f) => existsSync(path.join(root, f)) && statSync(path.join(root, f)).isFile())
    .sort()
}

function readInput(root: string, relPath: string): ScanInput {
  if (isBinaryPath(relPath)) return { path: relPath, content: null }
  const buf = readFileSync(path.join(root, relPath))
  if (buf.includes(0)) return { path: relPath, content: null }
  return { path: relPath, content: buf.toString('utf8') }
}

/** Varre o repositório inteiro (escopo completo) e valida a allowlist. */
export function scanRepo(root: string): ScanResult {
  const files = listScopeFiles(root)
  const result = scanFiles(files.map((f) => readInput(root, f)))
  result.allowlistErrors.push(...staleAllowlistEntries(files))
  return result
}

/** Varre arquivos staged (conteúdo do índice, não do disco). */
export function scanStaged(root: string): ScanResult {
  const names = execFileSync(
    'git',
    ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'],
    {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    },
  )
    .split('\0')
    .filter(Boolean)
    .filter((f) => !isExcluded(f))

  const inputs: ScanInput[] = names.map((relPath) => {
    if (isBinaryPath(relPath)) return { path: relPath, content: null }
    const buf = execFileSync('git', ['show', `:${relPath}`], {
      cwd: root,
      maxBuffer: 64 * 1024 * 1024,
    })
    return { path: relPath, content: buf.includes(0) ? null : buf.toString('utf8') }
  })
  return scanFiles(inputs)
}

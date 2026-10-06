import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  ALLOW_MARKER,
  MAX_ALLOWED_EXCEPTIONS,
  formatViolation,
  isAllowedPath,
  scanContent,
  type ScanResult,
} from './literal-colors'

const ROOT = resolve(__dirname, '..', '..')

/** `src/components/**` (ts, tsx, css) e `src/app/**` (ts, tsx, css). */
const SCAN_ROOTS = ['src/components', 'src/app']
const SCAN_EXTENSIONS = /\.(?:tsx?|css)$/
const IGNORED_FILES = /\.test\.tsx?$/

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return walk(full)
    return SCAN_EXTENSIONS.test(name) && !IGNORED_FILES.test(name) ? [full] : []
  })
}

function scanProject(): ScanResult & { files: number } {
  const files = SCAN_ROOTS.flatMap((root) => walk(join(ROOT, root)))
  const total: ScanResult = { violations: [], exceptions: [] }
  for (const file of files) {
    const rel = relative(ROOT, file).replace(/\\/g, '/')
    const result = scanContent(rel, readFileSync(file, 'utf8'))
    total.violations.push(...result.violations)
    total.exceptions.push(...result.exceptions)
  }
  return { ...total, files: files.length }
}

describe('no-literal-colors (RN-01, ADR-018)', () => {
  it('src/components/** e src/app/** não contêm cor literal', () => {
    const { violations, files } = scanProject()
    expect(files).toBeGreaterThan(0)
    expect(
      violations.map(formatViolation),
      'Use tokens --fc-* (classes bg-fc-*, text-fc-*, border-fc-* ou var(--fc-*)).',
    ).toEqual([])
  })

  it(`as exceções "${ALLOW_MARKER} motivo" não passam de ${MAX_ALLOWED_EXCEPTIONS}`, () => {
    const { exceptions } = scanProject()
    expect(
      exceptions.length,
      `Exceções atuais:\n${exceptions.map((e) => `${e.file}:${e.line} ${e.reason}`).join('\n')}`,
    ).toBeLessThanOrEqual(MAX_ALLOWED_EXCEPTIONS)
  })

  it('isenta apenas os caminhos da allowlist (marcas, manifest/ícones PWA, tokens)', () => {
    expect(isAllowedPath('src/lib/brands/registry.ts')).toBe(true)
    expect(isAllowedPath('src/app/manifest.ts')).toBe(true)
    expect(isAllowedPath('src/styles/tokens.css')).toBe(true)
    expect(isAllowedPath('src/components/fc/button.tsx')).toBe(false)
    expect(isAllowedPath('src/app/(app)/hoje/page.tsx')).toBe(false)
  })
})

describe('no-literal-colors: detector contra a fixture negativa sintética', () => {
  const fixture = readFileSync(
    join(ROOT, 'tests/fixtures/no-literal-colors/violations.tsx.txt'),
    'utf8',
  )
  const result = scanContent('src/components/fc/fixture.tsx', fixture)
  const matches = result.violations.map((v) => v.match)

  it('detecta classes de paleta, hex, funções de cor e white/black/transparent', () => {
    expect(matches).toEqual(
      expect.arrayContaining([
        'bg-white',
        'text-black',
        'border-transparent',
        'text-slate-500',
        'bg-red-200',
        'ring-sky-400',
        '#fff',
        'rgba(',
        "color: 'white",
        '#38bdf8',
        'hsl(',
      ]),
    )
  })

  it('aceita linha com marcador e motivo, e conta a exceção', () => {
    expect(matches).not.toContain('#123456')
    expect(result.exceptions).toHaveLength(1)
    expect(result.exceptions[0]?.reason).toBe('cor de marca de teste')
  })

  it('marcador sem motivo não isenta', () => {
    expect(matches).toContain('#654321')
  })

  it('não acusa tokens, var(--fc-*) nem âncoras de URL', () => {
    expect(matches).not.toContain('#conteudo')
    expect(matches.filter((m) => m.includes('fc-'))).toEqual([])
  })

  it('arquivo na allowlist por caminho não gera violação', () => {
    expect(scanContent('src/lib/brands/x.ts', fixture).violations).toEqual([])
  })
})

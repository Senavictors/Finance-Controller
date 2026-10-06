import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

function git(args: string[]) {
  return spawnSync('git', args, { cwd: root, encoding: 'utf8' })
}

const hasGit = git(['rev-parse', '--git-dir']).status === 0

/** true = ignorado pelo .gitignore (exit 0 de `git check-ignore -q`). */
function ignored(p: string): boolean {
  return git(['check-ignore', '-q', '--no-index', p]).status === 0
}

describe.skipIf(!hasGit)('.gitignore protege dados reais e libera o necessário (CA-03)', () => {
  it('ignora private/, extratos OFX/PDF e .env', () => {
    expect(ignored('private/qualquer.pdf')).toBe(true)
    expect(ignored('meu-extrato.ofx')).toBe(true)
    expect(ignored('fatura.pdf')).toBe(true)
    expect(ignored('imports/extrato.csv')).toBe(true)
    expect(ignored('.env')).toBe(true)
    expect(ignored('.env.local')).toBe(true)
  })

  it('não ignora .env.example nem fixtures sintéticas', () => {
    expect(ignored('.env.example')).toBe(false)
    expect(ignored('tests/fixtures/ofx/sintetico-conta-corrente.ofx')).toBe(false)
    expect(ignored('tests/fixtures/pdf/sintetico-fatura.pdf')).toBe(false)
  })

  it('versiona .claude/ (agentes, skills, rules) e ignora só o que é local', () => {
    expect(ignored('.claude/agents/dados-prisma.md')).toBe(false)
    expect(ignored('.claude/skills/executar-fase/SKILL.md')).toBe(false)
    expect(ignored('.claude/settings.json')).toBe(false)
    expect(ignored('.claude/settings.local.json')).toBe(true)
    expect(ignored('.claude/worktrees/x/y.ts')).toBe(true)
  })
})

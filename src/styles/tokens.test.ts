import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

const tokens = read('src/styles/tokens.css')
const globals = read('src/app/globals.css')

const definedTokens = new Set(Array.from(tokens.matchAll(/^\s*(--fc-[\w-]+)\s*:/gm), (m) => m[1]))

describe('globals.css <-> tokens.css (ADR-018)', () => {
  it('não contém cor literal', () => {
    expect(globals).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(globals).not.toMatch(/\b(rgba?|hsla?|oklch|oklab|lab|lch|hwb)\(/)
  })

  it('todo var(--fc-*) usado em globals.css está definido em tokens.css', () => {
    const used = Array.from(globals.matchAll(/var\((--fc-[\w-]+)/g), (m) => m[1])
    expect(used.length).toBeGreaterThan(0)
    const missing = used.filter((name) => !definedTokens.has(name))
    expect(missing).toEqual([])
  })

  it('todo --color-fc-* do @theme aponta para um token --fc-* existente', () => {
    const entries = Array.from(
      globals.matchAll(/^\s*--color-fc-([\w-]+)\s*:\s*var\((--fc-[\w-]+)\)/gm),
      (m) => ({ name: m[1], target: m[2] }),
    )
    expect(entries.length).toBeGreaterThan(0)
    for (const { name, target } of entries) {
      expect(target, `--color-fc-${name}`).toBe(`--fc-${name}`)
      expect(definedTokens.has(target), `${target} inexistente`).toBe(true)
    }
  })

  it('expõe como utilitário toda cor de superfície, texto, acento, semântica e categoria', () => {
    const expected = [
      'void',
      'ink',
      'ink-raised',
      'glass',
      'glass-strong',
      'glass-bar',
      'glass-sheet',
      'rim',
      'divider',
      'scrim',
      'text',
      'text-2',
      'text-3',
      'text-on-accent',
      'iris',
      'iris-hi',
      'iris-lo',
      'iris-soft',
      'in',
      'out',
      'pend',
      'info',
      'debt',
      ...Array.from({ length: 10 }, (_, i) => `cat-${i + 1}`),
    ]
    for (const name of expected) {
      expect(globals, `--color-fc-${name}`).toContain(`--color-fc-${name}: var(--fc-${name});`)
    }
  })

  it('mantém os mapeamentos shadcn obrigatórios em um único bloco :root', () => {
    for (const name of ['background', 'foreground', 'primary', 'border', 'ring']) {
      const matches = globals.match(new RegExp(`^\\s*--${name}\\s*:\\s*var\\(--fc-`, 'gm'))
      expect(matches, `--${name}`).toHaveLength(1)
    }
    expect(globals).not.toMatch(/^\.dark\s*\{/m)
    expect(globals.match(/^:root\s*\{/gm)).toHaveLength(1)
  })

  it('não carrega resquícios do tema Apex / 1.x', () => {
    expect(globals).not.toMatch(/fc-panel|react-grid/)
  })
})

describe('tokens.css', () => {
  it('pilhas de fonte casam com as variáveis geradas pelo next/font', () => {
    expect(tokens).toContain('var(--font-geist-sans)')
    expect(tokens).toContain('var(--font-geist-mono)')
    expect(tokens).not.toMatch(/"Geist"/)
  })
})

/** Extrai o corpo de `@utility <name> { ... }` de globals.css. */
const utilityBody = (name: string) => {
  const m = globals.match(new RegExp(String.raw`@utility ${name}\s*\{([^}]*)\}`))
  expect(m, `@utility ${name} ausente`).not.toBeNull()
  return m![1]
}

describe('utilitários @utility (revisão QA)', () => {
  it.each(['card', 'bar', 'sheet'])(
    'fc-blur-%s declara -webkit-backdrop-filter antes de backdrop-filter',
    (n) => {
      const body = utilityBody(`fc-blur-${n}`)
      const webkit = body.indexOf(`-webkit-backdrop-filter: var(--fc-blur-${n})`)
      const plain = body.search(/(?<!-webkit-)backdrop-filter: var\(--fc-blur-/)
      expect(webkit).toBeGreaterThanOrEqual(0)
      expect(plain).toBeGreaterThan(webkit)
    },
  )

  it.each(['hero', 'title', 'h2', 'body', 'sub', 'label', 'caption', 'amount'])(
    'fc-text-%s usa o shorthand font do token homônimo',
    (n) => {
      expect(utilityBody(`fc-text-${n}`)).toContain(`font: var(--fc-text-${n});`)
    },
  )

  it('hero e title aplicam o letter-spacing documentado nos tokens', () => {
    expect(utilityBody('fc-text-hero')).toContain('letter-spacing: -0.035em')
    expect(utilityBody('fc-text-title')).toContain('letter-spacing: -0.025em')
  })

  it('caption é uppercase com letter-spacing 0.06em', () => {
    const body = utilityBody('fc-text-caption')
    expect(body).toContain('text-transform: uppercase')
    expect(body).toContain('letter-spacing: 0.06em')
  })

  it('valores monetários usam tabular-nums (RN-05) e fc-tabular existe', () => {
    for (const n of ['fc-text-hero', 'fc-text-amount', 'fc-tabular']) {
      expect(utilityBody(n), n).toContain('font-variant-numeric: tabular-nums')
    }
  })

  it('@layer base: input >= 16px, dark fixo, sem flash no overscroll', () => {
    expect(globals).toContain('font-size: max(16px, 1em)')
    expect(globals).toContain('color-scheme: dark')
    expect(globals).toContain('overscroll-behavior-y: none')
    expect(globals).toMatch(/body\s*\{[^}]*background: var\(--fc-void\)/)
  })

  it('expõe fontes, raios e sombras FC no @theme', () => {
    for (const decl of [
      '--font-sans: var(--fc-font-ui)',
      '--font-heading: var(--fc-font-display)',
      '--font-mono: var(--fc-font-mono)',
      '--font-num: var(--fc-font-num)',
      '--shadow-fc-float:',
      '--shadow-fc-card:',
      '--shadow-fc-glow:',
      '--ease-fc:',
      '--ease-fc-spring:',
    ]) {
      expect(globals, decl).toContain(decl)
    }
    for (const r of ['xs', 'sm', 'md', 'lg', 'xl', 'sheet', 'pill']) {
      expect(globals).toContain(`--radius-fc-${r}: var(--fc-radius-${r});`)
    }
  })
})

describe('layout.tsx (somente dark + Geist)', () => {
  const layout = read('src/app/layout.tsx')

  it('html fixo em dark, sem script/cookie de tema', () => {
    expect(layout).toMatch(/className=\{`[^`]*\sdark\s[^`]*`\}/)
    expect(layout).toContain("colorScheme: 'dark'")
    expect(layout).not.toMatch(
      /ThemeProvider|getThemeScript|fc_theme|data-theme|localStorage|cookies\(/,
    )
  })

  it('Geist/Geist Mono com variáveis esperadas e preload: false', () => {
    expect(layout).toContain("variable: '--font-geist-sans'")
    expect(layout).toContain("variable: '--font-geist-mono'")
    expect(layout.match(/preload: false/g)).toHaveLength(2)
    expect(layout).not.toMatch(/Inter|JetBrains/)
  })
})

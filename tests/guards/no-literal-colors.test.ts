import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  ALLOWED_PATHS,
  ALLOW_MARKER,
  MAX_ALLOWED_EXCEPTIONS,
  formatViolation,
  isAllowedPath,
  scanContent,
  scanHexOnly,
  stripComments,
  type ScanResult,
  type ViolationKind,
} from './literal-colors'

const ROOT = resolve(__dirname, '..', '..')

/** `src/components/**` (ts, tsx, css) e `src/app/**` (ts, tsx, css). */
const SCAN_ROOTS = ['src/components', 'src/app']
const SCAN_EXTENSIONS = /\.(?:tsx?|css)$/
const IGNORED_FILES = /\.test\.tsx?$/

function walk(dir: string, extensions: RegExp = SCAN_EXTENSIONS): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return walk(full, extensions)
    return extensions.test(name) && !IGNORED_FILES.test(name) ? [full] : []
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
  it('src/components/** e src/app/** não contêm cor nem duração literal', () => {
    const { violations, files } = scanProject()
    expect(files).toBeGreaterThan(0)
    expect(
      violations.map(formatViolation),
      'Use tokens --fc-* (classes bg-fc-*, text-fc-*, border-fc-*, duration-(--fc-dur-*) ou var(--fc-*)).',
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

/** Atalho: escaneia um trecho como se fosse um componente. */
function scan(content: string, file = 'src/components/fc/amostra.tsx') {
  return scanContent(file, content)
}

function kindsOf(content: string): ViolationKind[] {
  return scan(content).violations.map((v) => v.kind)
}

describe('no-literal-colors: padrões que o guard deve detectar (CA-01)', () => {
  // [descrição, trecho, parte do `match` esperada]. Padrões montados aqui, em runtime.
  const POSITIVE: [string, string, string][] = [
    ['cor nomeada em CSS', 'color: red;', 'color: red'],
    ['cor nomeada em estilo inline (string)', "style={{ background: 'red' }}", "background: 'red"],
    ['cor nomeada composta', 'color: darkslategray;', 'darkslategray'],
    ['cor nomeada em maiúsculas', 'color: RED;', 'color: RED'],
    ['classe arbitrária bg-[red]', 'className="' + 'bg-[' + 'red]"', 'bg-red'],
    ['classe arbitrária text-[white]', 'className="' + 'text-[' + 'white]"', 'text-white'],
    ['classe arbitrária com cor e tipo', 'className="text-[color:' + 'white]"', 'white'],
    [
      'sombra arbitrária com black',
      'className="shadow-[0_0_4px_' + 'black]"',
      'shadow-0 0 4px black',
    ],
    [
      'borda arbitrária com white',
      'className="border-[1px_solid_' + 'white]"',
      'border-1px solid white',
    ],
    ['propriedade arbitrária', 'className="[color:' + 'red]"', '[color:red'],
    ['borda shorthand com white', 'border: 1px solid white;', 'border: 1px solid white'],
    ['borda shorthand inline', "style={{ border: '1px solid white' }}", 'solid white'],
    ['box-shadow com black', 'box-shadow: 0 0 4px black;', 'box-shadow: 0 0 4px black'],
    ['boxShadow inline com black', "style={{ boxShadow: '0 0 4px black' }}", 'boxShadow'],
    ['drop-shadow com black', 'filter: drop-shadow(0 0 4px black);', 'black'],
    [
      'color-mix com white em variável',
      '--x: color-mix(in srgb, white 20%, var(--fc-in));',
      '--x: color-mix(in srgb, white',
    ],
    [
      'color-mix com white fora de declaração',
      'const m = `color-mix(in srgb, white 20%, var(--fc-in))`',
      'color-mix(in srgb, white',
    ],
    ['função color() p3', 'color: color(display-p3 1 0 0);', 'color(display-p3'],
    ['atributo SVG fill', '<path fill="white" />', 'fill=white'],
    ['atributo SVG stroke', '<path stroke="red" />', 'stroke=red'],
    ['atributo SVG em expressão', "<path fill={'black'} />", 'fill={black'],
    ['atributo SVG stopColor', '<stop stopColor="white" />', 'stopColor=white'],
    ['atributo SVG fill transparent', '<path fill="transparent" />', 'fill=transparent'],
    ['atributo color de ícone', '<Icon color="red" />', 'color=red'],
    ['transparent como string de estilo', "style={{ background: 'transparent' }}", 'transparent'],
    ['transparent em borda inline', "style={{ border: '1px solid transparent' }}", 'transparent'],
    ['transparent como utilitário', 'className="' + 'bg-' + 'transparent"', 'bg-transparent'],
    ['duração Tailwind 100', 'className="duration-100"', 'duration-100'],
    ['duração Tailwind 150', 'className="transition-opacity duration-150"', 'duration-150'],
    ['duração Tailwind 200', 'className="duration-200"', 'duration-200'],
    ['delay Tailwind', 'className="delay-75"', 'delay-75'],
    ['duração arbitrária', 'className="duration-[250ms]"', 'duration-[250ms]'],
    ['animação arbitrária', 'className="animate-[spin_1s_linear_infinite]"', 'animate-['],
    ['transition CSS com ms', 'transition: opacity 200ms ease;', 'transition: opacity 200ms'],
    ['animation-duration CSS', 'animation-duration: 2s;', 'animation-duration: 2s'],
    ['transitionDuration inline', "style={{ transitionDuration: '150ms' }}", '150ms'],
  ]

  it.each(POSITIVE)('detecta: %s', (_name, content, expected) => {
    const matches = scan(content).violations.map((v) => v.match)
    expect(
      matches.some((m) => m.includes(expected)),
      `matches: ${JSON.stringify(matches)}`,
    ).toBe(true)
  })

  it('mantém os detectores antigos (hex, funções de cor, paleta Tailwind)', () => {
    expect(kindsOf("color: '#fff'")).toContain('hex')
    expect(kindsOf('background: rgba(0, 0, 0, 0.5)')).toContain('color-function')
    expect(kindsOf('className="text-slate-500 bg-red-200"')).toEqual([
      'palette-class',
      'palette-class',
    ])
  })

  it('reporta arquivo:linha da violação', () => {
    const content = ['export const a = 1', '', 'const s = { color: "white" }'].join('\n')
    const [violation] = scan(content, 'src/components/fc/ruim.tsx').violations
    expect(violation && formatViolation(violation)).toMatch(
      /^src\/components\/fc\/ruim\.tsx:3 {2}.*white/,
    )
  })

  it('marcador com motivo isenta e conta; sem motivo não isenta', () => {
    const withReason = `color: red; /* ${ALLOW_MARKER} marca de teste */`
    expect(scan(withReason).violations).toEqual([])
    expect(scan(withReason).exceptions).toHaveLength(1)
    expect(scan(`color: red; /* ${ALLOW_MARKER} */`).violations.length).toBeGreaterThan(0)
  })
})

describe('no-literal-colors: falsos positivos controlados (CA-02)', () => {
  const NEGATIVE: [string, string][] = [
    ['token em estilo', "style={{ color: 'var(--fc-in)' }}"],
    ['token em CSS', 'color: var(--fc-text-2);'],
    ['borda com token', 'border: 1px solid var(--fc-rim);'],
    ['fill none', 'fill: none;'],
    ['atributo fill none', '<path fill="none" />'],
    ['atributo currentColor', '<path stroke="currentColor" fill="currentColor" />'],
    ['atributo com url de gradiente', '<path fill="url(#grad)" />'],
    ['classes de token', 'className="bg-fc-glass text-fc-text border-fc-rim outline-fc-iris"'],
    ['sombra por token', 'className="shadow-fc-glow shadow-fc-card"'],
    ['propriedade custom de tipografia', '--fc-text-hero: 700 54px/1 var(--fc-font-num);'],
    ['color-scheme', 'color-scheme: dark;'],
    ['mapa de variantes (chave outline)', "outline: 'border-border text-foreground',"],
    ['url com nome de cor', 'background: url(/imagens/red.png);'],
    ['função tan()', 'transform: rotate(calc(tan(1) * 1deg));'],
    // `transparent` em CSS puro continua permitido (decisão F0-04, reafirmada na F0-09).
    [
      'transparent em gradiente (CSS)',
      'background: radial-gradient(circle, var(--fc-calm-1), transparent 68%);',
    ],
    ['transparent em border-color (CSS)', 'border-right-color: transparent;'],
    ['transparent no tap highlight', '-webkit-tap-highlight-color: transparent;'],
    [
      'transparent em color-mix',
      'background: `color-mix(in srgb, var(--fc-cat-1) 18%, transparent)`,',
    ],
    // Durações por token.
    ['duração por token Tailwind', 'className="duration-(--fc-dur-fast) ease-fc"'],
    ['transition com token', 'transition: opacity var(--fc-dur-base) var(--fc-ease);'],
    ['animation com token', 'animation: fc-spin var(--fc-dur-slow) linear infinite;'],
    ['duração zero', 'transition-duration: 0s;'],
    // Borda invisível documentada: reserva 1px de layout (focus-visible:border-ring), sem cor.
    ['borda invisível', 'className="border border-fc-void/0"'],
    [
      'borda invisível por lado',
      'className="data-horizontal:border-t-fc-void/0 data-vertical:border-l-fc-void/0"',
    ],
    ['alfa parcial', 'className="bg-fc-void/50 border-fc-iris/45"'],
  ]

  it.each(NEGATIVE)('não acusa: %s', (_name, content) => {
    expect(scan(content).violations.map(formatViolation)).toEqual([])
  })

  it('alfa zero em token fora da borda invisível é "transparent disfarçado"', () => {
    for (const content of [
      'className="bg-fc-void/0"',
      'className="text-fc-iris/0"',
      'className="border-fc-iris/0"',
      'className="ring-fc-void/0"',
    ]) {
      expect(kindsOf(content), content).toEqual(['zero-alpha'])
    }
  })

  it('âncoras e referências (href="#abc", to, url(#id), entidade) não são hex', () => {
    for (const content of [
      '<a href="#abc">ir</a>',
      "<a href='#fee'>ir</a>",
      '<a href={"#bad"}>ir</a>',
      '<Link to="#add">ir</Link>',
      '<rect fill="url(#a1b)" />',
      '<p>&#xdead;</p>',
    ]) {
      expect(scan(content).violations, content).toEqual([])
    }
  })

  it('hex curto fora de âncora continua hex, mesmo na mesma linha de um href', () => {
    expect(kindsOf("color: '#abc'")).toEqual(['hex'])
    const mixed = scan('<a href="#abc" style={{ color: "#fff" }}>ir</a>').violations
    expect(mixed.map((v) => v.match)).toEqual(['#fff'])
  })

  it('arquivo na allowlist por caminho não gera violação', () => {
    expect(scan('color: red; background: #fff;', 'src/lib/brands/x.ts').violations).toEqual([])
  })
})

describe('no-literal-colors: comentários e chaves na mesma linha (ciclo 1 da F0-09)', () => {
  // I-1: comentário depois do valor não é código.
  const COMMENTED: [string, string][] = [
    ['cor com // vermelho (red)', "color: 'var(--fc-out)', // vermelho (red) quando negativo"],
    ['cor com /* red */ no fim', 'color: var(--fc-in) /* red when overdue */'],
    ['borda com // gold', "border: '1px solid var(--fc-rim)', // gold"],
    ['transição com // 200ms', "transition: 'opacity var(--fc-dur-fast)', // 200ms antes"],
    ['transição CSS com /* 200ms */', 'transition: opacity var(--fc-dur-fast); /* era 200ms */'],
    ['comentário de linha inteira', '// color: red; background: white'],
    ['comentário de bloco no meio', 'color: var(--fc-in) /* white */ !important;'],
    ['comentário com marcador fora de cor', "const c = { color: 'var(--fc-in)' } // black"],
    ['URL no valor não é comentário', "backgroundImage: 'url(https://cdn.exemplo.dev/red.png)'"],
  ]

  it.each(COMMENTED)('não acusa: %s', (_name, content) => {
    expect(scan(content).violations.map(formatViolation)).toEqual([])
  })

  // M-1: outras chaves/textos na mesma linha não são o valor da cor.
  const SIBLINGS: [string, string][] = [
    ['nome depois da cor', "{ color: 'var(--fc-cat-1)', name: 'Coral' }"],
    ['rótulo depois da borda', "{ borderWidth: 1, label: 'Red Bull' }"],
    ['texto Peru', "{ borderColor: 'var(--fc-rim)', title: 'Peru' }"],
    ['texto Gold', "{ color: 'var(--fc-in)', plano: 'Gold' }"],
    ['texto Tan', "{ background: 'var(--fc-glass)', sobrenome: 'Tan' }"],
    ['texto Linen', "{ color: 'var(--fc-in)', 'label': 'Linen' }"],
    ['texto Magenta', '{ color: tokens.cat1, label: `Magenta` }'],
    ['transição e rótulo', "{ transition: 'opacity var(--fc-dur-fast)', label: '200ms' }"],
    [
      'color-mix e rótulo',
      "{ mix: `color-mix(in srgb, var(--fc-in) 20%, transparent)`, nome: 'Red' }",
    ],
    // M-2: acesso a propriedade com nome de cor não é cor.
    ['acesso user.green', '{ color: user.green }'],
    ['acesso green.main', '{ color: green.main }'],
  ]

  it.each(SIBLINGS)('não acusa: %s', (_name, content) => {
    expect(scan(content).violations.map(formatViolation)).toEqual([])
  })

  it('o comentário não esconde violação que está no código da mesma linha', () => {
    for (const content of [
      "color: 'red', // comentário",
      'color: red; /* comentário */',
      "style={{ background: 'white' /* branco */ }}",
      "{ color: 'var(--fc-in)', borderColor: 'white' } // ok?",
      "{ color: 'var(--fc-in)', background: 'transparent' }",
      "{ transition: 'opacity 200ms', label: 'x' } // lento",
      "{ transition: 'opacity var(--fc-dur-fast)', transitionDelay: '50ms' }",
      '{ borderWidth: 1, borderColor: black }',
      "{ color: 'var(--fc-in)' + ' white' }",
    ]) {
      expect(scan(content).violations.length, content).toBeGreaterThan(0)
    }
  })

  it('a cor nomeada continua acusada com valor ternário e vírgulas de CSS', () => {
    expect(kindsOf("color: ok ? 'var(--fc-in)' : 'red'")).toEqual(['named-color'])
    expect(kindsOf('background: linear-gradient(to right, var(--fc-in), white);')).toEqual([
      'named-color',
    ])
    expect(kindsOf('transition: opacity var(--fc-dur-fast), transform 200ms;')).toEqual([
      'literal-duration',
    ])
  })

  it('o hex e a classe de paleta em comentário continuam acusados (só regiões ignoram comentário)', () => {
    expect(kindsOf('// antes: ' + '#' + 'fff')).toEqual(['hex'])
    expect(kindsOf('/* bg-' + 'red-500 */')).toEqual(['palette-class'])
  })

  it('marcador com motivo isenta a linha mesmo com a cor antes do comentário', () => {
    const line = `color: 'red', // ${ALLOW_MARKER} marca de teste`
    expect(scan(line).violations).toEqual([])
    expect(scan(line).exceptions).toHaveLength(1)
  })

  // M-3: o mesmo trecho não é reportado por duas regras.
  it('não duplica o achado do mesmo trecho', () => {
    const cases: [string, string[]][] = [
      ['--x: color-mix(in srgb, white 20%, var(--fc-in));', ['--x: color-mix(in srgb, white']],
      ['className="[color:' + 'red]"', ['[color:red']],
      ['className="[border:1px_solid_' + 'white]"', ['[border:1px solid white']],
    ]
    for (const [content, expected] of cases) {
      expect(
        scan(content).violations.map((v) => v.match),
        content,
      ).toEqual(expected)
    }
  })

  it('dois trechos diferentes na mesma linha continuam sendo dois achados', () => {
    expect(scan("{ color: 'red', borderColor: 'white' }").violations).toHaveLength(2)
  })
})

describe('stripComments', () => {
  it('troca comentários por espaços e mantém as posições', () => {
    const line = 'a: 1, // b'
    expect(stripComments(line)).toHaveLength(line.length)
    expect(stripComments('x /* y */ z')).toBe('x         z')
    expect(stripComments('x // y')).toBe('x     ')
  })

  it('preserva `//` dentro de strings e de URLs', () => {
    expect(stripComments("a: 'https://x.dev/a'")).toBe("a: 'https://x.dev/a'")
    expect(stripComments('a: url(//cdn.dev/a.png)')).toBe('a: url(//cdn.dev/a.png)')
    expect(stripComments('a: url(https://cdn.dev/a.png)')).toBe('a: url(https://cdn.dev/a.png)')
  })

  it('comentário de bloco sem fechamento apaga até o fim da linha', () => {
    expect(stripComments('a: b /* c')).toBe('a: b     ')
  })
})

describe('no-literal-colors: fixture negativa sintética', () => {
  const fixture = readFileSync(
    join(ROOT, 'tests/fixtures/no-literal-colors/sintetico-violations.tsx.txt'),
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

describe('hex de cor só existe onde a allowlist permite (CA-04)', () => {
  const TEXT = /\.(?:tsx?|css|json|webmanifest|html)$/

  function scanHex() {
    const files = [...walk(join(ROOT, 'src'), TEXT), ...walk(join(ROOT, 'public'), TEXT)]
    return {
      files: files.length,
      hits: files.flatMap((file) =>
        scanHexOnly(relative(ROOT, file).replace(/\\/g, '/'), readFileSync(file, 'utf8')),
      ),
    }
  }

  it('src/** e public/** não têm hex fora de tokens.css, src/lib/brands/**, manifest e ícones', () => {
    const { files, hits } = scanHex()
    expect(files).toBeGreaterThan(0)
    expect(
      hits.map(formatViolation),
      'Cor de marca fica em src/lib/brands/**; cor de UI vira token em src/styles/tokens.css.',
    ).toEqual([])
  })

  it('toda entrada da allowlist tem motivo', () => {
    for (const entry of ALLOWED_PATHS) {
      expect(entry.reason.trim().length, entry.prefix).toBeGreaterThan(10)
    }
  })

  it('hex de marca em componente ou tela é acusado; em src/lib/brands/** não', () => {
    const brand = '#' + '8A05BE'
    const code = `const c = { fg: '${brand}' }`
    expect(scanHexOnly('src/components/fc/cartao.tsx', code)).toHaveLength(1)
    expect(scanHexOnly('src/app/(app)/hoje/page.tsx', code)).toHaveLength(1)
    expect(scanHexOnly('src/server/x.ts', code)).toHaveLength(1)
    expect(scanHexOnly('src/lib/brands/registry.ts', code)).toEqual([])
    expect(scanHexOnly('src/styles/tokens.css', `--fc-void: ${brand};`)).toEqual([])
  })
})

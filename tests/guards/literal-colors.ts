/**
 * Detecção de cor literal (RN-01 / ADR-018). Usado por `no-literal-colors.test.ts`.
 * Puro: recebe o texto de um arquivo e devolve as violações; não toca o disco.
 */

export const ALLOW_MARKER = 'fc-allow-literal-color:'

/** Teto de exceções por comentário (força revisão: subir o limite exige mexer neste arquivo). */
export const MAX_ALLOWED_EXCEPTIONS = 10

/**
 * Caminhos (relativos à raiz, com `/`) isentos de varredura.
 * - `src/lib/brands/**`: cores de MARCA de bancos/bandeiras são dado, não token.
 * - `src/app/manifest.ts` e ícones PWA: `theme_color`/`background_color` do manifest exigem valor literal (F0-05).
 * - `src/styles/tokens.css`: é a definição dos tokens.
 */
export const ALLOWED_PATH_PREFIXES = [
  'src/lib/brands/',
  'src/app/manifest.ts',
  'src/app/icon',
  'src/app/apple-icon',
  'src/styles/tokens.css',
]

const PALETTE =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose'
const COLOR_UTILITY =
  '(?:bg|text|border(?:-[xytrblse])?|ring|ring-offset|from|to|via|fill|stroke|outline|shadow|divide|decoration|accent|caret|placeholder)'

export type ViolationKind = 'hex' | 'color-function' | 'palette-class' | 'keyword-color'

type Rule = { kind: ViolationKind; pattern: RegExp; description: string }

const RULES: Rule[] = [
  { kind: 'hex', pattern: /#[0-9a-fA-F]{3,8}\b/g, description: 'cor hexadecimal' },
  {
    kind: 'color-function',
    pattern: /\b(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb)\(/g,
    description: 'função de cor literal',
  },
  {
    kind: 'palette-class',
    pattern: new RegExp(`(?<![\\w-])${COLOR_UTILITY}-(?:${PALETTE})-\\d{2,3}(?![\\w-])`, 'g'),
    description: 'classe de paleta do Tailwind',
  },
  {
    // Utilitários Tailwind (`bg-white`, `border-transparent`, `text-black`...).
    kind: 'keyword-color',
    pattern: new RegExp(`(?<![\\w-])${COLOR_UTILITY}-(?:white|black|transparent)(?![\\w-])`, 'g'),
    description: 'white/black/transparent como utilitário',
  },
  {
    // Strings de estilo inline (`color: 'white'`, `background: 'transparent'`) e declarações CSS
    // (`color: black;`). Em CSS puro, `transparent` (paradas de gradiente, `border-right-color`,
    // `-webkit-tap-highlight-color`) e dentro de color-mix() é permitido: não é um valor de cor.
    kind: 'keyword-color',
    pattern:
      /(?<![\w-])(?:color|background|backgroundColor|borderColor|fill|stroke)\s*:\s*(?:['"](?:white|black|transparent)\b|(?:white|black)\b)/g,
    description: 'white/black/transparent em estilo',
  },
]

export type Violation = {
  file: string
  line: number
  kind: ViolationKind
  match: string
  description: string
}

export type ScanResult = {
  violations: Violation[]
  /** Linhas isentas por `// fc-allow-literal-color: motivo`. */
  exceptions: { file: string; line: number; reason: string }[]
}

export function isAllowedPath(file: string): boolean {
  const normalized = file.replace(/\\/g, '/')
  return ALLOWED_PATH_PREFIXES.some((prefix) => normalized.startsWith(prefix))
}

/** Varre o conteúdo de um arquivo. `file` é só rótulo (caminho relativo com `/`). */
export function scanContent(file: string, content: string): ScanResult {
  const violations: Violation[] = []
  const exceptions: ScanResult['exceptions'] = []
  if (isAllowedPath(file)) return { violations, exceptions }

  content.split(/\r?\n/).forEach((text, index) => {
    const line = index + 1
    const markerAt = text.indexOf(ALLOW_MARKER)
    const hits = RULES.flatMap((rule) =>
      Array.from(text.matchAll(rule.pattern), (m) => ({ rule, match: m[0] })),
    )

    if (markerAt !== -1) {
      const reason = text
        .slice(markerAt + ALLOW_MARKER.length)
        .replace(/\*\/.*$/, '')
        .replace(/\}\s*$/, '')
        .trim()
      if (reason.length > 0) {
        if (hits.length > 0) exceptions.push({ file, line, reason })
        return
      }
      // Marcador sem motivo não isenta nada: cai nas violações abaixo.
    }

    for (const { rule, match } of hits) {
      violations.push({ file, line, kind: rule.kind, match, description: rule.description })
    }
  })

  return { violations, exceptions }
}

export function formatViolation(v: Violation): string {
  return `${v.file}:${v.line}  ${v.description}: ${v.match}`
}

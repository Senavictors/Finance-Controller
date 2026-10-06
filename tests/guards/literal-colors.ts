/**
 * Detecção de cor e duração literais (RN-01 / ADR-018). Usado por `no-literal-colors.test.ts`.
 * Puro: recebe o texto de um arquivo e devolve as violações; não toca o disco.
 */

export const ALLOW_MARKER = 'fc-allow-literal-color:'

/** Teto de exceções por comentário (força revisão: subir o limite exige mexer neste arquivo). */
export const MAX_ALLOWED_EXCEPTIONS = 10

/**
 * Caminhos (relativos à raiz, com `/`) isentos de varredura, cada um com o motivo.
 * Um prefixo termina em `/` (diretório) ou é um nome de arquivo/prefixo de nome.
 */
export const ALLOWED_PATHS: readonly { prefix: string; reason: string }[] = [
  {
    prefix: 'src/lib/brands/',
    reason: 'cores de MARCA de bancos/bandeiras são dado do domínio, não token',
  },
  {
    prefix: 'src/app/manifest.ts',
    reason: '`theme_color`/`background_color` do manifest PWA exigem valor literal (F0-05)',
  },
  { prefix: 'src/app/icon', reason: 'ícone gerado da PWA (Image Response) exige cor literal' },
  { prefix: 'src/app/apple-icon', reason: 'apple-touch-icon gerado exige cor literal' },
  { prefix: 'src/styles/tokens.css', reason: 'é a definição dos tokens --fc-*' },
  { prefix: 'public/brands/', reason: 'logos de marca (SVG) trazem a cor da marca' },
  { prefix: 'public/icons/', reason: 'ícones da PWA são arte com cor própria' },
]

export const ALLOWED_PATH_PREFIXES = ALLOWED_PATHS.map((entry) => entry.prefix)

/** Cores nomeadas do CSS Color 4 (sem `transparent` e `currentcolor`, tratados à parte). */
const NAMED_COLORS = (
  'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet ' +
  'brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan ' +
  'darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta ' +
  'darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue ' +
  'darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey ' +
  'dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray ' +
  'green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush ' +
  'lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray ' +
  'lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray ' +
  'lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon ' +
  'mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue ' +
  'mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin ' +
  'navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen ' +
  'paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple ' +
  'rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna ' +
  'silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle ' +
  'tomato turquoise violet wheat white whitesmoke yellow yellowgreen'
).replace(/ /g, '|')

/**
 * Palavra inteira (não parte de `--fc-red`, `bg-red-500`, `tan(`...) e não acesso a propriedade
 * (`user.green`, `green.main`).
 */
const NAMED_COLOR_SRC = `(?<![\\w.$-])(?:${NAMED_COLORS})(?![\\w-]|\\.[A-Za-z_$]|\\s*\\()`
const TRANSPARENT_SRC = '(?<![\\w-])transparent(?![\\w-])'

const PALETTE =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose'
const COLOR_UTILITY =
  '(?:bg|text|border(?:-[xytrblse])?|ring|ring-offset|inset-ring|from|to|via|fill|stroke|outline|shadow|inset-shadow|text-shadow|drop-shadow|divide|decoration|accent|caret|placeholder)'

/** Propriedades CSS/JS-style que carregam cor (inclui atalhos `border`, `box-shadow`, `filter`...). */
const COLOR_PROP =
  '(?:--[\\w-]+|[A-Za-z-]*(?:[cC]olor|[bB]ackground|[bB]order|[oO]utline|[sS]hadow|[fF]ill|[sS]troke|[fF]ilter|[gG]radient)[A-Za-z-]*)'
/** Propriedades de movimento (transição/animação). */
const MOTION_PROP =
  '(?:transition(?:-duration|-delay)?|animation(?:-duration|-delay)?|transitionDuration|transitionDelay|animationDuration|animationDelay)'

export type ViolationKind =
  | 'hex'
  | 'color-function'
  | 'palette-class'
  | 'keyword-color'
  | 'named-color'
  | 'zero-alpha'
  | 'literal-duration'

/** `start`/`end`: posição do token proibido na linha (serve para deduplicar achados sobrepostos). */
type Hit = { match: string; start: number; end: number }
type Rule = {
  kind: ViolationKind
  description: string
  /** `text` é a linha original; `clean` é a mesma linha com comentários trocados por espaços. */
  find: (text: string, clean: string) => Hit[]
}

/** Regex simples: cada ocorrência é uma violação (avaliada na linha original). */
function simple(kind: ViolationKind, description: string, pattern: RegExp): Rule {
  return {
    kind,
    description,
    find: (text) =>
      Array.from(text.matchAll(pattern), (m) => ({
        match: m[0],
        start: m.index ?? 0,
        end: (m.index ?? 0) + m[0].length,
      })),
  }
}

/** Troca cada ocorrência por espaços do mesmo tamanho (mantém as posições). */
function blank(value: string, pattern: RegExp): string {
  return value.replace(pattern, (m) => ' '.repeat(m.length))
}

/** Remove `url(...)` (âncoras e caminhos de imagem não são cor). */
function stripUrls(value: string): string {
  return blank(value, /url\([^)]*\)/g)
}

/**
 * Troca comentários `// ...` e `/* ... *\/` por espaços (mantém as posições). Respeita strings
 * (`'https://x'` fica) e URLs soltas: `//` só abre comentário no começo da linha ou depois de
 * espaço, `;`, `,`, `{`, `}`, `)` ou `]` (nunca depois de `:` ou `(`). Por linha: um `/*` sem
 * fechamento apaga até o fim da linha.
 */
export function stripComments(line: string): string {
  let out = ''
  let quote: string | null = null
  for (let i = 0; i < line.length; i++) {
    const c = line.charAt(i)
    if (quote) {
      out += c
      if (c === '\\') {
        out += line.charAt(i + 1)
        i++
      } else if (c === quote) {
        quote = null
      }
      continue
    }
    if (c === '/' && line.charAt(i + 1) === '*') {
      const close = line.indexOf('*/', i + 2)
      const stop = close === -1 ? line.length : close + 2
      out += ' '.repeat(stop - i)
      i = stop - 1
      continue
    }
    if (c === '/' && line.charAt(i + 1) === '/' && /^[\s;,{})\]]?$/.test(line.charAt(i - 1))) {
      out += ' '.repeat(line.length - i)
      break
    }
    if (c === "'" || c === '"' || c === '`') quote = c
    out += c
  }
  return out
}

/**
 * Limita o valor de uma declaração ao que pertence à chave:
 * - começa com aspas: só o literal (e os concatenados com `+`), então
 *   `{ color: 'var(--fc-cat-1)', name: 'Coral' }` não olha o `'Coral'`;
 * - sem aspas: corta na próxima chave da mesma linha (`, label:`), então
 *   `{ borderWidth: 1, label: 'Red Bull' }` não olha o rótulo.
 * Vírgulas de CSS (`transition: a 1s, b 2s`, `background: x, y`) não são chaves e ficam dentro.
 */
function limitToKey(value: string): string {
  const quote = value.charAt(0)
  if (quote === "'" || quote === '"' || quote === '`') {
    let end = 0
    for (;;) {
      let i = end + 1
      while (i < value.length && value.charAt(i) !== value.charAt(end)) {
        i += value.charAt(i) === '\\' ? 2 : 1
      }
      end = Math.min(i + 1, value.length)
      const concat = /^\s*\+\s*(?=['"`])/.exec(value.slice(end))
      if (!concat) break
      end += concat[0].length
    }
    return value.slice(0, end)
  }
  const nextKey = /,\s*['"]?[A-Za-z_$][\w$-]*['"]?\s*:/.exec(value)
  return nextKey ? value.slice(0, nextKey.index) : value
}

/** Corta o valor no parêntese que fecha o `(` já consumido pelo prefixo (`color-mix(`). */
function limitToParens(value: string): string {
  let depth = 1
  for (let i = 0; i < value.length; i++) {
    const c = value.charAt(i)
    if (c === '(') depth++
    else if (c === ')' && --depth === 0) return value.slice(0, i + 1)
  }
  return value
}

/**
 * Declaração `prop: valor` (CSS ou estilo inline). O valor entra em um lookahead: o casamento
 * consome só `prop:`, e a próxima propriedade da mesma linha continua sendo encontrada.
 */
function declaration(prop: string): RegExp {
  return new RegExp(`(?<![\\w-])(${prop}\\s*:\\s*)(?=([^;}>\\n]*))`, 'g')
}

/**
 * Regra por região: `outer` captura um trecho (valor de declaração, atributo SVG...) e `inner`
 * procura o token proibido dentro dele. O `match` reportado é `prefix + texto até o token`.
 * A região é avaliada na linha sem comentários.
 */
function region(
  kind: ViolationKind,
  description: string,
  outer: RegExp,
  inner: (value: string) => RegExp[],
  options: {
    underscoreAsSpace?: boolean
    blankVars?: boolean
    /** O grupo 2 está em um lookahead (não faz parte de `m[0]`). */
    lookahead?: boolean
    /** Restringe o valor capturado ao que pertence à chave. */
    limit?: (value: string) => string
  } = {},
): Rule {
  return {
    kind,
    description,
    find: (_text, clean) => {
      const hits: Hit[] = []
      for (const m of clean.matchAll(outer)) {
        const prefix = m[1] ?? ''
        const raw = m[2] ?? ''
        const origin = m.index ?? 0
        const valueStart = options.lookahead
          ? origin + prefix.length
          : origin + Math.max(m[0].indexOf(raw, prefix.length), prefix.length)
        let value = options.limit ? options.limit(raw) : raw
        value = stripUrls(value)
        if (options.underscoreAsSpace) value = value.replace(/_/g, ' ')
        if (options.blankVars) value = blank(value, /var\([^()]*(?:\([^()]*\)[^()]*)*\)/g)
        for (const pattern of inner(value)) {
          for (const token of value.matchAll(pattern)) {
            const tokenEnd = (token.index ?? 0) + token[0].length
            hits.push({
              match: `${prefix}${value.slice(0, tokenEnd)}`,
              start: valueStart + (token.index ?? 0),
              end: valueStart + tokenEnd,
            })
          }
        }
      }
      return hits
    },
  }
}

const named = () => new RegExp(NAMED_COLOR_SRC, 'gi')
const transparent = () => new RegExp(TRANSPARENT_SRC, 'gi')

/**
 * Âncoras e referências (`href="#abc"`, `to="#fee"`, `url(#bad)`, `&#add;`) casam com o padrão de
 * hex curto mas não são cor: ficam fora. Qualquer outro `#abc` (`color: '#abc'`) continua sendo hex.
 */
const HEX_PATTERN =
  /(?<!(?:href|to|src|action|xlinkHref|xlink:href)\s*=\s*\{?\s*[`'"]|url\(\s*[`'"]?|[\w&])#[0-9a-fA-F]{3,8}\b/g

const RULES: Rule[] = [
  simple('hex', 'cor hexadecimal', HEX_PATTERN),
  simple(
    'color-function',
    'função de cor literal',
    /(?<![\w-])(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb)\(|(?<![\w-])color\(\s*(?:srgb|srgb-linear|display-p3|a98-rgb|prophoto-rgb|rec2020|xyz|xyz-d50|xyz-d65|from)\b/g,
  ),
  simple(
    'palette-class',
    'classe de paleta do Tailwind',
    new RegExp(`(?<![\\w-])${COLOR_UTILITY}-(?:${PALETTE})-\\d{2,3}(?![\\w-])`, 'g'),
  ),
  simple(
    // Utilitários Tailwind (`bg-white`, `border-transparent`, `text-black`...).
    'keyword-color',
    'white/black/transparent como utilitário',
    new RegExp(`(?<![\\w-])${COLOR_UTILITY}-(?:white|black|transparent)(?![\\w-])`, 'g'),
  ),
  simple(
    // `border-fc-void/0` é um "transparent" disfarçado. Única forma aceita: a borda invisível que
    // reserva 1px de layout (`border*-fc-void/0`), documentada em docs/ui/design-system.md.
    'zero-alpha',
    'alfa 0 em token de cor (use a borda invisível border-fc-void/0 só para reservar layout)',
    new RegExp(
      `(?<![\\w-])(?!border(?:-[xytrblse])?-fc-void/0(?![\\w.%]))${COLOR_UTILITY}-fc-[a-z0-9-]+/0(?![\\w.%])`,
      'g',
    ),
  ),
  // Declarações CSS e estilos inline: `color: white`, `border: 1px solid white`,
  // `boxShadow: '0 0 4px black'`, `--x: color-mix(in srgb, white 20%, ...)`, `background: red`.
  // `transparent` é permitido em CSS puro (paradas de gradiente, `border-right-color`) e proibido
  // quando o valor é uma string JS (`background: 'transparent'`).
  region(
    'named-color',
    'cor nomeada (white/black/red...) ou transparent em estilo',
    declaration(COLOR_PROP),
    (value) => (/^['"]/.test(value) ? [named(), transparent()] : [named()]),
    { lookahead: true, limit: limitToKey },
  ),
  // `color-mix(in srgb, white 20%, ...)` fora de uma declaração reconhecida.
  region(
    'named-color',
    'cor nomeada dentro de color-mix()',
    /(?<![\w-])(color-mix\()(?=([^\n]*))/g,
    () => [named()],
    { lookahead: true, limit: limitToParens },
  ),
  // Utilitários com valor arbitrário: `bg-[red]`, `shadow-[0_0_4px_black]`, `text-[color:white]`.
  region(
    'named-color',
    'cor nomeada em valor arbitrário do Tailwind',
    new RegExp(`(?<![\\w-])(${COLOR_UTILITY}-)\\[([^\\]\\s]+)\\]`, 'g'),
    () => [named(), transparent()],
    { underscoreAsSpace: true },
  ),
  // Propriedade arbitrária: `[color:red]`, `[border:1px_solid_white]`.
  region(
    'named-color',
    'cor nomeada em propriedade arbitrária do Tailwind',
    new RegExp(`(?<![\\w-])(\\[${COLOR_PROP}\\s*:)([^\\]\\s]+)\\]`, 'g'),
    () => [named(), transparent()],
    { underscoreAsSpace: true },
  ),
  // Atributos de SVG/ícone: `fill="white"`, `stroke="red"`, `stopColor="black"`, `color="red"`.
  region(
    'named-color',
    'cor nomeada ou transparent em atributo (fill/stroke/color)',
    /(?<![\w-])((?:fill|stroke|stopColor|stop-color|floodColor|flood-color|lightingColor|lighting-color|color|bgcolor)\s*=\s*\{?\s*)[`'"]([^`'"]*)[`'"]/g,
    () => [named(), transparent()],
  ),
  // Durações literais: `duration-150`, `delay-75`, `duration-[2s]`, `animate-[spin_1s_linear]`.
  simple(
    'literal-duration',
    'duração literal (use duration-(--fc-dur-*))',
    /(?<![\w-])(?:duration|delay)-(?:\d[\w.]*|\[[^\]]+\])(?![\w-])|(?<![\w-])animate-\[[^\]]*\d(?:ms|s)(?![a-zA-Z])[^\]]*\]/g,
  ),
  // `transition: opacity 200ms`, `animation-duration: 2s`, `transitionDelay: '50ms'` (0s/0ms ok).
  region(
    'literal-duration',
    'duração literal em transição/animação (use var(--fc-dur-*))',
    declaration(MOTION_PROP),
    () => [/(?<![\w.$-])(?!0(?:ms|s)(?![\w-]))\d*\.?\d+(?:ms|s)(?![\w-])/g],
    { blankVars: true, lookahead: true, limit: limitToKey },
  ),
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

/**
 * O mesmo token na mesma linha pode ser achado por duas regras (`--x: color-mix(.., white)` pela
 * declaração e pelo `color-mix`; `[color:red]` pela declaração e pela propriedade arbitrária).
 * Fica um achado por trecho (a regra mais longa, que traz mais contexto).
 */
function dedupe<T extends { match: string; start: number; end: number }>(hits: T[]): T[] {
  const byToken = new Map<string, T>()
  for (const hit of hits) {
    const key = `${hit.start}:${hit.end}`
    const previous = byToken.get(key)
    if (!previous || hit.match.length > previous.match.length) byToken.set(key, hit)
  }
  return Array.from(byToken.values())
}

/** Varre o conteúdo de um arquivo. `file` é só rótulo (caminho relativo com `/`). */
export function scanContent(file: string, content: string): ScanResult {
  const violations: Violation[] = []
  const exceptions: ScanResult['exceptions'] = []
  if (isAllowedPath(file)) return { violations, exceptions }

  content.split(/\r?\n/).forEach((text, index) => {
    const line = index + 1
    const markerAt = text.indexOf(ALLOW_MARKER)
    const clean = stripComments(text)
    const hits = dedupe(
      RULES.flatMap((rule) => rule.find(text, clean).map((hit) => ({ rule, ...hit }))),
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

/** Só as ocorrências de hex (para o teste de propriedade das cores: tokens e marcas). */
export function scanHexOnly(file: string, content: string): Violation[] {
  return scanContent(file, content).violations.filter((v) => v.kind === 'hex')
}

export function formatViolation(v: Violation): string {
  return `${v.file}:${v.line}  ${v.description}: ${v.match}`
}

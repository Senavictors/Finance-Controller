---
estado: planejado
fonte: src/styles/tokens.css
ultima-revisao: FC2-F0-09 2026-10-05
---

# Design system Dark Glass

## Filosofia

Interface escura, translúcida e calma, no espírito do iOS: camadas de vidro sobre um fundo quase preto, bordas de 1px e luz suave. A hierarquia vem de tipografia e espaço, não de caixas pesadas. Cor é informação: o app inteiro usa a mesma semântica financeira, então verde, vermelho e âmbar nunca são decoração. O único elemento "expressivo" é a aura da tela Hoje, que traduz o estado do mês em cor e movimento.

Princípios:

- **Um número manda.** Cada tela tem um foco visual (o hero, o saldo, a fatura).
- **Vidro com propósito.** Blur e transparência separam camadas (cards, barras, sheets); não se empilha vidro sobre vidro além de dois níveis.
- **Consistência acima de novidade.** Se existe token, usa-se o token.
- **Calma por padrão, alerta quando importa.** Estados de risco usam `--fc-pend` e `--fc-out`, com moderação.

## Regra "nenhuma cor literal"

Componentes, telas e CSS de feature só referenciam `var(--fc-*)`. Proibido: `#fff`, `rgb()`, `hsl()` ou classes Tailwind de paleta (`text-red-500`) para cor, raio, sombra, blur e duração. Precisa de algo que não existe? Abre task, adiciona o token em `src/styles/tokens.css` e documenta aqui. Esta regra substitui a antiga "sem roxo / tema Apex" do 1.x (ADR-018). O guardrail de revisão (`qa-revisor`) busca literais nos diffs e `tests/guards/no-literal-colors.test.ts` falha em cor, sombra nomeada e duração literais (detalhes e decisões em [`componentes.md`](componentes.md#regra-anti-cor-literal)).

## Tokens

Fonte única: `src/styles/tokens.css`. A integração com Tailwind v4 (`@theme inline`) e shadcn está em `src/app/globals.css` (task FC2-F0-03); ver "Integração com Tailwind v4 e shadcn" abaixo.

### Superfícies

| Token | Uso |
|---|---|
| `--fc-void` | fundo do app (atrás de tudo) |
| `--fc-ink` | superfície base da tela |
| `--fc-ink-raised` | sheets e popovers sólidos |
| `--fc-glass` | card de vidro padrão |
| `--fc-glass-strong` | card em destaque, estado pressionado |
| `--fc-glass-bar` | TabBar e toolbars |
| `--fc-glass-sheet` | corpo do Sheet |
| `--fc-rim` | borda de 1px do vidro |
| `--fc-divider` | separador de listas |
| `--fc-scrim` | película atrás de sheets e diálogos |

### Texto

| Token | Uso |
|---|---|
| `--fc-text` | texto principal |
| `--fc-text-2` | texto secundário |
| `--fc-text-3` | rótulos, metadados, placeholder |
| `--fc-text-on-accent` | texto sobre fundo `--fc-iris` (botão primário) |

### Acento

| Token | Uso |
|---|---|
| `--fc-iris` | ação primária, foco, seleção |
| `--fc-iris-hi` | realce, hover/pressed claro |
| `--fc-iris-lo` | gradiente de botão, estado ativo |
| `--fc-iris-soft` | fundo de chip selecionado, halo de foco |

### Semântica financeira

Ver seção própria abaixo.

### Categóricos

`--fc-cat-1` a `--fc-cat-10` colorem ícones de categoria e séries de gráficos, na ordem: transporte, mercado, restaurantes, delivery, lazer, compras, assinaturas, contas/moradia, saúde, outros. Não representam bom nem ruim.

### Espaço, raio, vidro, motion e z-index

Detalhados nas seções seguintes. Escala de z-index: tabbar 5, scrim 9, sheet 10, toast 20 (`--fc-z-*`).

## Integração com Tailwind v4 e shadcn

`src/app/globals.css` importa `tailwindcss`, `tw-animate-css`, `shadcn/tailwind.css` e `../styles/tokens.css`, nesta ordem, e só referencia `var(--fc-*)` (nenhuma cor literal; há teste em `src/styles/tokens.test.ts`). O app é somente dark: `<html>` sempre tem `class="dark"` e `color-scheme: dark`; não existe tema claro, toggle nem preferência salva.

### Utilitários gerados pelo `@theme inline`

| Utilitário | Origem | Exemplo |
|---|---|---|
| cores `fc-*` | `--color-fc-<nome>` -> `--fc-<nome>` (superfícies, texto, acento, semântica, `cat-1..10`) | `bg-fc-glass`, `border-fc-rim`, `text-fc-text-2`, `text-fc-in`, `bg-fc-cat-3` |
| raios `fc-*` | `--radius-fc-xs..sheet/pill` | `rounded-fc-lg`, `rounded-fc-pill` |
| sombras | `--shadow-fc-float/card/glow` | `shadow-fc-card` |
| espaço | `--spacing-fc-gutter/tabbar/touch` | `p-fc-gutter`, `h-fc-tabbar`, `min-h-fc-touch` |
| fontes | `--font-sans/heading/mono/num` | `font-sans`, `font-heading`, `font-num` |
| easing | `--ease-fc`, `--ease-fc-spring` | `ease-fc`, `ease-fc-spring` |
| blur de vidro (`@utility`) | `--fc-blur-card/bar/sheet` com prefixo `-webkit-` | `fc-blur-card`, `fc-blur-bar`, `fc-blur-sheet` |
| tipografia (`@utility`) | `font: var(--fc-text-*)` | `fc-text-hero`, `fc-text-title`, `fc-text-h2`, `fc-text-body`, `fc-text-sub`, `fc-text-label`, `fc-text-caption`, `fc-text-amount`, `fc-tabular` |

`fc-text-hero` e `fc-text-title` aplicam o tracking indicado; `fc-text-caption` aplica maiúsculas e tracking 0.06em; `fc-text-hero`, `fc-text-amount` e `fc-tabular` aplicam `tabular-nums`. Durações (`--fc-dur-*`) e `--animate-*` ficam para os primitivos (F0-04).

### Variáveis shadcn -> tokens (bloco único `:root`)

| shadcn | token |
|---|---|
| `--background` | `--fc-void` |
| `--foreground`, `--card-foreground`, `--popover-foreground`, `--secondary-foreground` | `--fc-text` |
| `--card`, `--popover` | `--fc-ink-raised` |
| `--primary`, `--ring`, `--sidebar-primary`, `--sidebar-ring` | `--fc-iris` |
| `--primary-foreground`, `--success-foreground`, `--warning-foreground`, `--sidebar-primary-foreground` | `--fc-text-on-accent` |
| `--secondary`, `--sidebar-accent` | `--fc-glass-strong` |
| `--muted` | `--fc-glass` |
| `--muted-foreground` | `--fc-text-2` |
| `--accent` | `--fc-iris-soft` |
| `--accent-foreground` | `--fc-iris-hi` |
| `--destructive` | `--fc-out` |
| `--success` | `--fc-in` |
| `--warning` | `--fc-pend` |
| `--border`, `--input`, `--sidebar-border` | `--fc-rim` |
| `--chart-1..5` | `--fc-cat-1..5` |
| `--sidebar` | `--fc-ink` |
| `--sidebar-foreground`, `--sidebar-accent-foreground` | `--fc-text` |
| `--radius` | `--fc-radius-md` |

Contraste medido (WCAG, texto sobre superfície, composição alfa sobre `--fc-void`/`--fc-ink-raised`): `--fc-text` sobre void 18,1:1; `--fc-text-2` sobre void 7,2:1, sobre card 6,9:1; `--fc-text-on-accent` sobre iris 7,5:1; `--fc-out` sobre void 8,2:1. `--fc-text-3` sobre void dá 3,4:1: usar só para texto grande, placeholder e metadado não essencial.

### Base e fontes

`@layer base` fixa fundo e cor do `html`/`body` em `--fc-void`/`--fc-text`, `font: var(--fc-text-body)`, `overscroll-behavior-y: none`, `touch-action: manipulation` em `button` e `a`, e `font-size: max(16px, 1em)` em `input`/`select`/`textarea` (evita o zoom automático do iOS ao focar).

`src/app/layout.tsx` carrega `Geist` e `Geist_Mono` por `next/font/google` (`--font-geist-sans`, `--font-geist-mono`, `display: swap`, `preload: false`), aplicadas no `<html>`. As pilhas `--fc-font-*` em `tokens.css` referenciam essas variáveis; no iPhone vale a fonte do sistema (`-apple-system`, `ui-rounded`) e o Geist só é baixado se for usado.

## Tipografia e escala

| Papel | Token | Especificação | Uso |
|---|---|---|---|
| Hero | `--fc-text-hero` | 700 / 54px / 1.0, tracking -0.035em, numérica | número principal de Hoje |
| Título | `--fc-text-title` | 700 / 30px / 1.05, tracking -0.025em | título de tela |
| H2 | `--fc-text-h2` | 700 / 22px / 1.15 | título de seção e de sheet |
| Corpo | `--fc-text-body` | 400 / 15px / 1.4 | texto corrido, linhas de lista |
| Sub | `--fc-text-sub` | 400 / 13px / 1.35 | descrição secundária |
| Label | `--fc-text-label` | 600 / 13px / 1.2 | rótulos de botão e chip |
| Caption | `--fc-text-caption` | 500 / 11px / 1.2 mono, maiúsculas, tracking 0.06em | cabeçalhos de seção, metadados |
| Valor | `--fc-text-amount` | 600 / 15px / 1.0 numérica | valores em listas |

Famílias: `--fc-font-ui` e `--fc-font-display` usam a fonte do sistema Apple no iPhone com Geist como fallback; `--fc-font-num` usa SF Pro Rounded (fallback Geist); `--fc-font-mono` usa Geist Mono. Todo número usa `font-variant-numeric: tabular-nums` para não "dançar" durante a contagem. Respeite o Dynamic Type do iOS: tamanhos em `rem` na integração, hero com `clamp` para não quebrar a linha em valores longos.

## Espaçamento, grade e gutter

Grade de 4px: `--fc-space-1` (4), `-2` (8), `-3` (12), `-4` (16), `-5` (20), `-6` (24), `-8` (32).

- **Gutter lateral: `--fc-gutter` = 18px** em todas as telas no iPhone. Cards ocupam 390 - 36 = 354px de largura útil.
- Espaço entre seções: `--fc-space-6`; entre cards: `--fc-space-3`; padding interno de card: `--fc-space-4`.
- Altura da TabBar: `--fc-tabbar-h` (68px) mais a safe area inferior.
- Alvo mínimo de toque: `--fc-touch-min` (44px).

## Raios

| Token | Valor | Uso |
|---|---|---|
| `--fc-radius-xs` | 8px | barras de progresso, thumbs |
| `--fc-radius-sm` | 12px | ícones de categoria, inputs |
| `--fc-radius-md` | 16px | botões |
| `--fc-radius-lg` | 24px | GlassCard |
| `--fc-radius-xl` | 30px | hero, TabBar |
| `--fc-radius-sheet` | 34px | cantos superiores do Sheet |
| `--fc-radius-pill` | 999px | Pill, Chip, SegmentedControl |

Raios aninhados: raio interno = raio externo - padding.

## Vidro, blur e sombra

| Camada | Fundo | Blur | Sombra | Borda |
|---|---|---|---|---|
| Card | `--fc-glass` | `--fc-blur-card` | `--fc-shadow-card` | 1px `--fc-rim` |
| Barra (TabBar, toolbar) | `--fc-glass-bar` | `--fc-blur-bar` | `--fc-shadow-float` | 1px `--fc-rim` |
| Sheet | `--fc-glass-sheet` | `--fc-blur-sheet` | `--fc-shadow-float` | 1px `--fc-rim` no topo |
| Botão primário / FAB | gradiente `--fc-iris-hi` a `--fc-iris-lo` | nenhum | `--fc-glow-iris` | nenhuma |

Performance: `backdrop-filter` é caro. No máximo três superfícies com blur visíveis ao mesmo tempo; listas longas usam `--fc-glass` sem blur por item (o blur fica no contêiner). Fallback quando `backdrop-filter` não é suportado: fundo `--fc-ink-raised`.

## Cor semântica financeira (fixa)

Significado igual em todas as telas, gráficos, ícones e textos:

| Token | Significa | Exemplos |
|---|---|---|
| `--fc-in` | entrada, positivo, saldo livre | salário, reembolso, "livre para gastar" |
| `--fc-out` | saída relevante, negativo, juros | cheque especial em uso, juros pagos, saldo negativo |
| `--fc-pend` | pendente, atenção, atrasado | previsto, vence em breve, parcela atrasada |
| `--fc-info` | informativo, transferência | transferência entre contas, nota neutra |
| `--fc-debt` | dívida e parcelas | consignado, parcelamento de cartão |

Regras: despesa comum não é vermelha (vermelho é para o que machuca: saldo negativo, juros, atraso grave); só entradas são verdes; a cor nunca é o único portador de significado (acompanha sinal, ícone ou texto, para daltonismo).

## Aura e seus 3 estados

A aura é um gradiente animado e desfocado (`--fc-aura-blur`) atrás do hero de Hoje. A cor reflete o estado calculado pela engine Disponível (ADR-021).

| Estado | Quando | Tokens | Sensação |
|---|---|---|---|
| Calmo | modo Normal, ritmo igual ou abaixo do ideal | `--fc-calm-1`, `-2`, `-3` (verde, índigo, ciano) | folga |
| Tenso | modo Normal com ritmo acima do ideal, ou itens vencendo em breve sem folga | `--fc-tense-1`, `-2`, `-3` (âmbar, violeta, laranja) | atenção |
| Quente | modo Aperto: falta dinheiro antes da renda | `--fc-hot-1`, `-2`, `-3` (rosa, magenta, vermelho) | ação necessária |

Comportamento: três blobs radiais deslocam-se lentamente (ciclo de 12 a 20 s, só `transform` e `opacity`); a transição entre estados interpola cores em `--fc-dur-slow`. Sob `prefers-reduced-motion`, a aura fica estática no estado atual. A aura é decorativa: o estado também é dito em texto ("Modo Aperto", "Ritmo acima do ideal") para acessibilidade.

## Motion

| Token | Valor | Uso |
|---|---|---|
| `--fc-ease` | cubic-bezier(0.2, 0.8, 0.2, 1) | transições gerais |
| `--fc-spring` | cubic-bezier(0.2, 0.9, 0.25, 1.12) | entrada de sheet, toast, FAB, mola leve |
| `--fc-dur-fast` | 180ms | pressed, toggle, chip |
| `--fc-dur-base` | 380ms | sheet, troca de aba, cards |
| `--fc-dur-slow` | 550ms | aura, hero |
| `--fc-dur-count` | 900ms | contagem de números |

O que anima: contagem do número principal ao abrir Hoje (`NumberTicker`), entrada e saída de sheet e toast, swipe do `InboxCard` (segue o dedo e retorna em mola), preenchimento de `ProgressTrack`, reordenação de lista, aura.

O que não anima: valores durante digitação, atualização silenciosa em segundo plano (troca sem contagem), listas longas ao rolar (sem animar entrada de cada item), tabelas e dados de relatório, qualquer coisa em reduced motion.

Regras: anime só `transform` e `opacity` (mantém 120 Hz no ProMotion); durações curtas para ações do usuário, longas só para ambiente; nada bloqueia interação enquanto anima.

## Acessibilidade

- **Contraste:** `--fc-text` sobre `--fc-ink` supera 7:1; `--fc-text-2` e `--fc-text-3` devem manter ao menos 4.5:1 para texto de corpo e 3:1 para texto grande e ícones; validar na auditoria da F6. Texto sobre vidro é validado sobre o pior caso do fundo (aura ativa).
- **Alvos de toque:** 44px mínimo (`--fc-touch-min`), com espaçamento de 8px entre alvos adjacentes; áreas de hit podem exceder o visual.
- **Reduced motion:** `prefers-reduced-motion: reduce` já zera as durações nos tokens; além disso aura estática, contagem substituída por valor final, swipe com botões equivalentes.
- **VoiceOver:** cada primitivo tem `role` e rótulo; `AmountText` lê "menos 1.234 reais e 56 centavos" em vez de símbolos; gráficos têm resumo textual e tabela alternativa; Toast usa `role="status"` com `aria-live="polite"`; Sheet prende o foco e restaura ao fechar; ações de swipe têm equivalente por botão.
- **Foco:** anel visível com `--fc-iris` e halo `--fc-iris-soft` para navegação por teclado.
- **Cor:** nunca é o único sinal (ver cor semântica).
- **Modo privacidade:** oculta valores com máscara, também para leitores de tela.

## Baseline iPhone 13 Pro

| Item | Valor |
|---|---|
| Viewport CSS | 390×844 (3x) |
| Notch / Dynamic Island | não há Dynamic Island; notch no topo |
| Safe areas | `env(safe-area-inset-top)` e `-bottom` (home indicator); a TabBar soma `--fc-tabbar-h` mais o inset inferior |
| Display | 120 Hz ProMotion: animar só `transform` e `opacity` para manter os quadros |
| PWA | `viewport-fit=cover`, `apple-mobile-web-app-capable`, status bar translúcida, ícones e splash para 1170×2532 |
| Háptico | a Vibration API não funciona no Safari iOS; usar apenas feedback visual e som discreto opcional |
| Teclado | o sheet de captura sobe com o teclado (`visualViewport`); campo focado ao abrir |

Todo layout é verificado em 390×844 primeiro. Desktop usa o mesmo conteúdo em layout expandido e atalhos (`/` ou ⌘K abre a captura).

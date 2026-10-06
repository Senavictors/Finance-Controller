---
id: FC2-F0-04
title: Primitivos de UI dark glass
status: backlog
type: feature
phase: F0
wave: 2
owner: ui-design-system
depends_on: [FC2-F0-03]
created_at: 2026-10-05
updated_at: 2026-10-05
affected_modules: [components-fc, lib, eslint]
related_use_cases: []
related_adrs: [ADR-018, ADR-017, ADR-002]
---

# FC2-F0-04 — Primitivos de UI dark glass

## Contexto
Com os tokens integrados ao Tailwind (FC2-F0-03), as telas 2.0 precisam de um conjunto pequeno de componentes base no estilo "dark glass" para serem montadas sem repetir classes. Eles vivem em `src/components/fc/` (ADR-018) e são usados pelo shell (F0-05), pela captura (F2-04), pelo Hoje (F3-04) e por todas as telas. O 1.x tem shadcn (`src/components/ui/*`) com visual claro/neutro e um `money-input.tsx` reaproveitável.

## Problema
- Não há componentes com o visual do protótipo (vidro, aura, valores tabulares com semântica de cor, sheet por baixo).
- Sem uma regra executável, cores literais voltam a aparecer em componentes e telas (o 1.x tinha `bg-white`, `red-200`, `slate-*`, hex).
- Falta um lugar para validar visualmente os primitivos antes de usá-los nas telas.

## Objetivo
Entregar os primitivos abaixo, tipados, acessíveis (alvo de toque >= 44px, foco visível, `prefers-reduced-motion`), baseados exclusivamente em tokens `--fc-*`, com uma galeria de desenvolvimento e um teste automatizado que proíbe cor literal em `src/components/**` e `src/app/**`.

## Fora de escopo
- Tab bar, shell e PWA (FC2-F0-05).
- Gráficos (linha de saldo projetado, ritmo): F3-04/F6.
- Gestos de swipe do Inbox e animações avançadas de 120 Hz (F6-01).
- Telas de produto.
- Remover o shadcn: permanece para primitivas sem equivalente (dropdown, select, date-picker); apenas os primitivos novos têm visual dark glass.

## Comportamento atual
`src/components/ui/*` (shadcn base-nova sobre `@base-ui/react`): `button`, `card`, `dialog`, `sheet`, `input`, `select`, `badge`, `date-picker`, `money-input`... com estilo neutro. `src/lib/format.ts` tem `formatCurrency(cents)`, `parseCents`, `formatDate`. `src/lib/brands/*` (ícones/gradientes de bancos, cores de **marca**, que são dado e não token). Não existe `src/components/fc/`.

## Comportamento esperado
Pasta `src/components/fc/`, um arquivo por componente + `index.ts` exportando tudo. Componentes de servidor por padrão; `'use client'` só onde há estado/efeito/eventos.

| Componente | API (props principais) | Comportamento |
|---|---|---|
| `GlassCard` | `variant: 'card' \| 'strong' \| 'bar' \| 'sheet'` (default `card`), `padding: 'none' \| 'sm' \| 'md' \| 'lg'`, `as`, `className` | Fundo `--fc-glass`/`--fc-glass-strong`/`--fc-glass-bar`/`--fc-glass-sheet`, borda 1px `--fc-rim`, raio `--fc-radius-lg` (`xl` na `bar`), blur `--fc-blur-card/bar/sheet`, sombra `--fc-shadow-card`. Fallback `@supports not (backdrop-filter: blur(1px))` com fundo sólido `--fc-ink-raised`. |
| `Aura` | `state: 'calm' \| 'tense' \| 'hot'`, `className` | Três gradientes radiais usando `--fc-{state}-1/2/3`, blur `--fc-aura-blur`, animação lenta de deriva (`@keyframes` em CSS); com `prefers-reduced-motion` fica estática. Decorativa (`aria-hidden`). |
| `AmountText` | `cents: number`, `tone: 'auto' \| 'in' \| 'out' \| 'pend' \| 'debt' \| 'neutral'`, `size: 'amount' \| 'hero'`, `showSign`, `hidden` (privacy), `animate` | Formata via `formatCurrency` (pt-BR/BRL), `fc-text-amount`/`fc-text-hero`, `tabular-nums`. `tone="auto"`: positivo `--fc-in`, negativo `--fc-out`, zero neutro. `hidden` mostra `R$ ••••`. `animate` conta de 0 até o valor em `--fc-dur-count` (rAF; instantâneo sob reduced-motion). `aria-label` com o valor completo por extenso numérico. |
| `Button` | `variant: 'primary' \| 'glass' \| 'ghost' \| 'danger'`, `size: 'md' \| 'lg' \| 'icon'`, `loading`, `asChild` | `primary`: fundo `--fc-iris`, texto `--fc-text-on-accent`, sombra `--fc-glow-iris`; altura mínima `--fc-touch-min`; estado `:active` com escala 0.97 e transição `--fc-spring`; `loading` desabilita e mostra spinner. |
| `IconButton` | `label` (obrigatório, vira `aria-label`), `icon` | 44x44px, variantes de `Button`. |
| `Chip` | `selected`, `onRemove?`, `tone?`, `leading?` | Raio `--fc-radius-pill`; selecionado usa `--fc-iris-soft` + borda `--fc-iris`; removível com botão `x` (alvo 44px por padding invisível). |
| `Segmented` | `options: {value,label}[]`, `value`, `onChange` | Controle de 2-4 opções com indicador deslizante; navegação por setas; `role="tablist"`. |
| `ListRow` | `leading`, `title`, `subtitle?`, `trailing?`, `onPress?`, `divider?` | Altura mínima 56px, divisor `--fc-divider`, toda a linha clicável quando `onPress`. |
| `CategoryIcon` | `icon` (nome lucide), `colorKey` (`cat-1`..`cat-10`), `size` | Quadrado com raio `--fc-radius-sm`, fundo `color-mix(in srgb, var(--fc-cat-N) 18%, transparent)`, ícone na cor `--fc-cat-N`. Chave inválida cai em `cat-10`. |
| `ProgressRing` | `value 0..1`, `size`, `tone`, `children` | SVG com `stroke` via `currentColor`/tokens; `role="progressbar"` com `aria-valuenow`. Usado no ritual (F6-02) e metas. |
| `ProgressBar` | `value 0..1`, `markerAt?` (ritmo), `tone` | Barra com marcador opcional do "dia ideal". |
| `Sheet` | `open`, `onOpenChange`, `title`, `children`, `snap?: 'auto' \| 'tall'` | Bottom sheet sobre `@base-ui/react` Dialog: scrim `--fc-scrim`, fundo `--fc-glass-sheet` com `--fc-blur-sheet`, raio superior `--fc-radius-sheet`, alça de arrasto, fecha com Esc, clique no scrim ou arrasto > 80px para baixo; `padding-bottom: calc(var(--fc-space-4) + env(safe-area-inset-bottom))`; trava foco e restaura ao fechar; z-index `--fc-z-sheet`. |
| `Toast` + `useToast` + `<Toaster/>` | `toast({ message, tone, action?, duration })` | Pílula de vidro no topo (abaixo do notch via `env(safe-area-inset-top)`), `role="status"`, ação "Desfazer" opcional, empilha no máximo 2. |
| `Skeleton` | `className` | Placeholder com shimmer (estático sob reduced-motion). |
| `EmptyState` | `icon`, `title`, `description`, `action?` | Bloco central dentro de `GlassCard`. |
| `Banner` | `tone: 'info' \| 'pend' \| 'out' \| 'in'`, `title`, `children` | Faixa informativa com ícone; usada para alertas de cheque especial, MEI etc. |
| `Field` + `MoneyField` | `label`, `error?`, `hint?`; `MoneyField`: `valueCents`, `onChangeCents` | Rótulo + controle + erro (`aria-describedby`). `MoneyField` envolve `ui/money-input` com `inputMode="decimal"`, fonte >= 16px, prefixo "R$", valor em centavos (usa `parseMoneyToCents`). |

Utilitários puros (testáveis): `src/components/fc/lib/amount.ts` exporta `toneForCents(cents)`, `formatAmountParts(cents, {showSign})` (retorna `{sign, symbol, integer, decimals}`) e `clampProgress(v)`; `src/components/fc/lib/category-color.ts` exporta `resolveCategoryColorKey(key)`.

**Galeria**: `src/app/(dev)/ui/page.tsx` mostra todos os primitivos em todos os estados (inclui `Aura` nos 3 estados, `AmountText` com valores positivos/negativos/zero/grandes, `Sheet` aberto por botão). Em produção responde `notFound()` (`if (process.env.NODE_ENV === 'production') notFound()`). Proteção por sessão vem do proxy (F0-06).

**Regra anti-cor-literal** (RN-01): teste `tests/guards/no-literal-colors.test.ts` varre `src/components/**/*.{ts,tsx}` e `src/app/**/*.{ts,tsx,css}` e falha ao encontrar `#[0-9a-fA-F]{3,8}\b`, `rgb(`, `rgba(`, `hsl(`, `oklch(` ou classes Tailwind de paleta (`(bg|text|border|ring|from|to|via)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d`), **exceto** (allowlist explícita, um comentário `// fc-allow-literal-color: motivo` na linha): `src/lib/brands/**` (cores de marca), `src/app/manifest.ts`/ícones PWA (F0-05) e `src/styles/tokens.css`. `white`/`black`/`transparent` também proibidos fora da allowlist (usar tokens).

## Regras de negócio
- RN-01: Componentes e telas usam **apenas** tokens `--fc-*` (via utilitários `*-fc-*` ou `var(--fc-*)`); cor literal é erro de teste (ADR-018).
- RN-02: Valor monetário é sempre `Int` em centavos na API dos componentes (ADR-002); formatação em pt-BR/BRL e `tabular-nums`.
- RN-03: Semântica de cor financeira é fixa: `--fc-in` entrada, `--fc-out` saída/negativo/juros, `--fc-pend` pendente/atenção/atrasado, `--fc-info` informativo/transferência, `--fc-debt` dívida/parcelas.
- RN-04: Todo alvo de toque tem pelo menos `--fc-touch-min` (44px).
- RN-05: Com `prefers-reduced-motion: reduce`, nenhuma animação decorativa roda (os tokens de duração já caem para 1ms; animações por `@keyframes` precisam de regra própria).
- RN-06: Haptics por Vibration API não existem no Safari iOS: não usar; feedback é visual.
- RN-07: Componentes são de servidor por padrão; `'use client'` apenas quando necessário.

## Critérios de aceitação
- [ ] CA-01: Existem em `src/components/fc/` todos os componentes da tabela, exportados por `src/components/fc/index.ts`.
- [ ] CA-02: `tests/guards/no-literal-colors.test.ts` existe, passa no estado final e **falha** quando se adiciona temporariamente `className="bg-white"` ou `style={{color:'#fff'}}` em qualquer componente (verificar manualmente e registrar).
- [ ] CA-03: `AmountText` renderiza `cents=-123456` como `-R$ 1.234,56` (ou `R$ -1.234,56` conforme `Intl`, fixar o formato escolhido em teste) com a cor `--fc-out`; `cents=0` com `tone=auto` usa `--fc-text-2`; `hidden` nunca contém dígitos no DOM.
- [ ] CA-04: `Sheet` abre/fecha por Esc, scrim e arrasto; o foco fica preso dentro enquanto aberto e volta ao elemento de origem ao fechar; em 390x844 o conteúdo não fica sob a home indicator (padding com `env(safe-area-inset-bottom)`).
- [ ] CA-05: Galeria `/ui` renderiza sem erros de console em Chrome 390x844; todos os botões/controles medem >= 44px de altura (checagem por script no console registrada em "Validação").
- [ ] CA-06: Com `prefers-reduced-motion: reduce` emulado, `Aura` não anima e `AmountText animate` mostra o valor final imediatamente.
- [ ] CA-07: `Segmented` navega com setas esquerda/direita e expõe `aria-selected`; `IconButton` sem `label` falha na checagem de tipos (prop obrigatória).
- [ ] CA-08: `npm run lint`, `npm test`, `npx next build`, `npm run format:check` passam.
- [ ] CA-09: Produção (`next build && next start`): `/ui` retorna 404.

## Impacto técnico
### Backend
Nenhum.
### Frontend
Novos `src/components/fc/*`, `src/components/fc/lib/*`, galeria `src/app/(dev)/ui/page.tsx`. `ui/money-input.tsx` é reutilizado, não modificado (se precisar de ajuste, via wrapper).
### Banco de dados
Nenhum.
### Integrações
Nenhuma (ícones `lucide-react` já presentes).
### Segurança
A galeria não pode vazar em produção (CA-09). Nenhum dado real nas amostras: valores fictícios redondos (ex.: R$ 1.000,00; -R$ 250,00).

## Plano de implementação
- [ ] Etapa 1 — Ler `tokens.css`, `globals.css` (pós F0-03), `src/components/ui/{button,sheet,dialog,money-input}.tsx`, `src/lib/format.ts` e o protótipo descrito em `docs/ui/` (se existir).
- [ ] Etapa 2 — Utilitários puros em `src/components/fc/lib/` + testes Vitest (`amount.test.ts`, `category-color.test.ts`).
- [ ] Etapa 3 — Implementar na ordem: `GlassCard`, `AmountText`, `Button`/`IconButton`, `Chip`, `Segmented`, `ListRow`, `CategoryIcon`, `ProgressRing`/`ProgressBar`, `Aura`, `Field`/`MoneyField`, `Banner`, `Skeleton`, `EmptyState`, `Toast`/`Toaster`, `Sheet`. Os `@keyframes` de `Aura`/`Skeleton` ficam em `src/components/fc/fc.css`, importado por `src/app/globals.css` (valores só via `var(--fc-*)`; `globals.css` continua sem cor literal).
- [ ] Etapa 4 — Galeria `src/app/(dev)/ui/page.tsx` (+ `notFound()` em produção).
- [ ] Etapa 5 — `tests/guards/no-literal-colors.test.ts` com a allowlist por comentário; rodar e corrigir violações em `src/components/ui/*` herdadas do shadcn (substituir por tokens ou aplicar o comentário de allowlist com justificativa).
- [ ] Etapa 6 — Verificação manual em Chrome 390x844 (DPR 3), reduced-motion e teclado; registrar medições.
- [ ] Etapa 7 — Atualizar `docs/ui/` (catálogo de primitivos com props) e `.agents/context/CONTEXT.md`; commit `feat(f0-04): primitivos de ui dark glass`.

## Estratégia de testes
- [ ] Unitários: `toneForCents(1)=in`, `(-1)=out`, `(0)=neutral`; `formatAmountParts(-123456)` => `{sign:'-', symbol:'R$', integer:'1.234', decimals:'56'}`; `formatAmountParts(0, {showSign:true})` sem sinal; `formatAmountParts(Number.MAX_SAFE_INTEGER)` não lança; `clampProgress(-1)=0`, `(2)=1`, `(NaN)=0`; `resolveCategoryColorKey('cat-3')='cat-3'`, `('xyz')='cat-10'`, `(undefined)='cat-10'`.
- [ ] Integração: teste `no-literal-colors` (positivo e com arquivo de fixture negativo em `tests/fixtures/` — string de código sintética, sem dados).
- [ ] E2E: não aplicável (sem runner de browser no projeto).
- [ ] Manual: galeria no Chrome 390x844 e, se possível, Safari iOS; teclado (Tab/Esc/setas); `prefers-reduced-motion`; leitor de tela (VoiceOver) em `AmountText` e `Sheet`.

## Riscos e rollback
- **Performance do `backdrop-filter`** em listas longas no iPhone: aplicar blur só em `GlassCard`/barras/sheets, nunca em itens de lista (`ListRow` não usa vidro). Medir na galeria com 50 `GlassCard`.
- **Allowlist do teste virar brecha**: cada `fc-allow-literal-color` exige motivo na mesma linha; o teste lista e conta as exceções (limite fixo no teste, ex. 10) para forçar revisão.
- **Base UI Dialog e arrasto**: o gesto de fechar pode conflitar com scroll interno; só iniciar o arrasto pela alça/cabeçalho.
- Rollback: `git revert` do commit; nenhuma tela depende dos primitivos ainda.

## Registro de execução
### Alterações realizadas
### Arquivos principais
### Decisões
### Divergências
### Pendências

## Validação
Comandos e resultados.

## Handoff
Link para o handoff ativo, quando aplicável.

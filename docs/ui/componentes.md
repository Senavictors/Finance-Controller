---
estado: vigente (primitivos da F0-04 implementados; TabBar, Fab, CardCarousel, InboxCard, Hero, StatusPill, Sparkline e gráficos seguem planejados)
fonte: src/components/fc/
ultima-revisao: FC2-F0-09 2026-10-05
---

# Catálogo de componentes

Primitivos dark glass em `src/components/fc/`, exportados por `src/components/fc/index.ts` (`import { Button, GlassCard } from '@/components/fc'`). O código manda; este doc descreve o contrato implementado. Todos usam só tokens `--fc-*` ([`design-system.md`](design-system.md)); o teste `tests/guards/no-literal-colors.test.ts` falha em cor literal em `src/components/**` e `src/app/**`.

Convenções: um arquivo por componente (`glass-card.tsx`, `amount-text.tsx`, ...); utilitários puros testáveis em `src/components/fc/lib/`; `@keyframes` e regras que o Tailwind não expressa em `src/components/fc/fc.css` (importado por `globals.css`). Componentes são de servidor por padrão; têm `'use client'`: `AmountText`, `Segmented`, `Sheet`, `Toast`/`Toaster`, `Field`/`MoneyField`. Primitivos recebem props: nenhum faz fetch, Prisma ou Server Action.

Galeria de desenvolvimento: `/ui` (`src/app/(dev)/ui/`), todos os estados com valores fictícios; responde 404 em produção.

Estados comuns a todo componente interativo: padrão, pressed (escala 0.97 com `--fc-spring`), foco visível (`outline` `--fc-iris`), desabilitado (opacidade 50%, sem sombra), carregando. Alvo de toque mínimo `--fc-touch-min` (44px).

## GlassCard

Contêiner de vidro. Base de quase tudo.

- Props: `variant` (`card` | `strong` | `bar` | `sheet`, padrão `card`), `padding` (`none` | `sm` | `md` | `lg`, padrão `md`), `as` (`div` | `section` | `article` | `aside` | `header` | `footer` | `li`), `className` + props de `div`.
- Anatomia: fundo `--fc-glass`/`--fc-glass-strong`/`--fc-glass-bar`/`--fc-glass-sheet`, borda 1px `--fc-rim`, raio `--fc-radius-lg` (`--fc-radius-xl` na `bar`), blur `--fc-blur-card`/`bar`/`sheet`, sombra `--fc-shadow-card`. Sem `backdrop-filter` (`@supports not`), cai em fundo sólido `--fc-ink-raised`.
- Do: um blur por contêiner. Don't: aninhar GlassCard; usar em itens de lista longa (use `ListRow` dentro de um único card).

## Aura

Decoração da tela Hoje.

- Props: `state` (`calm` | `tense` | `hot`, padrão `calm`), `className`.
- Anatomia: contêiner `absolute inset-0` com 3 blobs de gradiente radial `--fc-{state}-1/2/3`, `--fc-aura-blur`, deriva lenta por `transform` (keyframes em `fc.css`). `aria-hidden`. Posicione dentro de um contêiner `relative overflow-hidden`.
- Reduced motion: estática. Do: dizer o estado também em texto. Don't: usar fora de Hoje.

## AmountText

Único jeito de renderizar dinheiro.

- Props: `cents` (Int), `tone` (`auto` | `in` | `out` | `pend` | `debt` | `neutral`, padrão `auto`), `size` (`amount` | `hero`), `showSign`, `hidden` (privacidade), `animate`, `className`.
- Formato fixado: `-R$ 1.234,56` (sinal antes do símbolo, espaço não separável), via `formatCurrency` (`src/lib/format.ts`). `tabular-nums`, `--fc-font-num`.
- `tone="auto"`: positivo `--fc-in`, negativo `--fc-out`, zero `--fc-text-2`. `neutral` usa `--fc-text`.
- `hidden`: mostra `R$ ••••`; nenhum dígito no DOM. `animate`: conta até o valor em `--fc-dur-count` (rAF, só texto); instantâneo com reduced motion.
- Acessibilidade: texto visual `aria-hidden`, mais `sr-only` com "menos 1.234 reais e 56 centavos".
- Utilitários puros (`lib/amount.ts`): `toneForCents`, `formatAmountParts`, `formatAmountText`, `describeAmount`, `clampProgress`.

## Button e IconButton

- `Button` props: `variant` (`primary` | `glass` | `ghost` | `danger`, padrão `primary`), `size` (`md` | `lg` | `icon`), `loading` (desabilita, mostra spinner, `aria-busy`), `asChild` (aplica o estilo ao único filho, ex.: `<a>`), props de `button`.
- `primary`: fundo `--fc-iris`, texto `--fc-text-on-accent`, sombra `--fc-glow-iris`.
- `IconButton` props: `label` (obrigatório, vira `aria-label`; omitir é erro de tipo), `icon`, `variant` (padrão `glass`). 44x44px.
- Don't: dois `primary` na mesma tela.

## Chip

Atributo editável do rascunho de captura (categoria, valor, conta, data, tipo, parcelas).

- Props: `selected`, `onPress` (sem ele o chip é informativo), `onRemove` (mostra `x`), `removeLabel`, `tone` (`neutral` | `in` | `out` | `pend` | `info` | `debt`), `leading`, props de `button`.
- Selecionado: `--fc-iris-soft` com borda `--fc-iris`. Visual de 36px; botões internos de 44px (vazam 4px acima e abaixo da pílula).
- Do: mostrar o valor interpretado. Don't: truncar valor monetário.

## Segmented

2 a 4 opções (Todos | Inbox, 7d | 30d | Ciclo).

- Props: `options` (`{ value, label }[]`), `value`, `onChange`, `label` (aria), `className`.
- `role="tablist"`, abas com `aria-selected`, tabindex móvel; setas esquerda/direita (e Home/End) movem a seleção. Indicador desliza por `transform` com `--fc-spring`.
- Don't: mais de 4 opções.

## ListRow

Linha padrão de listas.

- Props: `leading`, `title`, `subtitle`, `trailing`, `onPress` (linha inteira vira botão), `divider` (padrão true; some na última linha), `className`.
- Altura mínima 56px, divisor `--fc-divider`, sem vidro (coloque várias linhas dentro de um único `GlassCard`).
- Don't: duas ações concorrentes no mesmo toque; valor sem `AmountText`.

## CategoryIcon

- Props: `icon` (nome kebab-case do conjunto curado `CATEGORY_ICONS`; desconhecido cai em `tag`), `colorKey` (`cat-1`..`cat-10`; inválido cai em `cat-10`, via `resolveCategoryColorKey`), `size` (`sm` 32 | `md` 40 | `lg` 48).
- Raio `--fc-radius-sm`, fundo `color-mix` da cor a 18%, glifo na cor cheia. Logos de bancos vêm de `src/lib/brands/`.
- Don't: usar a cor da categoria para sinalizar bom ou ruim.

## ProgressRing e ProgressBar

- `ProgressRing` props: `value` (0..1), `size` (px), `strokeWidth`, `tone` (`iris` | `in` | `out` | `pend` | `info` | `debt`), `label`, `children` (centro). SVG; `role="progressbar"` com `aria-valuenow`.
- `ProgressBar` props: `value`, `markerAt` (0..1, "dia ideal"), `tone`, `label`. Preenchimento por `transform: scaleX`; marcador vertical em `--fc-text`.
- `value` fora de 0..1 é limitado (`clampProgress`). A escolha do tom (ex.: passar do marcador) é da tela; o primitivo não decide significado.

## Sheet

Painel modal inferior (captura, edição, filtros), sobre Base UI Dialog.

- Props: `open`, `onOpenChange`, `title`, `children`, `snap` (`auto` | `tall`), `className`.
- Scrim `--fc-scrim` (`--fc-z-scrim`), corpo `--fc-glass-sheet` com `--fc-blur-sheet`, cantos `--fc-radius-sheet`, alça, `--fc-z-sheet`, `padding-bottom: calc(var(--fc-space-4) + env(safe-area-inset-bottom))`.
- Fecha com Esc, toque no scrim ou arrasto > 80px (só pela alça/cabeçalho; não conflita com a rolagem do conteúdo). Prende o foco e o devolve ao elemento de origem.
- Requer `viewport-fit=cover` no `<meta viewport>` para o `env(safe-area-inset-*)` valer no iPhone (F0-05).
- Don't: empilhar sheets; formulários longos.

## Toast, useToast e Toaster

- `toast({ message, tone, action, duration })` (também `useToast().toast`); `tone`: `neutral` | `success` | `info` | `warning` | `error`; `action`: `{ label, onPress }` (tipicamente "Desfazer"); `duration` padrão 5000 ms, `null` mantém; `error` não some sozinho (tem botão Fechar). `dismissToast(id)`.
- `<Toaster />` montado uma vez no shell: pílula de vidro abaixo do notch (`env(safe-area-inset-top)`), `role="status"` (`alert` em erro), no máximo 2 empilhados, pausa o timer com ponteiro/foco. Store de módulo: sem Provider.
- Do: todo salvar, apagar, adiar e importar em lote oferece Desfazer.

## Skeleton, EmptyState e Banner

- `Skeleton`: `className` (dimensione por ela); shimmer por `transform`, estático em reduced motion.
- `EmptyState`: `icon`, `title`, `description`, `action`; bloco central em `GlassCard`.
- `Banner`: `tone` (`info` | `pend` | `out` | `in`), `title`, `children`, `icon`; `role="note"` (`alert` em `out`). A cor não é o único sinal: o título é texto.

## Field e MoneyField

- `Field`: `label`, `error`, `hint`, `children` (nó, ou função que recebe `{ id, 'aria-describedby', 'aria-invalid' }`), `htmlFor`. Erro tem `role="alert"`.
- `MoneyField`: `label`, `error`, `hint`, `valueCents`, `onChangeCents`, `name`, `placeholder`, `disabled`, `required`, `autoFocus`. Envolve `ui/money-input` (`inputMode="decimal"`), fonte >= 16px, prefixo "R$", altura >= 44px. Estado local em texto (não sobrescreve a digitação); não aceita negativo (o tipo do lançamento define o sinal); usa `parseMoneyToCents`.

## Planejados (fora da F0-04)

TabBar e Fab (F0-05), Hero (F3-04), StatusPill/Pill, CardCarousel, InboxCard com swipe (F6-01), Sparkline e gráficos (F3-04/F6). Contratos de intenção: `docs/ui/padroes-de-tela.md` e as tasks correspondentes.

## Regra anti-cor-literal

`tests/guards/no-literal-colors.test.ts` (detector puro em `tests/guards/literal-colors.ts`) varre `src/components/**` e `src/app/**` (ts, tsx, css) e falha, com `arquivo:linha`, em:

- hex, `rgb(`/`hsl(`/`oklch(`/`lab(`/`color(display-p3 ...)`, classes de paleta do Tailwind (`bg-slate-500`);
- cores nomeadas do CSS (`red`, `white`, `darkslategray`...) em declaração (`color: red`, `border: 1px solid white`, `box-shadow: 0 0 4px black`, `boxShadow` inline), em valor arbitrário (`bg-[red]`, `shadow-[0_0_4px_black]`, `[color:red]`), dentro de `color-mix()` e em atributos SVG/ícone (`fill="white"`, `stroke="red"`, `color="red"`);
- `white`/`black`/`transparent` como utilitário (`bg-white`, `border-transparent`) e `transparent` em string de estilo JS (`background: 'transparent'`);
- alfa zero em token (`bg-fc-void/0`) fora da borda invisível;
- durações literais: `duration-150`, `delay-75`, `duration-[250ms]`, `transition: opacity 200ms`, `animation-duration: 2s` (use `duration-(--fc-dur-fast|base|slow)` ou `var(--fc-dur-*)`; `0s` é aceito).

Decisões:

- **`transparent` em CSS puro é permitido** (paradas de gradiente, `border-right-color`, `-webkit-tap-highlight-color`, final de `color-mix()`): não é um valor de cor. Como utilitário Tailwind ou string JS continua proibido.
- **Borda invisível**: para reservar 1px de layout (ex.: `focus-visible:border-ring` sem deslocar o conteúdo) use `border-fc-void/0` (ou `border-t-`/`border-l-`...). É a única forma de alfa zero aceita; qualquer outro `/0` em token é acusado. Pendência: token `--fc-clear` (ou equivalente) em `tokens.css` para substituir o idioma.
- **Comentários e outras chaves na mesma linha não contam**: nas regras por região (cor nomeada em declaração, `color-mix()`, transição/animação) o guard ignora comentários `//` e `/* */` e avalia só o valor da própria chave: se o valor começa com aspas, o literal (e os concatenados com `+`); senão, até a próxima chave da linha. Assim `color: 'var(--fc-out)', // vermelho (red)` e `{ color: 'var(--fc-cat-1)', name: 'Coral' }` passam, e `color: 'red', // nota` continua acusado. Acesso a propriedade com nome de cor (`user.green`, `green.main`) não é cor. Hex e classes de paleta seguem acusados até em comentário (são buscados na linha inteira).
- Um mesmo trecho é reportado uma vez só, mesmo quando duas regras o encontram.
- **Âncoras não são hex**: `href="#abc"`, `to="#fee"`, `url(#grad)` e entidades (`&#add;`) são ignorados. `#abc` em qualquer outro lugar (`color: '#abc'`) segue sendo hex.
- **Onde hex de cor pode existir**: o teste "hex de cor só existe onde a allowlist permite" varre `src/**` e `public/**` e só aceita hex em `src/styles/tokens.css`, `src/lib/brands/**` (cor de marca), `src/app/manifest.ts`, `src/app/icon*`, `src/app/apple-icon*`, `public/brands/**` e `public/icons/**`. Cada entrada de `ALLOWED_PATHS` carrega o motivo.
- Exceção pontual: comentário `fc-allow-literal-color: motivo` na mesma linha (motivo obrigatório; máximo de 10 no repositório).

## Checklist para novo primitivo

1. Existe equivalente no catálogo? Reutilize ou estenda.
2. Só tokens `--fc-*`; sem valores literais (o guard roda no `npm test`).
3. Estados: padrão, pressed, foco, desabilitado, carregando, vazio, erro.
4. Alvo de toque de 44px e rótulo acessível.
5. Respeita reduced motion (`@keyframes` precisam de regra própria em `fc.css`).
6. Entra na galeria `/ui`, neste catálogo e em `index.ts`; teste quando houver lógica pura.

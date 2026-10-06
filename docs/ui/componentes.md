---
estado: planejado
fonte: src/components/fc/
ultima-revisao: bootstrap-init 2026-10-05
---

# Catálogo de componentes

Primitivos dark glass em `src/components/fc/` (task FC2-F0-04). As props abaixo são o contrato planejado; ao implementar, o código manda e este doc é atualizado. Todos usam só tokens `--fc-*` ([`design-system.md`](design-system.md)). Convenção: um arquivo por componente (`glass-card.tsx`, `money-text.tsx`, ...) com `*.test.tsx` ao lado quando houver lógica.

Estados comuns a todo componente interativo: padrão, pressed (`--fc-glass-strong`, escala 0.98 em `--fc-dur-fast`), foco visível, desabilitado (opacidade reduzida, sem sombra), carregando (skeleton com `--fc-glass`).

## GlassCard

Contêiner de vidro. Base de quase tudo.

- Props: `tone` (`default` | `strong`), `padding` (`none` | `sm` | `md`), `interactive` (boolean), `as`, `className`.
- Anatomia: fundo `--fc-glass`, borda 1px `--fc-rim`, raio `--fc-radius-lg`, blur `--fc-blur-card`, sombra `--fc-shadow-card`.
- Do: usar para agrupar conteúdo relacionado; um blur por contêiner. Don't: aninhar GlassCard dentro de GlassCard com blur; usar para itens individuais de lista longa (use `ListRow` dentro de um único card).

## Hero / Aura

Bloco de destaque de Hoje com a aura atrás.

- Props: `state` (`calm` | `tense` | `hot`), `label`, `value` (centavos), `sublabel`, `children` (ações).
- Estados: os três da aura; transição em `--fc-dur-slow`; estático em reduced motion.
- Anatomia: camada de aura (blobs com `--fc-aura-blur`, `--fc-calm-*`/`--fc-tense-*`/`--fc-hot-*`), cartão `--fc-radius-xl`, rótulo em caption, número em `--fc-text-hero`, sublinha em `--fc-text-sub`.
- Do: dizer o estado também em texto. Don't: usar a aura fora de Hoje; deixar o número menor que o hero.

## MoneyText

Único jeito de renderizar dinheiro.

- Props: `cents` (inteiro), `tone` (`auto` | `in` | `out` | `pend` | `info` | `debt` | `neutral`), `size` (`hero` | `amount` | `sub`), `showSign`, `hideCents`, `currency` (padrão BRL), `masked` (privacidade).
- Comportamento: formata pt-BR com `src/lib/money.ts`; `tone="auto"` usa `--fc-in` para positivo e `--fc-out` para negativo em saldos (não em despesas comuns); `tabular-nums`; sinal explícito com `−` tipográfico.
- Acessibilidade: `aria-label` falado ("mil reais, negativo").
- Do: receber sempre centavos. Don't: formatar com `toFixed`, `Intl` solto ou dividir por 100 no componente de tela.

## NumberTicker

Contagem animada para valores grandes.

- Props: `value` (centavos), `duration` (padrão `--fc-dur-count`), `animateOnMount`, `format` (via MoneyText).
- Estados: anima só na primeira montagem e em mudança causada pelo usuário; atualização em segundo plano troca sem animar; reduced motion mostra o valor final.
- Do: usar apenas para o número principal. Don't: usar em listas ou durante digitação.

## Pill / StatusPill

Rótulo compacto, não interativo.

- Props `Pill`: `tone`, `icon`, `children`. Props `StatusPill`: `status` (`planned` | `pending` | `cleared` | `reconciled` | `late` | `needs-review`).
- Anatomia: raio `--fc-radius-pill`, fundo da cor semântica em baixa opacidade, texto na cor semântica, caption.
- Mapeamento: planned e pending usam `--fc-pend`; cleared `--fc-in`; reconciled `--fc-info`; late `--fc-out`; needs-review `--fc-iris`.
- Don't: usar StatusPill como botão; criar status sem texto.

## Chip

Atributo editável do rascunho de captura (categoria, valor, conta, data, tipo, parcelas).

- Props: `label`, `value`, `icon`, `selected`, `onPress`, `onRemove`, `tone`.
- Estados: padrão, selecionado (`--fc-iris-soft` e borda `--fc-iris`), com erro (`--fc-out`), em edição.
- Alvo de toque: 44px de altura efetiva. Do: mostrar o valor interpretado, não o rótulo vazio. Don't: truncar valor monetário.

## SegmentedControl

Alternância entre 2 a 4 opções (ex.: Todos | Inbox, Normal | Aperto, 7d | 30d | Ciclo).

- Props: `options` (`{ value, label, badge? }[]`), `value`, `onChange`, `size`.
- Anatomia: trilho `--fc-glass`, indicador deslizante com `--fc-spring`, raio `--fc-radius-pill`.
- Acessibilidade: `role="tablist"`/`radiogroup`, setas do teclado. Don't: mais de 4 opções (use menu).

## TabBar

Navegação fixa inferior com 4 destinos mais ação de captura central (ADR-017).

- Props: `items` (Hoje, Lançamentos, Planejar, Cartões), `active`, `onCapture`, `badges` (Inbox).
- Anatomia: vidro `--fc-glass-bar`, `--fc-blur-bar`, raio `--fc-radius-xl`, altura `--fc-tabbar-h` mais safe area inferior, `--fc-z-tabbar`. "Mais" abre pelo avatar ou ícone no cabeçalho das telas.
- Estados: ativo em `--fc-iris` com rótulo; inativo `--fc-text-3`; badge numérico em `--fc-pend`.
- Do: alvos de 44px. Don't: esconder ao rolar a ponto de perder a captura.

## Fab

Botão de captura global, centralizado sobre a TabBar.

- Props: `onPress`, `label` (acessibilidade, padrão "Novo lançamento"), `pulse` (boolean, só se inbox vazia e ritual pendente).
- Anatomia: círculo com gradiente `--fc-iris-hi` a `--fc-iris-lo`, ícone em `--fc-text-on-accent`, sombra `--fc-glow-iris`.
- Estados: pressed com mola `--fc-spring`. Don't: criar segundo FAB na mesma tela.

## Sheet

Painel modal inferior (captura, edição, filtros).

- Props: `open`, `onOpenChange`, `title`, `detents` (`auto` | `medium` | `large`), `children`, `footer`.
- Anatomia: scrim `--fc-scrim` (`--fc-z-scrim`), corpo `--fc-glass-sheet` com `--fc-blur-sheet`, cantos `--fc-radius-sheet`, alça, safe area, `--fc-z-sheet`.
- Comportamento: entra em `--fc-spring`/`--fc-dur-base`; arraste para baixo fecha; sobe junto do teclado; prende foco; Esc fecha na web.
- Don't: empilhar sheets; colocar formulários longos (divida em passos ou chips).

## Toast com Desfazer

Confirmação não bloqueante de ações reversíveis.

- Props: `message`, `action` (`{ label: 'Desfazer', onPress }`), `duration` (padrão 5 s), `tone` (`success` | `info` | `error`).
- Anatomia: pílula de vidro acima da TabBar, `--fc-z-toast`, `role="status"`.
- Comportamento: fila (um por vez); Desfazer reverte o use-case e some o toast; pausa o timer enquanto tocado; erro não some sozinho.
- Do: todo salvar, apagar, adiar e importar em lote oferece Desfazer. Don't: esconder erro financeiro em toast que some.

## ListRow

Linha padrão de listas (lançamentos, contas, vencimentos).

- Props: `leading` (CategoryIcon ou logo), `title`, `subtitle`, `trailing` (MoneyText), `meta` (StatusPill/data), `onPress`, `swipeActions`.
- Anatomia: altura mínima 56px, divisor `--fc-divider`, título `--fc-text-body`, subtítulo `--fc-text-sub` em `--fc-text-2`, valor `--fc-text-amount` alinhado à direita.
- Estados: planejado (título em `--fc-text-2`, StatusPill), atrasado (valor em `--fc-pend` ou `--fc-out`), selecionado.
- Don't: duas ações concorrentes no mesmo toque; valor sem MoneyText.

## CategoryIcon

Ícone de categoria em quadrado arredondado.

- Props: `categoryKey`, `size` (`sm` 32 | `md` 40), `fallback`.
- Anatomia: raio `--fc-radius-sm`, fundo da cor `--fc-cat-N` em baixa opacidade, glifo na cor cheia. Logos de bancos e serviços vêm de `src/lib/brands/` e `public/brands/`.
- Do: cor determinada pela categoria, estável. Don't: usar a cor da categoria para sinalizar bom ou ruim.

## ProgressTrack com marcador do dia

Barra de progresso para Flex, metas, limite de cartão e teto do MEI.

- Props: `value`, `max` (centavos), `marker` (fração do ciclo decorrida, 0 a 1), `tone` (`auto` | semântico), `label`, `showValues`.
- Anatomia: trilho `--fc-glass-strong`, preenchimento `--fc-radius-xs`, marcador vertical do dia em `--fc-text`.
- Comportamento com `tone="auto"`: preenchimento à esquerda do marcador usa `--fc-in`; ultrapassou o marcador usa `--fc-pend`; acima de 100% usa `--fc-out`. Preenche com `--fc-ease` em `--fc-dur-base`.
- Acessibilidade: `role="progressbar"` com texto "gasto X de Y; dia N de M".

## CardCarousel

Carrossel horizontal com snap (cartões de crédito em Cartões, "Vence em breve" em Hoje).

- Props: `items`, `renderItem`, `index`, `onIndexChange`, `peek` (px visíveis do próximo), `indicators`.
- Comportamento: `scroll-snap-type: x mandatory`, respeita o gutter de 18px (primeiro item alinhado ao gutter), indicadores de página, navegação por teclado na web.
- Don't: auto-avançar sozinho; esconder o item atrasado fora da primeira posição (atrasados vêm primeiro).

## InboxCard com swipe

Cartão de revisão da Inbox.

- Props: `transaction` (descrição bruta, valor, conta, data), `suggestions` (top-2 com `reason`), `match` (recorrência ou transferência), `onConfirm`, `onSnooze`, `onEdit`, `onCreateRule`.
- Gestos: direita confirma (indica `--fc-in`), esquerda adia (indica `--fc-pend`); limiar de 35% da largura; abaixo do limiar volta em mola. Teclado na web: setas, X confirma, R cria regra.
- Anatomia: GlassCard, descrição bruta em mono, sugestões como Chips com a razão em texto ("visto 5 vezes"), pilha com próximos cartões visíveis atrás.
- Acessibilidade: botões Confirmar e Adiar sempre presentes (equivalente ao swipe); VoiceOver anuncia a ação resultante.
- Don't: confirmar sem Desfazer.

## Sparkline / Charts

Gráficos leves em SVG, sem biblioteca pesada quando possível.

- `Sparkline`: props `points`, `tone`, `height`, `fill`; sem eixos; `aria-hidden` com texto alternativo no contêiner.
- Gráfico de saldo projetado (Hoje, modo Aperto): linha do saldo dia a dia, faixa do cheque especial em `--fc-out` suave, marcação de eventos (vencimentos e renda).
- Gráficos de categoria e fluxo: cores `--fc-cat-1` a `--fc-cat-10`; no máximo 10 séries, o restante agrupa em "outros" (`--fc-cat-10`).
- Regras: eixos e grade em `--fc-divider` e `--fc-text-3`; tooltip em `--fc-glass-sheet`; sempre tabela ou resumo textual alternativo; animação de desenho só na primeira montagem e desligada em reduced motion.
- Don't: usar a paleta categórica para significar positivo ou negativo; gráficos 3D; mais de uma escala por gráfico.

## Checklist para novo primitivo

1. Existe equivalente no catálogo? Reutilize ou estenda.
2. Só tokens `--fc-*`; sem valores literais.
3. Estados: padrão, pressed, foco, desabilitado, carregando, vazio, erro.
4. Alvo de toque de 44px e rótulo acessível.
5. Respeita reduced motion.
6. Documentado aqui e coberto por teste quando houver lógica.

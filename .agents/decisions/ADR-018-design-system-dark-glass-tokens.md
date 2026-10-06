---
id: ADR-018
title: Design system Dark Glass com tokens únicos
status: accepted
date: 2026-10-05
deciders: [Victor (dono do produto), orquestrador]
related_tasks: [FC2-F0-03, FC2-F0-04, FC2-F0-05, FC2-F6-01, FC2-F6-04]
supersedes: []
---

# ADR-018 — Design system Dark Glass com tokens únicos

## Contexto
O 1.x tinha tema claro/escuro alternável (`src/lib/theme.ts`), um tema "Apex" e a convenção do CLAUDE.md antigo "paleta azul/teal/verde, NO purple". Os protótipos do 2.0 validaram uma linguagem "dark glass" iOS-like. Sem uma fonte única de tokens, componentes acumulam cores literais e o visual diverge entre telas. O alvo é o iPhone 13 Pro (tela OLED, ProMotion 120 Hz, 390×844).

## Decisão
1. **Fonte única**: `src/styles/tokens.css`, com variáveis `--fc-*` para superfícies (`--fc-void`, `--fc-ink`, `--fc-glass`, `--fc-rim`), texto (`--fc-text`, `-2`, `-3`), acento (`--fc-iris*`), semântica financeira fixa (`--fc-in` entrada, `--fc-out` saída/juros, `--fc-pend` pendente/atrasado, `--fc-info` transferência, `--fc-debt` dívida), estados da aura (`calm/tense/hot`), paleta categórica `--fc-cat-1..10`, tipografia, espaço (grade de 4 px), raios, blur, sombras e motion.
2. **Tema único dark**. Sem alternância claro/escuro e sem tema Apex; `color-scheme: dark` fixo. O `.dark` do Tailwind passa a ser sempre aplicado. A regra antiga "NO purple" é **revogada**: o acento `--fc-iris` é azul-violeta e a aura "quente" usa tom violeta; o critério passa a ser "só tokens `--fc-*`".
3. **Proibido valor literal em componentes**: nenhuma cor hex/rgb/hsl, raio em px solto, sombra ou blur literal em `src/components/**` e `src/app/**`. Verificação automática no CI: regra de lint (`no-restricted-syntax` para literais de cor em `*.tsx`) e `grep -E "#[0-9a-fA-F]{3,8}\b|rgba?\(" src/components src/app` deve retornar vazio (exceções apenas em `tokens.css` e `public/`).
4. **Tipografia**: sistema Apple no iPhone (`-apple-system`, SF Pro Text/Display), **Geist** como fallback e fonte web no desktop, números em SF Pro Rounded/Geist com `font-variant-numeric: tabular-nums` (`--fc-text-amount`, `--fc-text-hero` 54 px). Rótulos em `--fc-font-mono` caixa alta.
5. **Motion com springs**: `--fc-spring: cubic-bezier(0.2, 0.9, 0.25, 1.12)` para entradas e toques, `--fc-ease` para transições simples; durações `--fc-dur-fast` 180 ms, `--fc-dur-base` 380 ms, `--fc-dur-slow` 550 ms, `--fc-dur-count` 900 ms para contagem de números. `prefers-reduced-motion` zera as durações (já no tokens.css). Animar só `transform` e `opacity`.
6. **iPhone 13 Pro como baseline**: layouts desenhados em 390×844; safe areas; alvos >= `--fc-touch-min` (44 px); `--fc-gutter` 18 px. Haptics via Vibration API não funcionam no Safari iOS, então feedback é só visual/sonoro discreto.
7. **Orçamento de performance de vidro**: no máximo 3 camadas com `backdrop-filter` visíveis ao mesmo tempo (TabBar, sheet, 1 card em destaque); cards de lista usam `--fc-glass` sem blur. Contraste mínimo: texto principal >= 7:1, secundário >= 4,5:1 sobre `--fc-ink`.
8. **Integração**: tokens mapeados em `@theme` do Tailwind v4 e nas variáveis do shadcn (`--background`, `--primary` etc. apontam para `--fc-*`); primitivos em `src/components/fc/`.

## Alternativas consideradas
### Alternativa A — Manter tema claro/escuro e Apex
- Vantagens: sem retrabalho nos componentes do 1.x; acessibilidade em ambientes claros.
- Desvantagens: dobra a superfície de QA; o vidro depende de fundo escuro para ler bem; o dono usa o app majoritariamente no celular em modo escuro.

### Alternativa B — Usar shadcn padrão com variáveis próprias, sem camada de tokens
- Vantagens: menos código inicial.
- Desvantagens: sem semântica financeira, aura, motion ou escala categórica; aumenta o risco de cores literais.

### Alternativa C — CSS-in-JS/theme object em TypeScript
- Vantagens: tokens tipados.
- Desvantagens: custo de runtime em 120 Hz, duplicação com Tailwind v4 e dificuldade de usar tokens em CSS puro (gradientes da aura).

## Consequências
### Positivas
- Visual coerente e auditável por script; mudar a identidade = editar um arquivo.
- Redução de bundle ao remover o seletor de tema.

### Negativas
- Sem modo claro; usuários com baixa visão que precisem dele ficam sem opção (aceitável: single-user).
- Vidro consome GPU; exige disciplina de performance.

### Riscos
- Queda de FPS em aparelhos mais antigos ou com muitas camadas: medir em Safari remoto, limite de 3 camadas.
- Divergência shadcn vs tokens: revisão do `qa-revisor` em cada primitivo.

## Plano de adoção
1. FC2-F0-03: carregar `tokens.css` no `globals.css`, mapear em `@theme`, carregar Geist via `next/font`.
2. FC2-F0-04: primitivos (`GlassCard`, `Sheet`, `TabBar`, `Amount`, `Chip`, `Aura`) em `src/components/fc/`.
3. Remover `src/lib/theme.ts` e o tema Apex; atualizar CLAUDE.md/AGENTS.md (feito no bootstrap).
4. FC2-F6-01 e F6-04: motion, 120 Hz, auditoria visual e a11y.

## Validação
- Script de CI que falha com cor literal fora de `tokens.css`.
- Lighthouse acessibilidade >= 95; sem queda de FPS abaixo de 55 em rolagem de lista de 200 itens no iPhone.
- Auditoria visual do `qa-revisor` em cada tela nova.

## Revisão
Ao fechar a F6, ou se o dono pedir modo claro.

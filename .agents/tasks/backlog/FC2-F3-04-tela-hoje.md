---
id: FC2-F3-04
title: Tela Hoje (hero com aura, modos Aperto e Normal, gráficos, vence em breve, ritual)
status: backlog
type: feature
phase: F3
wave: 3
owner: telas-produto
depends_on: [FC2-F3-02, FC2-F0-05]
created_at: 2026-10-05
updated_at: 2026-10-05
affected_modules: [app-hoje, components-fc, budget, ritual]
related_use_cases: []
related_adrs: [ADR-017, ADR-018, ADR-019, ADR-021]
---

# FC2-F3-04 — Tela Hoje (hero com aura, modos Aperto e Normal, gráficos, vence em breve, ritual)

## Contexto
Hoje é a home opinativa (spec §4.1): abrir o app mostra um número e o que vence, em 2 segundos, sem clicar. Tudo vem da engine Disponível (FC2-F3-02): modo, livre, R$/dia, ritmo, falta, série de caixa, estado da aura. O visual é o dark glass do ADR-018, com os tokens de `src/styles/tokens.css` (aura `--fc-calm-*`, `--fc-tense-*`, `--fc-hot-*`).

## Problema
O 1.x abre em `src/app/(app)/dashboard/` (`dashboard-client.tsx`, `dashboard-grid.tsx`, `widgets/`): painel de widgets arrastáveis com receita menos despesa do mês, previsão fora do layout (`forecast`) e sem noção de cheque especial, fatura por vencimento, atrasados ou modo de aperto. O usuário precisa montar o painel e ainda assim não obtém "quanto posso gastar".

## Objetivo
Entregar `src/app/(app)/hoje/page.tsx` com:
1. hero com aura que muda de cor por estado (calm, tense, hot);
2. dois modos: Aperto (falta até a renda, o que vence antes, gráfico de caixa com faixa do limite) e Normal (livre para gastar até o fim do ciclo, R$/dia, ritmo, "limite: flex | caixa");
3. gráfico de ritmo (ideal versus real) e gráfico de caixa projetado com a faixa do limite do cheque especial;
4. "Vence em breve" em carrossel, com atrasados destacados e a ação de confirmar recebimento da renda;
5. "Caixa no fim do ciclo" com a composição (saldo, entradas, faturas, fixas/DAS/parcelas);
6. "Contas" com saldo real e uso do cheque especial;
7. ritual do dia (anel de 2 passos) e sequência semanal.

## Fora de escopo
- Engine Disponível e Flex (F3-02, F3-03).
- Celebrações, sequência longa e modo privacidade (FC2-F6-02); aqui só o anel de 2 passos e a sequência de 7 dias.
- Motion refinado, gestos e otimização 120 Hz (FC2-F6-01); aqui animações simples só com `transform` e `opacity`.
- Inbox funcional (F4-05): o passo "revisar inbox" lê a contagem (0 até a F4).
- Gráficos de relatório (F6-03).

## Comportamento atual
`src/app/(app)/dashboard/page.tsx`, `dashboard-client.tsx`, `dashboard-grid.tsx`, `add-widget-dialog.tsx` e `widgets/` (1.x) formam um painel genérico; `src/app/api/dashboards/**` persiste o layout. Nada disso é reaproveitado (spec §9: dashboard drag-and-drop vira relatório opcional). `src/lib/format.ts` (1.x) fornece `formatCurrency`. A navegação raiz do 1.x (`src/app/page.tsx`, `middleware.ts` com `/dashboard`) deve apontar para `/hoje` (a FC2-F0-05/F0-06 ajusta o middleware; conferir).

## Comportamento esperado

### Dados
Server component `src/app/(app)/hoje/page.tsx` chama `getToday(userId, now)` (novo, `src/server/modules/budget/application/get-today.ts`) que compõe, em paralelo: `getAvailable` (F3-02), `getFlex` (F3-03) para o gráfico de ritmo, `listOutstanding` (F3-01), contas com `AccountBalance`, contagem de Inbox (0 até a F4) e o estado do ritual (`RitualDay`). Resposta tipada `TodayView` (somente DTOs serializáveis). Interações (confirmar recebimento) chamam rotas finas; após a mutação, `router.refresh()`.

### Layout (390x844, rolagem vertical)
```text
Hoje                                   05 out
[ HERO com aura ]
  Normal: "Livre para gastar até 04/11"
          R$ 1.500,00           (--fc-text-hero, count-up 900 ms)
          R$ 48,38/dia · 31 dias   chip [limite: flex]
          ritmo 0,0x do ideal
  Aperto: "Falta até o salário"
          R$ 300,00             (cor --fc-pend/--fc-out)
          renda prevista 05/11 · em 31 dias
          "O que vence antes": lista curta (2 itens + "ver todos")
[ gráfico principal ]   Normal: ritmo | Aperto: caixa projetado com faixa do limite
[ gráfico secundário ]  Normal: caixa projetado (compacto) | Aperto: (omitido)
Ritual de hoje   (anel 2 passos)   seg ter qua qui sex sab dom  (sequência)
Vence em breve   [ carrossel: fatura 10/10 | internet 08/10 | atrasado 28/09 ... ]
Caixa no fim do ciclo   R$ 2.600,00   (saldo, + entradas, - faturas, - fixas)
Contas   [ Corrente  -R$ 300,00  usou 30% do limite ]  [ Poupança R$ ... ]
```

### Hero e aura
Três camadas de aura sobrepostas (calm, tense, hot), cada uma com 3 manchas radiais usando os tokens da paleta (`--fc-calm-1/2/3`, etc.) e `filter: var(--fc-aura-blur)` aplicado em um elemento estático; a camada ativa tem `opacity: 1` e as outras `0`; a troca de estado é um cross-fade de `opacity` em `--fc-dur-slow`, e o movimento lento das manchas usa só `transform` (translate/scale) com keyframes longos. `state` vem de `AvailableResult.state`. Sem estado novo no cliente além da camada ativa.

Modo Normal: título "Livre para gastar até {fim do ciclo em dd/mm}"; número `freeCents` (negativo mostrado em `--fc-out`); "R$ X/dia" com `perDayCents` clampado em zero para exibição e "N dias" restantes; chip "limite: flex" ou "limite: caixa" a partir de `limitedBy`; linha de ritmo: `pace` com 1 casa e o texto "dentro do ritmo" (menor ou igual a 1) ou "acima do ritmo" (maior que 1).
Modo Aperto: "Falta até o salário" com `squeeze.shortfallCents`; "renda prevista em {data} · em N dias"; "O que vence antes" com `squeeze.dueBefore` (até 3 linhas, ordenadas por data, atrasados primeiro em `--fc-pend`) e "ver todos" abrindo uma sheet com a lista completa; botão secundário "Ver caixa" rola até o gráfico de caixa.

### Gráfico de ritmo (Normal)
SVG inline (sem biblioteca), eixo X os dias do ciclo, eixo Y o gasto flex acumulado em R$: linha ideal linear (de 0 ao `flexCents`, traço `--fc-text-3`, tracejada), linha real até hoje (`--fc-iris`; se `pace > 1`, trecho acima do ideal em `--fc-pend`), marcador de hoje (ponto `--fc-iris-hi`) e rótulo "R$ X gastos de R$ Y". Dados de `buildPaceSeries` (domínio puro, novo em `src/server/modules/budget/domain/pace-series.ts`).

### Gráfico de caixa projetado (ambos os modos)
Série `cashSeries` do `AvailableResult`: linha do saldo (`--fc-info`), linha de zero (`--fc-divider`), **faixa do limite do cheque especial** entre 0 e `floorCents` (preenchimento `--fc-pend` com baixa opacidade e rótulo "cheque especial"), trecho abaixo do piso em `--fc-out`, pontos nos dias com evento (fatura, fixa, renda) e marcador "hoje". Toque em um ponto mostra um tooltip com data, saldo e eventos do dia. Resumo textual acima do gráfico: "Menor saldo: R$ X em {data}" e, se existir, "Passa do limite em {firstBelowFloorDate}" em `--fc-out`. Acessibilidade: `role="img"` com `aria-label` do resumo e uma tabela oculta visualmente com os pontos de evento.

### Vence em breve
Carrossel horizontal (scroll-snap) com itens dos próximos 14 dias e todos os atrasados, ordenados por data com atrasados primeiro. Cada card: ícone/marca, nome, valor, "vence em N dias" ou "atrasado há N dias" (`--fc-pend`). Renda (INFLOW de série INCOME) mostra a ação "Confirmar recebimento" que chama `confirmPlanned` (F3-01); fatura mostra "Pagar" levando a `/cartoes`.

### Caixa no fim do ciclo
Valor `cashEndOfCycleCents` e a composição de `AvailableResult.cashBreakdown`: saldo atual, entradas previstas, faturas, fixas, DAS e parcelas (as linhas de saída com `--fc-text-2` e o resultado em destaque; negativo em `--fc-out`).

### Contas
Cartão por conta de caixa: nome, saldo real, e para quem tem limite de cheque especial uma barra de uso (`usedCents` de `limitCents`): preenchimento `--fc-pend` até 80% e `--fc-out` a partir de 80%; se `usedCents > limitCents` mostra "excede o limite".

### Ritual (versão base)
Anel de 2 passos: (1) "Revisar inbox" (concluído quando a contagem é 0, ou seja, hoje já concluído até a F4), (2) "Registrar gastos" (concluído ao haver pelo menos 1 lançamento criado hoje ou ao tocar "Sem gastos hoje"). Sequência semanal: 7 pontos (segunda a domingo) preenchidos nos dias com os 2 passos concluídos (`RitualDay`). Dia atual com anel parcial. Persistência: tabela `RitualDay { userId, date, openedApp, inboxDone, loggedDone, noSpend }`, gravada no servidor; `openedApp` é marcado no primeiro carregamento do dia (métrica "app aberto em 5 de 7 dias"). Celebrações e privacidade ficam na F6-02.

## Regras de negócio
- RN-01: a tela só exibe números de `AvailableResult`/`FlexResult`; nenhum cálculo financeiro novo no componente (apenas formatação e escala de gráfico).
- RN-02: modo vem de `mode`; estado da aura de `state`; nenhuma lógica de limiar duplicada na UI.
- RN-03: valores formatados em reais a partir de centavos (`formatCurrency`); datas em UTC (`timeZone: 'UTC'`).
- RN-04: só tokens `--fc-*`; nenhuma cor, raio, sombra ou blur literal (ADR-018). Gradientes da aura compostos apenas com os tokens de aura.
- RN-05: animações apenas em `transform` e `opacity`; com `prefers-reduced-motion` o count-up e o movimento das manchas ficam desligados (os tokens `--fc-dur-*` já viram 1 ms; manter também a lógica em JS).
- RN-06: atrasados sempre aparecem primeiro em "Vence em breve" e entram no "O que vence antes" do modo Aperto.
- RN-07: alvos de toque de no mínimo 44 px (`--fc-touch-min`).
- RN-08: sem dado real: fixtures e exemplos fictícios em `tests/fixtures/`.
- RN-09: conteúdo da tela atrás da TabBar respeita o padding inferior `--fc-tabbar-h` mais a safe area do iOS (`env(safe-area-inset-bottom)`).
- RN-10: o carregamento inicial é server-rendered; sem requisições de cliente para o primeiro paint.

## Critérios de aceitação
- [ ] CA-01: `/hoje` renderiza em 390x844 sem rolagem horizontal e é a rota inicial após o login.
- [ ] CA-02: o modo Normal mostra livre, R$/dia, dias, "limite: flex|caixa" e o ritmo; o modo Aperto mostra "Falta até o salário", data da renda e a lista "o que vence antes" (matriz de estados abaixo).
- [ ] CA-03: a aura troca entre calm, tense e hot por cross-fade de opacidade conforme `state`; nenhuma cor literal no CSS da tela (`grep` por `#[0-9a-fA-F]{3,8}` e `rgb(` nos arquivos novos retorna vazio).
- [ ] CA-04: o gráfico de ritmo mostra a linha ideal, a real e o marcador de hoje com os valores de `buildPaceSeries`.
- [ ] CA-05: o gráfico de caixa desenha a faixa do limite, o trecho abaixo do piso em `--fc-out` e o tooltip por toque; o resumo textual reflete `minBalanceCents` e `firstBelowFloorDate`.
- [ ] CA-06: "Vence em breve" lista atrasados primeiro com destaque e a renda tem "Confirmar recebimento", que muda o item para recebido e atualiza o hero.
- [ ] CA-07: "Caixa no fim do ciclo" mostra a composição que soma exatamente `cashEndOfCycleCents`.
- [ ] CA-08: "Contas" mostra o uso do cheque especial com a cor correta por faixa e o aviso de excedente.
- [ ] CA-09: o ritual mostra o anel de 2 passos e a sequência da semana; `RitualDay.openedApp` é gravado uma vez por dia.
- [ ] CA-10: primeiro conteúdo útil (hero com número) visível em menos de 2 s em rede 4G simulada (Lighthouse/DevTools), com `loading.tsx` de esqueleto.
- [ ] CA-11: contraste mínimo 4,5:1 para texto normal sobre a aura e o vidro nos três estados (verificação registrada; a auditoria completa é da F6-04).
- [ ] CA-12: `npm run lint`, `npm test`, `npx next build` passam.

## Impacto técnico
### Backend
`src/server/modules/budget/application/get-today.ts`; `src/server/modules/budget/domain/pace-series.ts` (+ teste); `src/server/modules/ritual/application/mark-opened.ts`, `mark-no-spend.ts`, `get-ritual-week.ts`; rotas finas `src/app/api/ritual/no-spend/route.ts` e `src/app/api/recurring/[id]/confirm/route.ts` (usa `confirmPlanned` da F3-01). `src/server/modules/budget/domain/available.ts` (F3-02) deve expor `cashBreakdown` (ver F3-02).
### Frontend
- `src/app/(app)/hoje/page.tsx`, `loading.tsx`, `hoje-client.tsx`.
- `src/components/fc/hoje/`: `hero.tsx`, `hero-aura.tsx`, `hero-normal.tsx`, `hero-aperto.tsx`, `due-before-list.tsx`, `pace-chart.tsx`, `cash-chart.tsx`, `chart-scale.ts` (+ teste), `upcoming-carousel.tsx`, `cycle-end-cash.tsx`, `accounts-overdraft.tsx`, `ritual-card.tsx`, `count-up.tsx`.
- Remover `src/app/(app)/dashboard/` e `src/app/api/dashboards/**` do 1.x se a F0-01 não removeu.
### Banco de dados
`RitualDay` (nova; migration aditiva; `@@unique([userId, date])`). Se a F0-02 já a incluiu, apenas usar.
### Integrações
Nenhuma.
### Segurança
Server component com `requireAuth`; DTOs sem ids internos desnecessários; mutações com Zod e `userId`.

## Plano de implementação
- [ ] Etapa 1: confirmar o contrato de `AvailableResult` (incluindo `cashBreakdown`) e criar fixtures sintéticas dos 4 cenários da F3-02 em `tests/fixtures/available/`.
- [ ] Etapa 2: `get-today.ts`, `pace-series.ts` e testes.
- [ ] Etapa 3: `hero-aura` (3 camadas, cross-fade) e `hero` (Normal e Aperto).
- [ ] Etapa 4: `chart-scale.ts`, `pace-chart.tsx`, `cash-chart.tsx` com faixa do limite e tooltip.
- [ ] Etapa 5: `upcoming-carousel.tsx` com atrasados e confirmar recebimento.
- [ ] Etapa 6: `cycle-end-cash.tsx` e `accounts-overdraft.tsx`.
- [ ] Etapa 7: ritual (backend + `ritual-card.tsx`) e `RitualDay`.
- [ ] Etapa 8: `loading.tsx`, estados vazio/erro, padding da TabBar e safe area.
- [ ] Etapa 9: remover dashboard antigo; docs (`docs/ui/hoje.md`) e `.agents/context/CONTEXT.md`.

## Estratégia de testes
Fixtures: os cenários A, B, C, D da FC2-F3-02 (valores fictícios), serializados em `tests/fixtures/available/*.json`.

- [ ] Unitários, `buildPaceSeries` (ciclo de 30 dias, `flex = 90000`, gastos: dia 2 de 10000, dia 5 de 15000, dia 9 de 15000, hoje dia 10): acumulado real [dia 1: 0, 2: 10000, 5: 25000, 9: 40000, 10: 40000]; ideal no dia 10 = 30000; sem gasto: linha real em zero.
- [ ] Unitários, `chart-scale` (domínio/escala): série com mínimo −120000 e máximo 380000 inclui o zero e o piso `−100000` no domínio; série toda positiva não cria faixa; série constante não divide por zero.
- [ ] Componentes (Vitest + jsdom): matriz de estados abaixo, verificando textos, o chip "limite", a camada de aura ativa (atributo `data-state`) e a ausência de classes/estilos de cor literal.

| Fixture | mode | state | Hero mostra | Gráfico principal |
|---|---|---|---|---|
| Cenário A (negativo + cheque) | APERTO | hot | "Falta até o salário" R$ 200,00, lista com fatura e fixa | caixa com faixa; passa do limite em 25/10 |
| Cenário B (faturas antes da renda) | APERTO | hot | R$ 300,00; lista fatura 25/10 e boleto 30/10 | caixa |
| Cenário C (renda recebida) | NORMAL | calm | "Livre para gastar até 04/11" R$ 1.500,00, R$ 48,38/dia, limite: flex | ritmo |
| Cenário D (parcela atrasada) | APERTO | hot | R$ 100,00; parcela atrasada em `--fc-pend` primeiro | caixa |
| Normal com ritmo 1,33 | NORMAL | tense | "acima do ritmo" | ritmo com trecho em `--fc-pend` |
| Normal limitado por caixa | NORMAL | tense | chip "limite: caixa" | ritmo |

- [ ] Integração: `get-today` com repositórios simulados compõe as partes e nunca lê outro `userId`; `mark-opened` idempotente; confirmar recebimento atualiza o item.
- [ ] E2E: opcional (Playwright): abrir `/hoje` com dados de teste e conferir modo e número.
- [ ] Manual (iPhone 13 Pro, PWA): leitura do hero, aura nos 3 estados (trocar fixture), toque no gráfico de caixa, carrossel, safe area, rolagem a 120 Hz sem engasgos.

Edge cases: ciclo sem renda pendente (Normal sem "renda prevista"); `flexCents = 0` (ritmo oculto, mostrar "defina o flex em Planejar"); `freeCents` negativo em Normal (número em `--fc-out` e texto "acima do que cabe"); zero itens a vencer (estado vazio "nada vence nos próximos 14 dias"); saldo positivo sem limite de cheque (a seção de uso oculta a barra); mais de 20 eventos na série (pontos agrupados no gráfico); primeiro uso sem contas (CTA para criar conta).

## Riscos e rollback
- Risco: `blur` custoso na aura. Mitigação: blur em elemento estático, só `transform` e `opacity` animam, e `will-change` apenas durante a animação; desligar o movimento em `prefers-reduced-motion`.
- Risco: números divergirem entre telas. Mitigação: RN-01, uma única fonte (`AvailableResult`) e testes por fixtures.
- Risco: densidade visual demais para 390 px. Mitigação: seções colapsáveis abaixo do hero e testes manuais no aparelho.
- Rollback: rota nova; reverter o commit restaura a navegação anterior (o legado foi removido na F0-01, então o fallback é a rota `/lancamentos`).

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

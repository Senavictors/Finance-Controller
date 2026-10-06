---
id: FC2-F3-05
title: Tela Planejar (renda do ciclo, alocação, dívidas, Flex, custo de vida, metas)
status: backlog
type: feature
phase: F3
wave: 2
owner: telas-produto
depends_on: [FC2-F3-03, FC2-F1-05]
created_at: 2026-10-05
updated_at: 2026-10-05
affected_modules: [app-planejar, components-fc, budget, recurring, debts, income, goals]
related_use_cases: []
related_adrs: [ADR-017, ADR-018, ADR-020, ADR-022, ADR-028, ADR-029]
---

# FC2-F3-05 — Tela Planejar (renda do ciclo, alocação, dívidas, Flex, custo de vida, metas)

## Contexto
Planejar (spec §4.4) responde "para onde vai a renda deste ciclo". Reúne: renda do ciclo (base mais adicional por dia presencial, DAS, teto anual do MEI), barra de alocação, dívidas e juros ordenadas por taxa, Flex por categoria com marcador do dia, watchlists, "quanto custa a sua vida" e metas. Esta task também abriga o cadastro de recorrências (fixas e assinaturas) cujo backend é a FC2-F3-01. Dependências de dados já entregues antes desta onda: renda MEI (F1-06), dívidas (F1-05), Flex (F3-03), recorrências (F3-01) e metas (F3-07).

## Problema
O 1.x não tem tela equivalente: `src/app/(app)/goals/` (metas de orçamento por métrica), `src/app/(app)/wishlist/`, `src/app/(app)/recurring/` (lista e formulário de regras com botão "Aplicar", `recurring-form.tsx`, `recurring-list.tsx`, `recurring-stats.tsx`, `recurring-utils.ts`) e o forecast solto. Não há visão de renda versus compromissos, nenhuma noção de juros por dívida, nem de orçamento flex.

## Objetivo
Entregar `src/app/(app)/planejar/page.tsx`, mobile-first, com um controle segmentado de 4 seções (Ciclo, Dívidas, Flex, Metas):
1. **Ciclo**: renda do ciclo (base, adicional presencial calculado pelo calendário, total), DAS e teto anual do MEI; barra de alocação; lista "Fixas e assinaturas" com cadastro de série;
2. **Dívidas**: lista ordenada por taxa com saldo, custo mensal em R$ e data prevista de quitação;
3. **Flex**: valor do ciclo (com sugestão), barra geral com marcador do dia, categorias com marcador do dia, watchlists e "Quanto custa a sua vida";
4. **Metas**: lista com progresso e criação/edição.

## Fora de escopo
- Engines de renda, dívidas, flex, recorrência e metas (F1-05, F1-06, F3-03, F3-01, F3-07); aqui só consumo, mais três funções puras de apresentação listadas abaixo.
- Tela Hoje (F3-04) e Cartões (F3-06).
- Simulação "e se" de amortização (backlog).
- Configuração de feriados e dias presenciais (vive em "Mais"/Renda; esta tela só lê e linka).

## Comportamento atual
Ver Problema. Reaproveitar apenas: `src/app/(app)/recurring/recurring-utils.ts` como referência dos rótulos de frequência (a lógica é descartada), e a ideia de `wishlist-card.tsx`/`goal-card.tsx` para o card de meta (visual novo, tokens). Nada de `calculateGoalProgress`.

## Comportamento esperado

### Dados
Server component chama `getPlan(userId, now)` (novo, `src/server/modules/budget/application/get-plan.ts`) que compõe: renda prevista do ciclo e DAS/teto (F1-06), alocação (`computeAllocation`), dívidas (F1-05), `getFlex` e `BudgetLine` (F3-03), custo de vida (`computeLivingCost`), metas (F3-07) e séries recorrentes (F3-01). DTO `PlanView` serializável.

### Funções puras novas (esta task; `src/server/modules/budget/domain/`)
```ts
// allocation.ts
export type AllocationInput = {
  incomeCents: number
  fixedCents: number            // contas/assinaturas (séries FIXED + BILL/SUBSCRIPTION)
  installmentsCents: number     // parcelas de dívida do ciclo
  dasCents: number
  nonMonthlyProvisionCents: number
  flexCents: number
}
export type AllocationResult = {
  segments: { key: 'FIXED' | 'INSTALLMENTS' | 'DAS' | 'NON_MONTHLY' | 'FLEX' | 'RESERVE'; cents: number; pct: number }[]
  reserveCents: number          // renda − Σ comprometido (pode ser negativo)
  shortfallCents: number        // max(0, −reserveCents): "para sair do vermelho"
  overflow: boolean
}
// living-cost.ts
export type LivingCostInput = {
  fixedCents: number; installmentsCents: number; dasCents: number
  nonMonthlyProvisionCents: number
  avgFlexSpentCents: number     // média dos últimos 3 ciclos fechados (ou o ciclo atual projetado se houver menos)
  daysInCycle: number
  reserveSavedCents: number     // soma das metas RESERVE
}
export type LivingCostResult = { monthlyCents: number; perDayCents: number; monthsCovered: number | null }
```
`computeAllocation`: `reserve = income − (fixed + installments + das + nonMonthly + flex)`; segmentos em ordem fixa FIXED, INSTALLMENTS, DAS, NON_MONTHLY, FLEX, RESERVE; `pct` relativo à renda (arredondado a 1 casa; quando há excesso, relativo à soma dos comprometidos). `computeLivingCost`: `monthly = fixed + installments + das + nonMonthly + avgFlexSpent`; `perDay = floor(monthly / daysInCycle)`; `monthsCovered = monthly > 0 ? reserveSaved / monthly : null`. Ordem das dívidas e cálculo de juros vêm da F1-05 (`monthlyRate`, `monthlyCostCents`, `payoffDate`); a UI só ordena por taxa decrescente como segurança.

### Seção Ciclo
- Card "Renda do ciclo": "Base R$ 3.000,00", "N dias presenciais × R$ 150,00 = R$ X", total previsto e a data de pagamento; chip "DAS R$ Y" e barra "teto anual do MEI: R$ A de R$ B (P%)" (valores de `MeiLedger`, F1-06). Link "ajustar regra de renda" para `/mais`.
- Barra de alocação: barra horizontal segmentada com as cores por token (FIXED `--fc-cat-8`, INSTALLMENTS `--fc-debt`, DAS `--fc-info`, NON_MONTHLY `--fc-cat-7`, FLEX `--fc-iris`, RESERVE `--fc-in`); legenda com valor e percentual; quando `overflow`, trecho excedente em `--fc-out` e o texto "falta R$ X para sair do vermelho"; sem excesso o rótulo do último segmento é "reserva".
- "Fixas e assinaturas": lista de séries ativas (nome, valor, próxima data, conta) com ação "Nova recorrência" e edição em sheet: nome, valor (ou faixa mínimo e máximo), conta, categoria, tipo (BILL, SUBSCRIPTION, INCOME, TRANSFER, TAX), frequência (mensal no dia N, último dia do mês, semanal em dia(s), anual), data inicial, confirmação automática. O formulário monta o RRULE com `buildMonthlyRRule` (F3-01); dia 29/30/31 mostra a dica "em meses curtos cai no último dia". Chama as rotas `src/app/api/recurring/**` (F3-01).

### Seção Dívidas
Lista ordenada por taxa decrescente (rotativo, cheque especial, Pix no crédito/limite convertido, consignado, conforme a taxa informada por contrato). Cada item: nome/tipo, taxa % ao mês, saldo devedor, custo mensal de juros em R$ (`--fc-out` para juros), parcela do ciclo, data prevista de quitação. Cabeçalho com o total de juros do mês. Dívidas atrasadas com selo `--fc-pend`. Toque abre o detalhe (cronograma; reaproveita a tela de dívida da F1-05 se existir, senão uma sheet simples).

### Seção Flex
- Campo "Flex do ciclo" (editável) com a sugestão de `suggestFlex` ("Sugerido: R$ X · usar") e o colchão.
- Barra geral: gasto do ciclo sobre o flex, com **marcador do dia** em `idealSpentTodayCents / flexCents`; cor da barra por `status` e `pace`.
- Categorias (linhas FLEX): barra por categoria com preenchimento = gasto e **marcador do dia** em `plannedCents × dayIndex / daysInCycle` (posição relativa ao planejado da categoria); estado `OK`/`WARN`/`OVER` por token (`--fc-in`/`--fc-pend`/`--fc-out`).
- Watchlists: lista de categorias vigiadas com limite próprio e percentual; adicionar/remover.
- "Quanto custa a sua vida": `monthlyCents`, `perDayCents` e `monthsCovered` ("sua reserva cobre 2,0 meses").

### Seção Metas
Cards por tipo (Reserva, Prioridade em ordem, Desejo, Quitação) com barra de progresso, restante, "R$ X por mês até a data" (`monthlyNeededCents`) e ETA; ações: criar, aportar, editar, arquivar, reordenar prioridades, converter desejo em compra (F3-07).

## Regras de negócio
- RN-01: a tela não recalcula engines; só formata e usa as três funções puras acima (alocação, custo de vida, posição de marcador).
- RN-02: valores em centavos, formatados em reais; datas em UTC.
- RN-03: marcador do dia = `valor × dayIndex / daysInCycle`, truncado a 1 casa decimal de percentual, nunca fora de 0 a 100% da barra.
- RN-04: renda do ciclo é a prevista pela regra MEI (base + adicional × dias presenciais pelo calendário e feriados) até que o recebimento real seja confirmado; depois mostra o recebido.
- RN-05: alocação usa FIXED (séries), parcelas do ciclo, DAS, provisão de não mensais e o Flex; "reserva" é o restante e pode ser negativo (excesso).
- RN-06: dívidas ordenadas por taxa mensal decrescente; empate desempata por saldo.
- RN-07: dia 29/30/31 em recorrência cai no último dia do mês curto (comportamento da F3-01), com dica na UI.
- RN-08: só tokens `--fc-*`; nenhuma cor literal; alvos de toque de no mínimo 44 px.
- RN-09: toda leitura/escrita filtra por `userId`; mutações via use-cases (ADR-025).
- RN-10: exemplos e fixtures fictícios.

## Critérios de aceitação
- [ ] CA-01: `/planejar` renderiza em 390x844 sem rolagem horizontal, com controle segmentado de 4 seções e TabBar fixa com "Planejar" ativa.
- [ ] CA-02: "Renda do ciclo" mostra base, dias presenciais × adicional e total conforme a regra de F1-06; "DAS" e teto anual aparecem.
- [ ] CA-03: a barra de alocação soma 100% da renda sem excesso e mostra "falta R$ X" com o trecho em `--fc-out` quando há excesso (casos de teste abaixo).
- [ ] CA-04: dívidas ordenadas por taxa decrescente com custo mensal e data de quitação.
- [ ] CA-05: o Flex mostra a barra geral e as barras por categoria com o marcador do dia na posição correta.
- [ ] CA-06: "Quanto custa a sua vida" mostra custo mensal, por dia e meses cobertos pela reserva.
- [ ] CA-07: criar/editar uma recorrência pela sheet gera a série (RRULE correto, inclusive "último dia") e as PLANNED aparecem após `materializeSeries`.
- [ ] CA-08: criar meta, aportar e ver o progresso; converter um desejo em compra.
- [ ] CA-09: editar o valor do Flex persiste e atualiza barras e a tela Hoje.
- [ ] CA-10: nenhuma cor literal nos arquivos novos; contraste de texto verificado (4,5:1).
- [ ] CA-11: `npm run lint`, `npm test`, `npx next build` passam.

## Impacto técnico
### Backend
`src/server/modules/budget/application/get-plan.ts`; `src/server/modules/budget/domain/allocation.ts`, `living-cost.ts` (+ testes); rota fina `src/app/api/plan/route.ts` (GET, opcional) e uso direto do use-case no server component. Mutações reaproveitam rotas de F3-01 (`/api/recurring`), F3-03 (`/api/budget/**`) e F3-07 (`/api/goals/**`).
### Frontend
- `src/app/(app)/planejar/page.tsx`, `loading.tsx`, `planejar-client.tsx`.
- `src/components/fc/planejar/`: `section-switcher.tsx`, `income-card.tsx`, `allocation-bar.tsx`, `recurring-list.tsx`, `recurring-sheet.tsx`, `debt-list.tsx`, `flex-overview.tsx`, `flex-category-bar.tsx` (com marcador), `watchlist.tsx`, `living-cost-card.tsx`, `goal-card.tsx`, `goal-sheet.tsx`, `marker-position.ts` (+ teste).
- Remover `src/app/(app)/recurring/`, `goals/`, `wishlist/` do 1.x se a F0-01/F3-07 não removeram.
### Banco de dados
Nenhum novo.
### Integrações
Nenhuma.
### Segurança
`requireAuth`; Zod nos formulários; `userId` em tudo.

## Plano de implementação
- [ ] Etapa 1: confirmar contratos de F1-05, F1-06, F3-01, F3-03 e F3-07; registrar lacunas em Divergências.
- [ ] Etapa 2: `allocation.ts`, `living-cost.ts`, `marker-position.ts` e testes.
- [ ] Etapa 3: `get-plan.ts` e fixtures sintéticas em `tests/fixtures/plan/`.
- [ ] Etapa 4: seção Ciclo (`income-card`, `allocation-bar`).
- [ ] Etapa 5: "Fixas e assinaturas" (`recurring-list`, `recurring-sheet`).
- [ ] Etapa 6: seção Dívidas.
- [ ] Etapa 7: seção Flex (barras, marcador, watchlists, custo de vida, edição do flex).
- [ ] Etapa 8: seção Metas.
- [ ] Etapa 9: estados vazios, esqueleto, remoção de telas antigas; docs (`docs/ui/planejar.md`) e `.agents/context/CONTEXT.md`.

## Estratégia de testes
- [ ] Unitários, `computeAllocation`: renda 600000, fixas 250000, parcelas 80000, DAS 8000, não mensais 15000, flex 150000: soma 503000, `reserve = 97000`, `shortfall = 0`, `overflow = false`, percentuais 41,7%, 13,3%, 1,3%, 2,5%, 25,0%, 16,2% (somam 100,0%). Excesso: renda 300000 com compromissos 350000: `reserve = −50000`, `shortfall = 50000`, `overflow = true`. Renda zero: sem divisão por zero (`pct = 0`, `overflow` verdadeiro se houver compromissos).
- [ ] Unitários, `computeLivingCost`: fixas 250000, parcelas 80000, DAS 8000, não mensais 15000, flex médio 120000: `monthly = 473000`, ciclo de 30 dias `perDay = 15766`; reserva 946000: `monthsCovered = 2,0`; mensal zero: `monthsCovered = null`.
- [ ] Unitários, `marker-position`: flex 90000, ciclo de 30 dias, dia 10: marcador em 33,3% da barra geral; categoria com `planned = 30000`: marcador em 10000 de 30000 (33,3%) e preenchimento de 15000 = 50%; `dayIndex > daysInCycle` limita em 100%.
- [ ] Unitários, renda: base 300000 e 10 dias presenciais × 15000 = 450000 (exibição de `incomeCents` de F1-06); mês sem dias presenciais mostra só a base.
- [ ] Unitários, ordem de dívidas: taxas fictícias rotativo 12,0%, cheque especial 8,0%, Pix no crédito 6,0%, consignado 2,0%: ordem decrescente; custo mensal de saldo 100000 a 8,0% = 8000; empate de taxa desempata por saldo.
- [ ] Componentes (jsdom): `allocation-bar` com excesso mostra o trecho `--fc-out` e o texto "falta R$ 500,00"; `recurring-sheet` com "dia 31" mostra a dica e envia `rrule` com `BYMONTHDAY=28,29,30,31;BYSETPOS=-1`; "último dia" envia `BYMONTHDAY=-1`.
- [ ] Integração: `get-plan` com repositórios simulados compõe tudo e isola por `userId`; criar série pela rota e conferir PLANNED.
- [ ] E2E: opcional (Playwright): criar recorrência e meta.
- [ ] Manual (iPhone 13 Pro): trocar de seção, editar flex, criar recorrência, aportar em meta.

Edge cases: renda ainda não configurada (CTA para configurar em Mais); nenhuma dívida (estado vazio positivo); flex zero (marcador oculto, convite para definir); ciclo de 31 dias; muitas séries (lista com busca simples); meta sem `targetDate`; dívida quitada (some da lista, vai para histórico).

## Riscos e rollback
- Risco: tela longa demais. Mitigação: controle segmentado com 4 seções e lazy render das seções fora de vista.
- Risco: divergência de números entre Planejar e Hoje. Mitigação: ambos leem `getFlex`/`getAvailable`; RN-01.
- Risco: dependência de 5 módulos. Mitigação: etapa 1 valida os contratos e usa fixtures de teste enquanto algum não estiver integrado.
- Rollback: rota nova isolada; reverter o commit não afeta dados.

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

---
id: FC2-F6-03
title: Relatórios (fluxo, categorias, Must/Need/Want, juros pagos)
status: backlog
type: feature
phase: F6
wave: 1
owner: telas-produto
depends_on: [FC2-F3-02]
created_at: 2026-10-05
updated_at: 2026-10-05
affected_modules: [reports, app-mais, components-fc]
related_use_cases: []
related_adrs: [ADR-017, ADR-018, ADR-019, ADR-022, ADR-028]
---

# FC2-F6-03 — Relatórios (fluxo, categorias, Must/Need/Want, juros pagos)

## Contexto
Relatórios ficam em "Mais" (spec §4, árvore de informação) e substituem o dashboard arrastável do 1.x (spec §9: "vira relatório opcional"). Quatro visões: **fluxo** (entradas versus saídas por período), **categorias** (para onde foi o consumo), **Must/Need/Want** (natureza do gasto) e **juros pagos** (custo das dívidas, ADR-028). Ficam na F6 porque dependem de dados acumulados e do ciclo configurável (F3-02 estende `src/server/modules/budget/domain/cycle.ts`).

## Problema
No 1.x os gráficos são widgets do dashboard (`src/app/(app)/dashboard/widgets/category-donut-widget.tsx`, `income-expenses-widget.tsx`) alimentados por `src/app/api/analytics/summary/route.ts` e `src/server/modules/finance/application/analytics/monthly-summary.ts`. Esse resumo soma só `INCOME` e `EXPENSE` do mês calendário e ignora transferências (spec §1: "Saldo errado"); não separa consumo de caixa, não conhece natureza nem juros, usa Recharts (`package.json` do 1.x) com cores do tema antigo e não funciona bem em 390 px.

## Objetivo
Entregar `src/app/(app)/mais/relatorios/page.tsx` com seletor de período (ciclo atual, ciclo anterior, últimos 3 ciclos, últimos 6 ciclos, últimos 12 meses) e 4 relatórios:
1. **Fluxo de caixa**: entradas e saídas por ciclo/mês e o resultado; visão de caixa.
2. **Categorias**: consumo por categoria (visão de consumo), top categorias e variação contra o período anterior.
3. **Must/Need/Want**: distribuição do consumo por natureza.
4. **Juros pagos**: total de juros e tarifas no período, por origem (cheque especial, rotativo, empréstimo, tarifas/IOF) e tendência.

## Fora de escopo
- Score e insights do 1.x (`src/server/modules/finance/application/score`, `insights`): reavaliação própria, não bloqueia.
- Exportação CSV/PDF e relatórios por e-mail.
- Previsão (é a engine Disponível).
- Comparação entre usuários ou orçamentos por envelope.

## Comportamento atual
Ver Problema. Reaproveitamento: apenas a ideia de período/observação de `analytics/period.ts` (1.x, referência de janela mensal e do mês anterior); o código novo usa `getCycleBounds`/`resolveCycle` de `budget/domain/cycle.ts`.

## Comportamento esperado

### Duas visões de dinheiro (regra central)
- **Caixa** (Fluxo): considera movimentos que mexem em saldo de contas de caixa por **data de caixa**: entradas (`INCOME`, inclusive estornos em conta) e saídas (`EXPENSE` em conta de caixa, `CARD_PAYMENT`, `FEE`, `INTEREST`). Compras de cartão **não** entram (entram quando a fatura é paga, via `CARD_PAYMENT`). `TRANSFER` entre contas do usuário nunca entra. Somente status CLEARED e RECONCILED.
- **Consumo** (Categorias, Must/Need/Want): considera `EXPENSE` por **data da compra** (inclusive no cartão, parcelas pelo mês da parcela), exclui `CARD_PAYMENT`, `TRANSFER`, `INTEREST`, `FEE`, `ADJUSTMENT` e `excludeFromBudget`; estornos reduzem. Juros e tarifas ficam no relatório próprio.

### Módulo `reports` (`src/server/modules/reports/`)
Funções puras em `domain/` (entrada: transações já carregadas e janelas; saída: DTOs):
- `cashflow.ts`: `buildCashflow(txs, buckets)`: por bucket (ciclo ou mês) devolve `{ bucketStart, bucketEnd, inCents, outCents, netCents }` e acumulado.
- `by-category.ts`: `buildCategoryReport(txs, prevTxs, categories)`: top 9 categorias e um grupo "Outros" (a décima cor `--fc-cat-10`), `pct` do total, `deltaPct` contra o período anterior, mais "Sem categoria".
- `nature-split.ts`: `buildNatureSplit(txs)`: MUST, NEED, WANT e "Sem natureza"; natureza do merchant (F2-02) tem precedência sobre a da categoria (F1-07).
- `interest-paid.ts`: `buildInterestReport(txs, buckets)`: soma `INTEREST` e `FEE` por origem (`OVERDRAFT`, `CARD_REVOLVING`, `LOAN`, `FEES`) e por bucket, total e variação.
Use-cases em `application/` (`get-cashflow.ts`, `get-category-report.ts`, `get-nature-split.ts`, `get-interest-report.ts`) com consultas agregadas por `userId`, e rotas finas `src/app/api/reports/cashflow/route.ts`, `categories/route.ts`, `nature/route.ts`, `interest/route.ts` (query `period`).

### Tela (390x844)
```text
Relatórios                      [Período v: Ciclo atual]
[ Fluxo | Categorias | M/N/W | Juros ]
Fluxo      barras agrupadas (entradas --fc-in, saídas --fc-text-2) por ciclo; linha do saldo líquido
           resumo: "Entrou R$ X · Saiu R$ Y · Resultado R$ Z"
Categorias barra horizontal ordenada, cor --fc-cat-N, valor, %, variação vs anterior (seta e %)
M/N/W      barra empilhada única e 3 cartões (Must, Need, Want) com valor e %
Juros      total no período em --fc-out, barras por mês, lista por origem (cheque especial, rotativo, empréstimo, tarifas)
```
Gráficos como componentes SVG inline em `src/components/fc/charts/` (barras agrupadas, barra horizontal, barra empilhada, linha), sem biblioteca, só tokens (`--fc-in`, `--fc-out`, `--fc-text-2`, `--fc-cat-1` a `--fc-cat-10`, `--fc-info`, `--fc-debt`, `--fc-pend`). Cada gráfico tem tabela equivalente oculta visualmente (acessibilidade) e respeita o modo privacidade (F6-02): valores via `Money`, rótulos de eixo ocultos quando ativado. Toque em uma barra mostra tooltip.

### Cores e rótulos
Categorias usam `--fc-cat-1..10` na ordem do ranking, com o nome sempre escrito ao lado (a cor não é a única pista). Natureza: Must `--fc-cat-8`, Need `--fc-cat-6`, Want `--fc-cat-5`, Sem natureza `--fc-cat-10`. Juros em `--fc-out` e origens em `--fc-debt`, `--fc-pend`, `--fc-info`.

## Regras de negócio
- RN-01: centavos inteiros; datas por ciclo (`resolveCycle`, F3-02) ou mês; conversões em UTC.
- RN-02: caixa e consumo seguem as duas visões acima e nunca se misturam no mesmo gráfico; cada relatório informa qual visão usa ("visão de caixa" ou "visão de consumo").
- RN-03: transferências entre contas do usuário nunca aparecem em nenhum relatório (efeito nulo).
- RN-04: estornos reduzem o consumo da categoria; estorno em cartão não é entrada de caixa.
- RN-05: parcelas contam pelo mês/ciclo da parcela, no consumo (compra parcelada de R$ 1.200,00 em 12x consome R$ 100,00 por mês).
- RN-06: top 9 categorias mais "Outros"; "Sem categoria" é grupo próprio e aparece sempre que existir.
- RN-07: natureza do merchant prevalece sobre a da categoria; sem nenhuma, "Sem natureza".
- RN-08: juros pagos = `INTEREST` mais `FEE` com status CLEARED/RECONCILED; juros ainda não pagos (previstos) não entram.
- RN-09: variação contra o período anterior de mesmo tamanho; denominador zero devolve `null` (a UI mostra "novo").
- RN-10: tudo filtra por `userId`; exemplos e fixtures fictícios.
- RN-11: só tokens `--fc-*`; alvos de toque de no mínimo 44 px.

## Critérios de aceitação
- [ ] CA-01: as 4 funções puras passam os casos de teste abaixo.
- [ ] CA-02: o Fluxo exclui compras de cartão e transferências e inclui `CARD_PAYMENT`; o resultado do período confere com a soma manual do fixture.
- [ ] CA-03: Categorias soma exatamente o consumo do período; parcelas pelo mês da parcela; top 9 mais "Outros".
- [ ] CA-04: Must/Need/Want soma 100% do consumo, com precedência do merchant.
- [ ] CA-05: Juros pagos soma `INTEREST` e `FEE` e separa por origem e por mês.
- [ ] CA-06: seletor de período (5 opções) funciona e respeita o ciclo configurado (calendário ou renda).
- [ ] CA-07: cada gráfico tem alternativa tabular acessível e usa só tokens (verificação por busca de cores literais).
- [ ] CA-08: modo privacidade oculta valores e rótulos numéricos dos gráficos.
- [ ] CA-09: respostas das 4 rotas em menos de 500 ms com 12 meses e 5.000 transações sintéticas.
- [ ] CA-10: `npm run lint`, `npm test`, `npx next build` passam.

## Impacto técnico
### Backend
`src/server/modules/reports/domain/{cashflow,by-category,nature-split,interest-paid}.ts` (+ testes), `application/*.ts`, `infra/reports-repository.ts` (agregações com `groupBy`/consultas por janela), `http/schemas.ts` (query `period` com Zod), rotas finas `src/app/api/reports/**`.
### Frontend
`src/app/(app)/mais/relatorios/page.tsx`, `relatorios-client.tsx`; `src/components/fc/charts/`: `grouped-bars.tsx`, `horizontal-bars.tsx`, `stacked-bar.tsx`, `line-chart.tsx`, `chart-scale.ts` (reutiliza o da F3-04), `chart-table.tsx` (tabela acessível), `period-select.tsx`. Remover Recharts do `package.json` se nenhum código 2.0 o usa.
### Banco de dados
Sem tabelas novas. Índices recomendados: `Transaction @@index([userId, date])` e `@@index([userId, kind, status, date])`; migration aditiva se faltarem.
### Integrações
Nenhuma.
### Segurança
`requireAuth`; `userId` em toda consulta; `period` validado por Zod (lista fechada).

## Plano de implementação
- [ ] Etapa 1: contratos DTO e funções puras com testes (os 4 relatórios).
- [ ] Etapa 2: repositório e use-cases; fixtures sintéticas em `tests/fixtures/reports/`.
- [ ] Etapa 3: rotas finas e schemas.
- [ ] Etapa 4: componentes de gráfico SVG e tabela acessível.
- [ ] Etapa 5: página, seletor de período e 4 abas.
- [ ] Etapa 6: integração com privacidade (`Money`) e checagem de contraste das cores categóricas sobre `--fc-ink`.
- [ ] Etapa 7: remover widgets e rotas de analytics antigos que sobrarem; docs (`docs/ui/relatorios.md`) e `.agents/context/CONTEXT.md`.

## Estratégia de testes
Fixture comum: ciclo de renda de 2026-09-05 a 2026-10-04 (30 dias); valores fictícios.
- [ ] Unitários, Fluxo: entradas R$ 4.500,00 (450000) e R$ 100,00 (10000); saídas em conta R$ 800,00 (80000); `CARD_PAYMENT` R$ 1.200,00 (120000); compra de cartão R$ 300,00 (30000, não entra); transferência R$ 500,00 (não entra). Esperado: `in = 460000`, `out = 200000`, `net = 260000`.
- [ ] Unitários, Categorias (consumo): Mercado 60000, Delivery 40000, Transporte 20000 e estorno de Delivery de 5000 (negativo); compra de cartão de R$ 1.200,00 em 12x com parcela de 10000 no ciclo (categoria Lazer): Lazer 10000. `CARD_PAYMENT`, transferência e juros ficam fora. Total = 60000 + 35000 + 20000 + 10000 = 125000; percentuais 48,0%, 28,0%, 16,0%, 8,0%. Com 12 categorias: 9 mais "Outros" com a soma das três menores.
- [ ] Unitários, variação: período anterior com Mercado 50000 e atual 60000: `deltaPct = +20,0`; anterior zero: `null`.
- [ ] Unitários, Must/Need/Want: Mercado (Need, via categoria) 60000; merchant "streaming" com natureza WANT sobrepondo a categoria "Assinaturas" (Need) 5000; sem natureza 10000: Need 60000, Want 5000, Sem natureza 10000, soma 75000 (80,0%, 6,7%, 13,3%).
- [ ] Unitários, Juros: `INTEREST` de cheque especial 3000 e 2500 (dois meses), `INTEREST` de rotativo 4000, `FEE` 1500 (IOF), PLANNED de juros 9000 (não entra): total 11000; por origem cheque 5500, rotativo 4000, tarifas 1500; variação contra o período anterior de 8000: `+37,5%`.
- [ ] Unitários, parcelas: 12x de R$ 1.200,00 aparece 10000 por mês, em 12 meses seguidos; cancelamento/estorno parcial reduz.
- [ ] Unitários, bordas: período sem transações (zeros e estados vazios); ciclo de 31 dias; transação exatamente na fronteira (último dia do ciclo entra, primeiro dia do próximo não).
- [ ] Integração: rotas com repositório simulado e 5.000 transações sintéticas (desempenho); isolamento por `userId`; `period` inválido retorna 400.
- [ ] Componentes (jsdom): gráficos renderizam a tabela acessível com os mesmos números; privacidade oculta valores; sem cores literais nos estilos.
- [ ] E2E: opcional.
- [ ] Manual (iPhone 13 Pro): legibilidade em 390 px, toque nas barras, troca de período, modo privacidade.

Edge cases: um único bucket; ciclos de renda com `payDay` 31; categoria sem nome ou arquivada; valor de R$ 1.000.000,00 sem estourar rótulos (abreviar com `compact`); muitos buckets (12) com rolagem horizontal do gráfico e rótulos alternados.

## Riscos e rollback
- Risco: confundir caixa e consumo. Mitigação: RN-02 e rótulo "visão de caixa/consumo" em cada relatório.
- Risco: consultas lentas. Mitigação: índices, janelas por período e agregação no banco; teste de desempenho.
- Risco: cores categóricas com contraste ruim. Mitigação: nome ao lado e auditoria da F6-04.
- Rollback: rota e módulo novos; reverter o commit não afeta dados.

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

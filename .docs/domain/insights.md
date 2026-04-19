# Insights

## Status

- [ ] Draft
- [ ] In Review
- [x] Approved

## Purpose

Formalizar o dominio de insights automaticos do Finance Controller, explicando o que e um insight, quais severidades e tipos o produto reconhece, como funcionam `fingerprint`, `dismiss` e persistencia, e quais sao os limites operacionais do feed.

## Scope

Este documento cobre:

- o agregado `InsightSnapshot`
- os tipos `InsightCandidate` e `InsightRecord`
- severidades, escopos e CTA dos insights
- o pipeline de metricas que alimenta o engine
- a ordem real de execucao das heuristicas MVP
- thresholds, prioridades e fingerprints das regras atuais
- regras de dedupe e limite por periodo
- diferenca entre leitura on-demand e snapshot persistido
- comportamento de `dismiss` e de remocao de insights obsoletos
- trade-offs e limites tecnicos do engine atual

Este documento nao cobre criacao de novas heuristicas, alteracao de severidade/prioridade ou mudancas de contrato HTTP alem do comportamento ja implementado.

## Sources of Truth

- Spec:
  - [Docs - Domain Insights](../future-features/09-docs-domain-insights.md)
  - [Docs - Logic Insights Engine](../future-features/12-docs-logic-insights-engine.md)
- Task:
  - [Phase 17 - Domain Docs: Insights](../tasks/phase-17-domain-insights.md)
  - [Phase 20 - Logic Docs: Insights Engine](../tasks/phase-20-logic-insights-engine.md)
- ADRs: [ADR-013 Automatic Insights](../decisions/ADR-013-automatic-insights.md)
- Code:
  - `prisma/schema.prisma`
  - `src/server/modules/finance/application/insights/types.ts`
  - `src/server/modules/finance/application/insights/build-metrics.ts`
  - `src/server/modules/finance/application/insights/rules.ts`
  - `src/server/modules/finance/application/insights/use-cases.ts`
- APIs:
  - `src/app/api/analytics/insights/route.ts`
  - `src/app/api/analytics/insights/recalculate/route.ts`
  - `src/app/api/analytics/insights/[id]/dismiss/route.ts`

## Business Context

O modulo de insights existe para transformar sinais dispersos do sistema em observacoes acionaveis e priorizadas. Em vez de obrigar o usuario a interpretar sozinho categorias, forecast, metas e cartoes, o produto passa a responder:

- existe algum comportamento anormal no mes?
- qual problema merece atencao primeiro?
- que acao imediata faz sentido tomar?

O valor do dominio vem de tres caracteristicas:

- determinismo: os insights nascem de regras explicitas, nao de texto gerado sem rastreabilidade
- priorizacao: o feed e limitado e ordenado para evitar ruido
- persistencia: dismiss e identidade do insight sobrevivem a recalculos quando o insight continua valido

## Core Concepts

| Concept           | Description                                                    | Notes                                              |
| ----------------- | -------------------------------------------------------------- | -------------------------------------------------- |
| Insight           | Observacao automatica sobre um sinal relevante do periodo      | Sempre nasce de regra deterministica               |
| Insight candidate | Insight ainda em nivel de calculo antes da persistencia        | Nao carrega necessariamente `id` persistido        |
| Insight record    | Insight com identidade persistida e metadados de ciclo de vida | Inclui `id`, `isDismissed`, datas e `createdAt`    |
| Fingerprint       | Identidade logica do insight dentro do periodo                 | Base do dedupe e do upsert                         |
| Severity          | Nivel qualitativo de urgencia                                  | `INFO`, `WARNING`, `CRITICAL`                      |
| Scope             | Recorte de contexto que o insight representa                   | Ex.: categoria, meta, forecast, statement          |
| CTA               | Acao sugerida pelo insight                                     | Opcional, mas faz parte do valor acionavel do feed |
| Dismiss           | Decisao do usuario de dispensar um insight persistido          | Precisa de snapshot com `id`                       |

## Types and Entities

| Item               | Kind             | Description                                                    | Notes                                                                              |
| ------------------ | ---------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `InsightSnapshot`  | Prisma model     | Snapshot persistido de insight por usuario/periodo/fingerprint | `@@unique([userId, periodStart, fingerprint])`                                     |
| `InsightSeverity`  | Enum             | Severidade do insight                                          | `INFO`, `WARNING`, `CRITICAL`                                                      |
| `InsightCandidate` | Application type | Insight calculado pelo engine antes da persistencia            | Contem `key`, `body`, `payload`, `cta`, `fingerprint`, `priority`                  |
| `InsightRecord`    | Application type | Insight retornado com estado persistido                        | Estende candidato com `id`, `isDismissed`, `periodStart`, `periodEnd`, `createdAt` |
| `InsightScopeType` | Union type       | Tipo de escopo do insight                                      | `global`, `category`, `account`, `goal`, `forecast`, `statement`                   |
| `InsightCta`       | Application type | Acao sugerida pelo insight                                     | `label`, `action`, `href?`                                                         |
| `InsightCtaAction` | Union type       | Acao canonica do CTA                                           | `open-category`, `open-goals`, `open-forecast`, `open-credit-card`                 |

## States

| State                 | Meaning                                                 | Entry Condition                         | Exit Condition                                                                                              |
| --------------------- | ------------------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `INFO`                | Insight informativo, com baixa urgencia                 | Regra relevante sem criticidade alta    | Pode subir para `WARNING`/`CRITICAL` se o sinal piorar em recalculos futuros                                |
| `WARNING`             | Insight que requer atencao do usuario                   | Regra ativa com risco moderado          | Pode cair para `INFO`, subir para `CRITICAL` ou desaparecer se o sinal deixar de existir                    |
| `CRITICAL`            | Insight que representa risco forte ou problema imediato | Regra ativa com impacto alto            | Pode reduzir de severidade, desaparecer ou permanecer dismissado se o sinal continuar                       |
| `isDismissed = false` | Insight visivel no feed                                 | Insight persistido ainda nao dispensado | Pode virar `true` por acao do usuario                                                                       |
| `isDismissed = true`  | Insight dispensado pelo usuario                         | `PATCH dismiss` em snapshot persistido  | Pode continuar persistido enquanto o fingerprint existir; deixa de aparecer em leituras que filtram dismiss |

## Business Rules

1. Insights sao deterministas e nascem de regras explicitas do engine, nunca de texto gerado livremente.
2. O modulo opera sempre no contexto de um unico `userId`.
3. O feed atual trabalha com um conjunto MVP de regras sobre categorias, metas, forecast e cartoes.
4. Cada insight precisa ter `key`, `severity`, `scopeType`, `payload`, `fingerprint` e `priority`.
5. O `fingerprint` define a identidade logica do insight no periodo e e a base para dedupe e persistencia.
6. O mesmo fingerprint nao deve gerar dois insights distintos no mesmo periodo; em conflito, prevalece o de maior prioridade.
7. O feed e rigidamente limitado a no maximo `8` insights por periodo apos dedupe e ordenacao.
8. `dismiss` so faz sentido para insights persistidos; por isso o dashboard usa snapshots persistidos no carregamento.
9. Leituras on-demand podem identificar insights validos mesmo sem snapshot; nesses casos o insight pode nao ter `id` persistido.
10. Ao recalcular snapshots, insights obsoletos nao dispensados sao removidos do banco; insights obsoletos ja dispensados nao entram nesse delete.
11. Quando um insight recalculado ja existia, o modulo preserva o estado de `isDismissed` e reutiliza o mesmo snapshot via upsert.
12. O feed exposto ao usuario final filtra insights dismissados antes de renderizar.

## Formulas and Calculations

| Name              | Formula or Logic                                                          | Inputs                               | Output                       | Notes                                                        |
| ----------------- | ------------------------------------------------------------------------- | ------------------------------------ | ---------------------------- | ------------------------------------------------------------ | ----------------------------------- |
| Fingerprint       | `parts.map(nullish => "~").join("                                         | ")`                                  | Identidade logica do insight | `fingerprint`                                                | Permite dedupe e upsert consistente |
| Rule pipeline     | `buildInsightMetrics -> runInsightRules -> dedupeInsights -> slice(0, 8)` | `userId`, periodo, estado financeiro | Lista final de candidatos    | Base comum de `listInsights` e `refreshInsightSnapshots`     |
| Dedupe            | Mantem o insight de maior prioridade por fingerprint                      | Lista de candidatos                  | Lista unica por fingerprint  | Empates preservam o primeiro emitido                         |
| Feed cap          | Corte rigido apos dedupe                                                  | Lista ordenada                       | Maximo de `8` insights       | Controle anti-ruido do dominio                               |
| Persisted refresh | Upsert de candidatos do periodo + limpeza seletiva de obsoletos           | Candidatos, snapshots existentes     | `InsightRecord[]`            | Preserva `isDismissed` e nao remove obsoletos ja dismissados |
| Visible feed      | Filtragem de insights dismissados                                         | Insights calculados ou persistidos   | Lista mostrada ao usuario    | `GET` remove dismissados e converte `id` vazio em `null`     |

## Metric Pipeline

| Input                        | Source                                       | Filter                                                                | Used For                             | Notes                                                                             |
| ---------------------------- | -------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------- |
| Current period transactions  | `prisma.transaction.findMany`                | `userId`, `type in (INCOME, EXPENSE)`, `date` dentro do periodo atual | Totais e categorias do mes           | `TRANSFER` fica fora desde a query                                                |
| Previous period transactions | `prisma.transaction.findMany`                | `userId`, `type in (INCOME, EXPENSE)`, `date` dentro do mes anterior  | Comparacao mensal                    | Alimenta deltas por categoria e totais comparativos                               |
| Expense categories           | `prisma.category.findMany`                   | `userId`, `type = EXPENSE`                                            | Nomear categorias no breakdown       | Categoria ausente vira `Sem categoria`                                            |
| Credit cards                 | `prisma.account.findMany`                    | `userId`, `type = CREDIT_CARD`, `isArchived = false`                  | Statements abertos e limite agregado | Cada cartao carrega so o primeiro statement nao pago com `dueDate >= periodStart` |
| Forecast                     | `calculateForecast(userId, monthParam, now)` | Mesmo periodo da consulta                                             | Regra `forecast_negative`            | Reaproveita integralmente o motor de forecast                                     |
| Goals progress               | `listGoalsWithProgress(userId, monthParam)`  | Goals ativos do usuario                                               | Regra `goal_at_risk`                 | Falha faz fallback para lista vazia                                               |

Metricas derivadas importantes:

- `expensesByCategory` nasce da uniao de categorias com gasto no periodo atual ou anterior.
- Cada `CategoryMetric` guarda `current`, `previous`, `deltaPercent`, `deltaAbsolute` e `sharePercent`.
- `expensesByCategory` e ordenado por `current` desc antes das regras, o que afeta a regra de concentracao.
- `openStatements` guarda apenas statements com saldo em aberto e calcula `daysUntilDue` e `utilizationPercent`.
- `totalCreditOutstanding` soma apenas statements com `dueDate <= periodEnd`, mesmo que `openStatements` contenha o primeiro vencimento futuro do cartao alem do fim do mes.
- `totalIncome`, `previousTotalIncome`, `totalExpenses` e `previousTotalExpenses` existem no payload de metricas, embora nem todos sejam usados pelas regras atuais.

## Engine Execution Sequence

1. `runInsights` chama `buildInsightMetrics` para resolver periodo e coletar sinais brutos em paralelo.
2. `runInsightRules` percorre `INSIGHT_RULES` na ordem fixa do arquivo `rules.ts`.
3. `dedupeInsights` colapsa fingerprints repetidos mantendo o candidato de maior `priority`.
4. A lista dedupada e ordenada por `priority` desc e sofre corte rigido em `8` itens.
5. `listInsights` reconcilia os candidatos com snapshots existentes sem persistir nada.
6. `refreshInsightSnapshots` usa a mesma lista final, persiste os candidatos e reconcilia dismiss/remocao de obsoletos.

### Rule Order

A ordem atual de execucao das heuristicas e:

1. `detectCategorySpikes`
2. `detectCategoryConcentration`
3. `detectGoalAtRisk`
4. `detectForecastNegative`
5. `detectStatementDueSoon`
6. `detectCreditUtilizationHigh`

Como o dedupe preserva o primeiro item quando duas entradas tem o mesmo fingerprint e a mesma prioridade, a ordem das regras e parte do comportamento observavel do engine.

## Heuristic Rules

| Rule                      | Trigger                                                                                    | Severity                                            | Priority     | Fingerprint              | Notes          |
| ------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------- | ------------ | ------------------------ | -------------- | -------------------------------------------------------- |
| `category_spike`          | `previous > 0`, `deltaAbsolute >= 10_000`, `deltaPercent >= 20`, `categoryId != null`      | `CRITICAL` se `deltaPercent >= 50`, senao `WARNING` | `70` ou `50` | `category_spike          | <categoryId>`  | Ignora categorias novas sem baseline e `Sem categoria`   |
| `category_concentration`  | `totalExpenses >= 50_000`, categoria lider com `sharePercent >= 40` e `categoryId != null` | `CRITICAL` se `sharePercent >= 60`, senao `WARNING` | `60`         | `category_concentration  | <categoryId>`  | Avalia apenas `expensesByCategory[0]`                    |
| `goal_at_risk`            | Goal com status `AT_RISK` ou `EXCEEDED`                                                    | `CRITICAL` para `EXCEEDED`, senao `WARNING`         | `80` ou `55` | `goal_at_risk            | <goalId>`      | O texto muda para metas de limite vs metas de acumulacao |
| `forecast_negative`       | `forecast.predictedBalance < 0`                                                            | `CRITICAL`                                          | `90`         | `forecast_negative       | ~`             | Gera no maximo um insight global por periodo             |
| `statement_overdue`       | Statement em `openStatements` com `daysUntilDue < 0`                                       | `CRITICAL`                                          | `95`         | `statement_overdue       | <statementId>` | Nasce dentro da mesma regra de vencimento                |
| `statement_due_soon`      | Statement em `openStatements` com `0 <= daysUntilDue <= 7`                                 | `WARNING` se `<= 2`, senao `INFO`                   | `65` ou `40` | `statement_due_soon      | <statementId>` | Usa o mesmo statement base do cartao                     |
| `credit_utilization_high` | `totalCreditLimit > 0` e `totalCreditOutstanding / totalCreditLimit >= 70%`                | `CRITICAL` se `>= 90%`, senao `WARNING`             | `75` ou `55` | `credit_utilization_high | ~`             | Mede uso agregado do limite, nao por cartao              |

### Rule Nuances

#### `category_spike`

- compara apenas gasto atual vs gasto do mes anterior da mesma categoria
- exige threshold percentual e absoluto ao mesmo tempo
- novas categorias com `previous = 0` nao geram spike
- categorias sem `categoryId` tambem nao entram, mesmo que tenham valor relevante

#### `category_concentration`

- so existe quando o total de despesas do mes chega a pelo menos `R$ 500`
- usa apenas a categoria lider apos ordenacao por `current`
- se a categoria lider for `Sem categoria`, a regra retorna vazio e nao avalia a segunda colocada

#### `goal_at_risk`

- reaproveita o status calculado pelo Goal Engine; nao recalcula risco localmente
- metas `EXCEEDED` viram `CRITICAL`
- metas `AT_RISK` viram `WARNING`
- corpo da mensagem diferencia metas de limite (`EXPENSE_LIMIT`, `ACCOUNT_LIMIT`) das demais

#### `forecast_negative`

- depende exclusivamente do `predictedBalance`
- nao usa diretamente `riskLevel` para decidir disparo, embora o inclua em `payload`

#### `statement_due_soon` e `statement_overdue`

- a coleta de metricas traz no maximo um statement por cartao
- o cutoff de regra e `7` dias
- `daysUntilDue < 0` troca a chave para `statement_overdue`
- `daysUntilDue` usa `ceil`, entao um vencimento parcial ainda conta como dia inteiro restante
- como `openStatements` aceita o primeiro statement com `dueDate >= periodStart`, um vencimento logo no inicio do mes seguinte ainda pode gerar alerta se estiver a ate 7 dias de `now`

#### `credit_utilization_high`

- usa `totalCreditOutstanding / totalCreditLimit * 100`
- `totalCreditOutstanding` considera apenas statements com vencimento ate `periodEnd`
- isso significa que a utilizacao alta olha para o que vence dentro do periodo, nao para todo saldo futuro eventualmente aberto

## Fingerprint, Dedupe and Cap

- O helper de fingerprint transforma `null` e `undefined` em `~` antes de concatenar as partes com `|`.
- `dedupeInsights` usa um `Map` por fingerprint.
- Um candidato novo substitui o anterior apenas quando `candidate.priority > existing.priority`.
- Se a prioridade for igual, o primeiro candidato emitido permanece.
- Depois do dedupe, o resultado e ordenado por `priority` desc.
- So entao o cap `MAX_INSIGHTS_PER_PERIOD = 8` e aplicado.

Implicacoes praticas:

- prioridade e o desempate real entre candidatos com o mesmo fingerprint
- severidade sozinha nao define ordenacao; um `WARNING` pode aparecer acima de um `CRITICAL` se tiver `priority` maior
- o motor atual usa prioridades hardcoded por regra, nao uma formula unica derivada de severidade ou magnitude

## Persistence and Dismiss Lifecycle

### `listInsights`

- executa o pipeline completo sem persistir snapshots
- tenta reconciliar cada fingerprint com um snapshot existente do mesmo periodo
- quando nao encontra snapshot, devolve `id = ''`, `isDismissed = false` e `createdAt = new Date()`
- a rota `GET /api/analytics/insights` converte esse `id` vazio para `null` e filtra insights dismissados antes de responder

### `refreshInsightSnapshots`

- executa o mesmo pipeline final de `runInsights`
- busca snapshots existentes por `userId + periodStart`
- remove apenas snapshots obsoletos que nao estejam dismissados
- faz `upsert` por `userId + periodStart + fingerprint`
- preserva `isDismissed` porque o `update` nao altera esse campo
- retorna todos os candidatos persistidos, inclusive os que continuam dismissados

### `dismissInsight`

- so funciona para snapshots persistidos
- valida ownership via `userId`
- retorna erro de dominio `Insight nao encontrado` quando o `id` nao pertence ao usuario ou nao existe

### Dashboard and API Flow

- a pagina `src/app/(app)/dashboard/page.tsx` chama `refreshInsightSnapshots` no carregamento
- o dashboard filtra `isDismissed` depois de persistir, garantindo `id` valido para o fluxo principal de dismiss
- `POST /api/analytics/insights/recalculate` nao filtra dismissados; ele devolve `isDismissed` explicitamente
- `GET /api/analytics/insights` e o endpoint que realmente aplica o filtro de visibilidade

## Invariants

- Todo `InsightSnapshot` pertence a um unico usuario.
- So pode existir um snapshot por `userId`, `periodStart` e `fingerprint`.
- Todo insight do dominio tem severidade valida do enum `INFO`, `WARNING` ou `CRITICAL`.
- Todo insight persistido carrega `payload` estruturado; CTA e opcional.
- `priority` existe para ordenar o feed e resolver conflitos de dedupe.
- O feed final do periodo nunca deve ultrapassar 8 itens.
- O conjunto final sempre e dedupado e ordenado antes da persistencia ou da leitura on-demand.
- Um insight dismissado nao deve reaparecer como "novo" se o mesmo fingerprint continuar valido no mesmo periodo.

## Edge Cases

- Leituras on-demand via `listInsights` podem devolver insights sem `id` persistido; nesses casos o widget nao consegue enviar dismiss ao backend.
- Como o dashboard chama `refreshInsightSnapshots` no carregamento, ele normaliza essa situacao e garante IDs persistidos para o fluxo principal de dismiss.
- Insights com mesmo fingerprint mas textos/prioridades diferentes no mesmo recalculo colapsam em um unico item.
- Se dois candidatos com mesmo fingerprint tiverem a mesma prioridade, o primeiro emitido pelas regras vence.
- Insights obsoletos ja dismissados nao entram no delete seletivo atual; isso preserva historico de dismiss no periodo.
- Um insight pode mudar de severidade entre recalculos e continuar sendo o "mesmo" insight se o fingerprint permanecer igual.
- `category_concentration` pode ficar silencioso se a categoria lider for `Sem categoria`, mesmo que a segunda categoria tenha concentracao alta.
- `statement_overdue` nao olha faturas antigas com `dueDate < periodStart`, porque a coleta de metricas filtra `dueDate >= periodStart`.
- O engine pode alertar vencimento de statement que cai logo apos o fim do mes, desde que seja o primeiro nao pago do cartao e esteja dentro da janela de 7 dias.
- O modulo pode ficar silencioso mesmo com dados existentes, se nenhuma regra atingir os thresholds necessarios.

## Examples

### Example 1 - Insight de meta em risco

- Input:
  - uma meta com status `AT_RISK`
  - `goalId` conhecido
- Expected result:
  - insight com `key = goal_at_risk`
  - `scopeType = goal`
  - fingerprint estavel baseado na meta
  - CTA para abrir `/goals`
- Notes:
  - se a mesma meta continuar em risco no proximo recalculo do mesmo periodo, o insight deve ser atualizado, nao duplicado

### Example 2 - Insight dismissado e recalculado

- Input:
  - insight persistido com `isDismissed = true`
  - regra continua emitindo o mesmo fingerprint
- Expected result:
  - insight continua reconhecido como o mesmo item
  - dismiss permanece preservado
- Notes:
  - isso evita que o feed "ressuscite" o mesmo insight toda vez

### Example 3 - Feed com muitos candidatos

- Input:
  - varias categorias disparando regras
  - metas em risco
  - forecast negativo
  - faturas vencendo
- Expected result:
  - candidatos passam por dedupe
  - ordenacao por prioridade
  - corte final em no maximo 8 insights
- Notes:
  - o dominio privilegia relevancia sobre exaustividade

## Operational Notes

- Multi-tenant considerations:
  - todas as leituras e mutacoes filtram por `userId`
  - dismiss falha se o `insightId` nao pertencer ao usuario
- Snapshot or cache implications:
  - `refreshInsightSnapshots` persiste insights e e o fluxo usado pelo dashboard
  - `listInsights` calcula on-demand e reconcilia, quando possivel, com snapshots existentes do periodo
  - o dashboard persiste primeiro e filtra dismiss depois; o endpoint `GET` so le e filtra
  - `refreshInsightSnapshots` nao usa cache; ele sempre reexecuta coleta, regras e upserts
  - o modulo `insights` ja participa da estrategia de invalidacao da camada analitica
- Failure or fallback behavior:
  - falha em `dismiss` para insight inexistente retorna erro de dominio `Insight nao encontrado`
  - se metas falharem na coleta, o engine trata esse trecho como lista vazia e continua o pipeline
  - ausencia de sinais relevantes nao e erro; apenas resulta em feed vazio

## Trade-offs and Known Limits

- O engine privilegia determinismo e clareza, entao usa thresholds e prioridades fixos em vez de aprender com comportamento do usuario.
- O pipeline carrega algumas metricas ainda nao consumidas por regras atuais, o que facilita expansao futura, mas aumenta um pouco o custo da coleta.
- O feed de statement considera no maximo um statement por cartao, o que pode sub-representar cenarios com multiplas faturas relevantes simultaneas.
- A regra de concentracao olha apenas a categoria lider; ela nao tenta identificar todas as categorias acima do threshold.
- O tratamento de insights obsoletos preserva snapshots dismissados fora do feed ativo, o que ajuda na persistencia de dismiss, mas deixa historico residual no banco por periodo.
- Prioridade e um numero hardcoded por regra, nao uma formula universal; por isso a ordenacao final depende de tuning manual do produto.

## Related Decisions

- ADR: [ADR-013 Automatic Insights](../decisions/ADR-013-automatic-insights.md)

## Open Questions

- Insights dismissados e obsoletos devem continuar persistidos indefinidamente no periodo, ou o produto deve limpar esse historico em algum momento?
- O cap de 8 insights por periodo deve virar configuracao por usuario ou permanecer fixo no produto?
- O produto deve expor historico de insights dismissados/obsoletos no futuro, ou manter apenas o feed visivel do periodo?

# ADR-013: Insights Automaticos — Motor Deterministico de Regras

## Status

Accepted

## Context

Com Goal Engine (ADR-010), Forecast Engine (ADR-011) e Financial Score (ADR-012) entregues, o sistema reune sinais suficientes para gerar observacoes automaticas uteis. A spec em `.docs/future-features/04-automatic-insights.md` definiu o objetivo de um feed determinista e acionavel, mas deixou em aberto:

- Como evitar que o feed vire ruido (muitos insights com baixo valor)
- Como deduplicar mensagens repetidas no mesmo periodo
- Como reutilizar metas, forecast e credit card billing sem duplicar calculo
- Como permitir dismiss sem recriar o mesmo insight na proxima leitura

## Decision

### Modelo

- Novo `InsightSnapshot` com chave unica `(userId, periodStart, fingerprint)`
- Novo enum `InsightSeverity`: `INFO`, `WARNING`, `CRITICAL`
- Campos `payload: Json` e `cta: Json?` guardam contexto estruturado e CTA opcional
- Flag `isDismissed` preservada entre recalculos

### Arquitetura

O modulo vive em `src/server/modules/finance/application/insights/` e e organizado em 4 etapas:

1. `buildInsightMetrics` coleta dados brutos do periodo (totais, categorias comparadas com mes anterior, forecast, metas, cartoes)
2. `runInsightRules` aplica cada regra do array `INSIGHT_RULES` e coleta candidatos
3. `dedupeInsights` remove duplicatas por `fingerprint` e ordena por prioridade
4. `refreshInsightSnapshots` persiste candidatos, remove os obsoletos nao-dispensados e preserva a flag `isDismissed` dos existentes

### Regras do MVP

Todas as regras tem threshold percentual **e** absoluto para evitar alerta por variacao irrelevante:

| Regra                     | Condicao                                                                    |
| ------------------------- | --------------------------------------------------------------------------- |
| `category_spike`          | gasto da categoria cresceu >=20% E >=R$ 100 vs mes anterior                 |
| `category_concentration`  | uma categoria >=40% das despesas E total >=R$ 500                           |
| `goal_at_risk`            | meta com status `AT_RISK` ou `EXCEEDED`                                     |
| `forecast_negative`       | `predictedBalance < 0`                                                      |
| `statement_due_soon`      | fatura aberta com vencimento <=7 dias (ou ja vencida → `statement_overdue`) |
| `credit_utilization_high` | utilizacao total de limite >=70%                                            |

### Fingerprint e dedupe

O fingerprint e `<key>|<scopeId>`. Isso garante que:

- O mesmo category_spike nao duplica no mesmo mes
- Metas distintas geram insights distintos (scopeId = goalId)
- Re-execucoes atualizam o mesmo snapshot em vez de criar um novo

### Regras de limite e qualidade

- `MAX_INSIGHTS_PER_PERIOD = 8` — corte rigido para evitar ruido
- Textos deterministas com templates + `formatCurrency`; sem IA generativa
- `TRANSFER` nao entra nos sinais (ja garantido pelas queries)
- Priority score pondera severidade + magnitude

### Superficie externa

- `GET /api/analytics/insights?month=YYYY-MM` — leitura on-demand (nao persiste)
- `POST /api/analytics/insights/recalculate?month=YYYY-MM` — forca calculo e persiste
- `PATCH /api/analytics/insights/[id]/dismiss` — marca como dispensado
- Widget `insights` no dashboard com badges por severidade, CTA e botao dismiss

### Persistencia no dashboard

A pagina `/dashboard` chama `refreshInsightSnapshots` no carregamento. Isso garante que:

- Insights exibidos tem `id` persistido (pre-requisito para dismiss funcionar)
- Flag `isDismissed` sobrevive entre recalculos
- Insights obsoletos (nao mais emitidos pelas regras) sao removidos do banco, evitando acumulo

### Integracao com ADR-009

- O modulo `insights` ja estava reservado em `ANALYTICS_MUTATION_MODULES` desde a fundacao analitica
- Mutacoes financeiras invalidam tags do modulo automaticamente

## Consequences

- Feed determinista com trilha audit: cada insight tem regra e payload rastreavel
- Dismiss persistente entre recalculos sem recriar o mesmo insight
- Sem dependencia de IA, fila ou cron — tudo on-demand
- `refreshInsightSnapshots` no dashboard tem custo extra de I/O; pode virar cache server-side no futuro
- Thresholds sao defaults razoaveis do MVP; podem virar configuracao por usuario
- Novas regras podem ser adicionadas em `rules.ts` + entrada em `INSIGHT_RULES` sem tocar no pipeline

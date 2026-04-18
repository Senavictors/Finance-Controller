# Analytics API

## Status

- [ ] Draft
- [ ] In Review
- [x] Approved

## Purpose

Formalizar a superficie HTTP analitica do Finance Controller, cobrindo summary, forecast, score e insights com os contratos, parametros, respostas, erros e efeitos colaterais que o backend expoe hoje.

## Scope

Este documento cobre:

- `GET /api/analytics/summary`
- `GET /api/analytics/forecast`
- `POST /api/analytics/forecast/recalculate`
- `GET /api/analytics/score`
- `GET /api/analytics/score/history`
- `GET /api/analytics/insights`
- `POST /api/analytics/insights/recalculate`
- `PATCH /api/analytics/insights/[id]/dismiss`
- parametro `month`, auth, ownership, cache e diferencas entre leitura on-demand e persistencia

Este documento nao cobre a logica profunda dos algoritmos nem rotas nao analiticas.

## Sources of Truth

- Spec: [Docs - API Analytics](../future-features/14-docs-api-analytics.md)
- Task: [Phase 22 - API Docs: Analytics](../tasks/phase-22-api-analytics.md)
- ADRs:
  - [ADR-009 Analytics Snapshot and Invalidation Strategy](../decisions/ADR-009-analytics-snapshot-invalidation.md)
  - [ADR-011 Forecast Engine](../decisions/ADR-011-forecast-engine.md)
  - [ADR-012 Financial Score](../decisions/ADR-012-financial-score.md)
  - [ADR-013 Automatic Insights](../decisions/ADR-013-automatic-insights.md)
- Code:
  - `src/app/api/analytics/summary/route.ts`
  - `src/app/api/analytics/forecast/route.ts`
  - `src/app/api/analytics/forecast/recalculate/route.ts`
  - `src/app/api/analytics/score/route.ts`
  - `src/app/api/analytics/score/history/route.ts`
  - `src/app/api/analytics/insights/route.ts`
  - `src/app/api/analytics/insights/recalculate/route.ts`
  - `src/app/api/analytics/insights/[id]/dismiss/route.ts`
  - `src/server/modules/finance/application/analytics/summary-snapshot.ts`
  - `src/server/modules/finance/application/analytics/monthly-summary.ts`
  - `src/server/modules/finance/application/analytics/period.ts`
  - `src/server/modules/finance/application/forecast/calculate-forecast.ts`
  - `src/server/modules/finance/application/score/calculate-score.ts`
  - `src/server/modules/finance/application/insights/use-cases.ts`

## Module Summary

| Endpoint                               | Method  | Purpose                                     | Auth     | Notes                                      |
| -------------------------------------- | ------- | ------------------------------------------- | -------- | ------------------------------------------ |
| `/api/analytics/summary`               | `GET`   | Ler resumo mensal agregado                  | Required | Usa cache server-side por `userId + month` |
| `/api/analytics/forecast`              | `GET`   | Ler forecast mensal on-demand               | Required | Nao persiste snapshot                      |
| `/api/analytics/forecast/recalculate`  | `POST`  | Recalcular e persistir snapshot de forecast | Required | Retorna resposta resumida                  |
| `/api/analytics/score`                 | `GET`   | Ler score financeiro on-demand              | Required | Nao persiste snapshot                      |
| `/api/analytics/score/history`         | `GET`   | Ler historico persistido de score           | Required | Sem parametro `month`                      |
| `/api/analytics/insights`              | `GET`   | Ler insights visiveis do periodo            | Required | On-demand, filtra dismissados              |
| `/api/analytics/insights/recalculate`  | `POST`  | Recalcular e persistir insights do periodo  | Required | Nao filtra dismissados na resposta         |
| `/api/analytics/insights/[id]/dismiss` | `PATCH` | Dismiss de insight persistido               | Required | Requer `id` real de snapshot               |

## Authentication and Authorization

- Session requirement:
  - todas as rotas chamam `requireAuth()`
  - falha de autenticacao retorna `401 { "error": "Unauthorized" }`
- Roles or ownership rules:
  - nao ha roles; a regra e ownership por `userId`
  - toda leitura e mutacao opera no escopo do usuario autenticado
- Multi-tenant filters:
  - `summary`, `forecast`, `score` e `insights` sempre recebem `userId` do contexto de auth
  - `dismiss` valida que o `id` do insight pertence ao usuario

## Common Rules

- Validation:
  - as rotas de analytics nao usam Zod para query strings
  - o parametro `month` e passado como string crua para os use cases
  - `resolveMonthPeriod()` faz fallback silencioso para o mes atual quando `month` e ausente ou invalido
- Idempotency:
  - `GET` e leitura
  - `POST /forecast/recalculate` e `POST /insights/recalculate` nao tem chave de idempotencia, mas reexecutar com o mesmo estado tende a sobrescrever o mesmo snapshot logico
  - `PATCH /insights/[id]/dismiss` e idempotente na pratica para `isDismissed = true`
- Pagination or filtering:
  - apenas `month` existe como query param nas rotas mensais
  - `score/history` nao aceita `month` nem `limit` via HTTP hoje
- Cache or invalidation:
  - `summary` usa `unstable_cache`
  - `forecast`, `score` e `insights` calculam on-demand fora desse cache
  - persistencia de `forecast`, `score` e `insights` depende de flows especificos de refresh

## Common Parameter

### `month`

As rotas mensais aceitam opcionalmente `?month=YYYY-MM`:

- `GET /api/analytics/summary`
- `GET /api/analytics/forecast`
- `POST /api/analytics/forecast/recalculate`
- `GET /api/analytics/score`
- `GET /api/analytics/insights`
- `POST /api/analytics/insights/recalculate`

Comportamento real:

- se `month` vier no formato `YYYY-MM`, ele define o periodo consultado
- se vier ausente ou invalido, o backend consulta o mes atual sem retornar `400`
- `score/history` e `insights/[id]/dismiss` nao usam esse parametro

## Endpoints

### GET /api/analytics/summary

#### Purpose

Retornar o resumo mensal agregado do usuario com totais, variacoes, breakdowns e transacoes recentes.

#### Request

| Field   | Type           | Required | Description                   | Validation                                        |
| ------- | -------------- | -------- | ----------------------------- | ------------------------------------------------- |
| `month` | query `string` | No       | Mes alvo no formato `YYYY-MM` | Invalido faz fallback silencioso para o mes atual |

#### Response

```json
{
  "data": {
    "totalIncome": 100000,
    "totalExpenses": 65000,
    "balance": 35000,
    "incomeVariation": 12.5,
    "expenseVariation": -5.4,
    "transactionCount": 18,
    "balanceByAccount": [
      {
        "id": "acc_1",
        "name": "Conta principal",
        "color": "#0f766e",
        "type": "CHECKING",
        "balance": 255000
      }
    ],
    "expensesByCategory": [
      {
        "id": "cat_1",
        "name": "Moradia",
        "color": "#14b8a6",
        "total": 30000
      }
    ],
    "recentTransactions": [
      {
        "id": "txn_1",
        "description": "Mercado",
        "amount": 25990,
        "type": "EXPENSE",
        "date": "2026-04-10T03:00:00.000Z",
        "account": {
          "name": "Conta principal",
          "color": "#0f766e"
        },
        "category": {
          "name": "Alimentacao",
          "color": "#14b8a6"
        }
      }
    ]
  }
}
```

#### Errors

| Status | Condition               | Body Shape                             |
| ------ | ----------------------- | -------------------------------------- |
| `401`  | Sessao ausente/invalida | `{ "error": "Unauthorized" }`          |
| `500`  | Falha inesperada        | `{ "error": "Internal server error" }` |

#### Side Effects

- Nenhum side effect persistente.
- Pode popular ou reutilizar cache server-side do resumo.

#### Notes

- A resposta publica nao inclui `periodStart`, `periodEnd` nem `monthKey`.
- `recentTransactions` usa limite interno default `5`.
- `expensesByCategory` inclui apenas categorias com total `> 0`.
- `balanceByAccount` considera apenas contas nao arquivadas.
- `balance` do resumo e `totalIncome - totalExpenses`; nao inclui saldo inicial de conta.

### GET /api/analytics/forecast

#### Purpose

Retornar o forecast mensal calculado on-demand para o usuario.

#### Request

| Field   | Type           | Required | Description                   | Validation                                        |
| ------- | -------------- | -------- | ----------------------------- | ------------------------------------------------- |
| `month` | query `string` | No       | Mes alvo no formato `YYYY-MM` | Invalido faz fallback silencioso para o mes atual |

#### Response

```json
{
  "data": {
    "periodStart": "2026-04-01T03:00:00.000Z",
    "periodEnd": "2026-05-01T02:59:59.999Z",
    "referenceDate": "2026-04-17T03:00:00.000Z",
    "actualIncome": 120000,
    "actualExpenses": 80000,
    "projectedRecurringIncome": 5000,
    "projectedRecurringExpenses": 10000,
    "projectedVariableIncome": 0,
    "projectedVariableExpenses": 15000,
    "predictedBalance": 20000,
    "riskLevel": "MEDIUM",
    "assumptions": [
      {
        "label": "Receitas realizadas",
        "amount": 120000,
        "kind": "actual"
      }
    ]
  }
}
```

#### Errors

| Status | Condition               | Body Shape                             |
| ------ | ----------------------- | -------------------------------------- |
| `401`  | Sessao ausente/invalida | `{ "error": "Unauthorized" }`          |
| `500`  | Falha inesperada        | `{ "error": "Internal server error" }` |

#### Side Effects

- Nenhum side effect persistente.

#### Notes

- Esta rota nao le nem escreve `ForecastSnapshot`.
- `referenceDate` e parte do contrato publico.
- `assumptions` e exposto integralmente.

### POST /api/analytics/forecast/recalculate

#### Purpose

Forcar o recalculo do forecast do periodo e persistir/atualizar o snapshot correspondente.

#### Request

| Field   | Type           | Required | Description                   | Validation                                        |
| ------- | -------------- | -------- | ----------------------------- | ------------------------------------------------- |
| `month` | query `string` | No       | Mes alvo no formato `YYYY-MM` | Invalido faz fallback silencioso para o mes atual |

#### Response

```json
{
  "data": {
    "periodStart": "2026-04-01T03:00:00.000Z",
    "periodEnd": "2026-05-01T02:59:59.999Z",
    "referenceDate": "2026-04-17T03:00:00.000Z",
    "predictedBalance": 20000,
    "riskLevel": "MEDIUM"
  }
}
```

#### Errors

| Status | Condition               | Body Shape                             |
| ------ | ----------------------- | -------------------------------------- |
| `401`  | Sessao ausente/invalida | `{ "error": "Unauthorized" }`          |
| `500`  | Falha inesperada        | `{ "error": "Internal server error" }` |

#### Side Effects

- recalcula o forecast do periodo
- faz `upsert` em `ForecastSnapshot`
- limpa `staleAt` no `update`

#### Notes

- A resposta e mais enxuta que `GET /forecast`; nao inclui componentes detalhados nem `assumptions`.
- Mesmo mes recalculado novamente atualiza o mesmo snapshot logico por `userId + periodStart`.

### GET /api/analytics/score

#### Purpose

Retornar o score financeiro do periodo calculado on-demand.

#### Request

| Field   | Type           | Required | Description                   | Validation                                        |
| ------- | -------------- | -------- | ----------------------------- | ------------------------------------------------- |
| `month` | query `string` | No       | Mes alvo no formato `YYYY-MM` | Invalido faz fallback silencioso para o mes atual |

#### Response

```json
{
  "data": {
    "periodStart": "2026-04-01T03:00:00.000Z",
    "periodEnd": "2026-05-01T02:59:59.999Z",
    "score": 74,
    "status": "GOOD",
    "factors": [
      {
        "key": "savings_rate",
        "label": "Taxa de economia",
        "weight": 30,
        "points": 24,
        "reason": "Voce poupou 16% da sua renda (meta saudavel: 20%)"
      }
    ],
    "insights": [
      {
        "tone": "warning",
        "message": "Aumentar a taxa de economia pode elevar a pontuacao rapidamente"
      }
    ],
    "previousScore": 68,
    "delta": 6
  }
}
```

#### Errors

| Status | Condition               | Body Shape                             |
| ------ | ----------------------- | -------------------------------------- |
| `401`  | Sessao ausente/invalida | `{ "error": "Unauthorized" }`          |
| `500`  | Falha inesperada        | `{ "error": "Internal server error" }` |

#### Side Effects

- Nenhum side effect persistente.

#### Notes

- A rota nao cria nem atualiza `FinancialScoreSnapshot`.
- `previousScore` e `delta` dependem da existencia de snapshots anteriores persistidos.
- `insights` aqui sao insights do score, nao o feed de `InsightSnapshot`.

### GET /api/analytics/score/history

#### Purpose

Retornar o historico persistido de score do usuario.

#### Request

Nao recebe body nem query params relevantes hoje.

#### Response

```json
{
  "data": [
    {
      "periodStart": "2026-02-01T03:00:00.000Z",
      "periodEnd": "2026-03-01T02:59:59.999Z",
      "score": 65,
      "status": "GOOD",
      "calculatedAt": "2026-02-28T22:15:00.000Z"
    }
  ]
}
```

#### Errors

| Status | Condition               | Body Shape                             |
| ------ | ----------------------- | -------------------------------------- |
| `401`  | Sessao ausente/invalida | `{ "error": "Unauthorized" }`          |
| `500`  | Falha inesperada        | `{ "error": "Internal server error" }` |

#### Side Effects

- Nenhum side effect persistente.

#### Notes

- O backend usa limite interno default `12`.
- A lista e devolvida em ordem cronologica crescente.
- Esta rota so enxerga snapshots persistidos; nao recalcula historico retroativamente.

### GET /api/analytics/insights

#### Purpose

Retornar o feed visivel de insights do periodo, calculado on-demand e reconciliado com snapshots existentes quando houver.

#### Request

| Field   | Type           | Required | Description                   | Validation                                        |
| ------- | -------------- | -------- | ----------------------------- | ------------------------------------------------- |
| `month` | query `string` | No       | Mes alvo no formato `YYYY-MM` | Invalido faz fallback silencioso para o mes atual |

#### Response

```json
{
  "data": [
    {
      "id": "ins_1",
      "key": "forecast_negative",
      "title": "Saldo pode fechar o mes no negativo",
      "body": "Mantendo o ritmo atual, a previsao de fechamento e -R$ 200,00.",
      "severity": "CRITICAL",
      "scopeType": "forecast",
      "scopeId": null,
      "cta": {
        "label": "Ver previsao",
        "action": "open-forecast",
        "href": "/dashboard"
      },
      "fingerprint": "forecast_negative",
      "priority": 90,
      "periodStart": "2026-04-01T03:00:00.000Z",
      "periodEnd": "2026-05-01T02:59:59.999Z"
    }
  ]
}
```

#### Errors

| Status | Condition               | Body Shape                             |
| ------ | ----------------------- | -------------------------------------- |
| `401`  | Sessao ausente/invalida | `{ "error": "Unauthorized" }`          |
| `500`  | Falha inesperada        | `{ "error": "Internal server error" }` |

#### Side Effects

- Nenhum side effect persistente.

#### Notes

- A rota filtra insights dismissados antes de responder.
- Quando o insight ainda nao tem snapshot persistido, `id` sai como `null`.
- `payload` e `isDismissed` nao sao expostos nessa resposta publica.

### POST /api/analytics/insights/recalculate

#### Purpose

Forcar o recalculo do feed de insights e persistir snapshots do periodo.

#### Request

| Field   | Type           | Required | Description                   | Validation                                        |
| ------- | -------------- | -------- | ----------------------------- | ------------------------------------------------- |
| `month` | query `string` | No       | Mes alvo no formato `YYYY-MM` | Invalido faz fallback silencioso para o mes atual |

#### Response

```json
{
  "data": [
    {
      "id": "ins_1",
      "key": "forecast_negative",
      "fingerprint": "forecast_negative",
      "severity": "CRITICAL",
      "isDismissed": false
    }
  ]
}
```

#### Errors

| Status | Condition               | Body Shape                             |
| ------ | ----------------------- | -------------------------------------- |
| `401`  | Sessao ausente/invalida | `{ "error": "Unauthorized" }`          |
| `500`  | Falha inesperada        | `{ "error": "Internal server error" }` |

#### Side Effects

- recalcula o feed do periodo
- faz `upsert` de `InsightSnapshot` por `userId + periodStart + fingerprint`
- remove snapshots obsoletos que nao estejam dismissados
- preserva `isDismissed` dos snapshots existentes

#### Notes

- Esta rota nao filtra dismissados; ela devolve `isDismissed` explicitamente.
- A resposta e resumida; nao inclui `title`, `body`, `cta` nem `payload`.

### PATCH /api/analytics/insights/[id]/dismiss

#### Purpose

Marcar um insight persistido como dismissado.

#### Request

| Field | Type          | Required | Description               | Validation                          |
| ----- | ------------- | -------- | ------------------------- | ----------------------------------- |
| `id`  | path `string` | Yes      | ID do snapshot de insight | Deve existir e pertencer ao usuario |

#### Response

```json
{
  "data": {
    "id": "ins_1",
    "isDismissed": true
  }
}
```

#### Errors

| Status | Condition                               | Body Shape                              |
| ------ | --------------------------------------- | --------------------------------------- |
| `401`  | Sessao ausente/invalida                 | `{ "error": "Unauthorized" }`           |
| `404`  | Insight inexistente ou de outro usuario | `{ "error": "Insight nao encontrado" }` |
| `500`  | Falha inesperada                        | `{ "error": "Internal server error" }`  |

#### Side Effects

- atualiza `InsightSnapshot.isDismissed` para `true`

#### Notes

- Esta rota nao recalcula o engine.
- So funciona com `id` persistido; `id = null` da rota `GET /insights` nao pode ser usado aqui.

## Endpoint Comparison

| Area     | Read Endpoint   | Persist Endpoint             | Main Difference                                                                            |
| -------- | --------------- | ---------------------------- | ------------------------------------------------------------------------------------------ |
| Summary  | `GET /summary`  | none                         | Usa cache server-side, nao snapshot write-back                                             |
| Forecast | `GET /forecast` | `POST /forecast/recalculate` | `GET` devolve breakdown completo; `POST` persiste e responde de forma resumida             |
| Score    | `GET /score`    | none via API publica         | Leitura on-demand; historico depende de snapshots persistidos por outros fluxos            |
| Insights | `GET /insights` | `POST /insights/recalculate` | `GET` filtra dismissados e pode trazer `id = null`; `POST` persiste e expone `isDismissed` |

## Observability and Debugging

- Relevant logs:
  - as rotas nao emitem logs estruturados hoje
- Metrics or traces:
  - nao ha metricas por endpoint implementadas explicitamente
- Failure signatures:
  - `Unauthorized` indica falha de sessao em qualquer rota
  - `Insight nao encontrado` aparece apenas no dismiss
  - ausencia de `month` valido nao gera erro; o endpoint responde com o mes atual
  - `500` pode encapsular falha de banco, cache, motor analitico ou parsing interno

## Related Decisions

- ADR: [ADR-009 Analytics Snapshot and Invalidation Strategy](../decisions/ADR-009-analytics-snapshot-invalidation.md)
- ADR: [ADR-011 Forecast Engine](../decisions/ADR-011-forecast-engine.md)
- ADR: [ADR-012 Financial Score](../decisions/ADR-012-financial-score.md)
- ADR: [ADR-013 Automatic Insights](../decisions/ADR-013-automatic-insights.md)

## Open Questions

- A API deveria validar `month` com `400` em vez de fazer fallback silencioso para o mes atual?
- `score/history` deveria expor `limit` por query param para evitar acoplamento ao default interno?
- `forecast/recalculate` e `insights/recalculate` deveriam devolver payload completo para reduzir round-trips?
- O sistema deve expor uma rota publica de refresh para score, alinhando a superficie HTTP com o helper interno existente?

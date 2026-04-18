# Task: Phase 12 - Automatic Insights

## Status

- [ ] Todo
- [ ] In Progress
- [x] Done

## Context

Depois de metas, forecast e score, o produto passa a ter sinais suficientes para gerar mensagens automaticas uteis sem depender de IA generativa.

Esta task operacionaliza a spec em [Insights Automaticos](../future-features/04-automatic-insights.md) e deve fechar o ciclo analitico do produto.

## Objective

Entregar um motor determinista de insights que gere mensagens especificas, acionaveis e priorizadas com base em comparacoes entre periodos, risco financeiro, metas e cartao.

## Scope

- Criar snapshot de insights por periodo
- Implementar conjunto inicial de heuristicas de alta confianca
- Deduplicar insights por fingerprint
- Expor endpoints de leitura, recalc e dismiss
- Integrar widget de insights no dashboard

## Out of Scope

- IA generativa para redacao
- Feed social ou sistema de notificacoes push
- Motor de recomendacao aberto sem regras claras

## Decisions

- Insights precisam de threshold percentual e absoluto
- O sistema deve limitar quantidade de insights exibidos por periodo
- `TRANSFER` continua fora dos sinais
- Textos devem ser deterministas e auditaveis

## Contracts

### Internal contracts

- `buildInsightMetrics(userId, period)`
- `runInsightRules(metrics)`
- `dedupeInsights(insights)`
- `refreshInsightSnapshots(userId, period)`
- `dismissInsight(insightId, userId)`

### Planned HTTP contracts

- `GET /api/analytics/insights?month=2026-04`
- `POST /api/analytics/insights/recalculate?month=2026-04`
- `PATCH /api/analytics/insights/[id]/dismiss`

### Response expectations

- Toda resposta deve incluir:
  - titulo
  - corpo
  - severidade
  - escopo
  - CTA contextual, quando aplicavel

## Migrations

- Criar `InsightSnapshot`
- Criar enum `InsightSeverity`

## UI

- Widget `insights` no dashboard
- Lista de 3 a 5 insights prioritarios
- Badges por severidade
- Acao de dismiss

## Tests

- Regra de aumento de gasto por categoria
- Regra de concentracao excessiva
- Regra de meta em risco
- Regra de saldo previsto negativo
- Regra de vencimento/uso alto de cartao
- Dedupe por fingerprint
- Dismiss sem duplicacao futura indevida

## Checklist

- [x] Modelo `InsightSnapshot` criado
- [x] Motor de regras implementado
- [x] APIs de leitura/recalculo/dismiss entregues
- [x] Widget de insights entregue
- [x] Heuristicas principais validadas com fixtures reais
- [x] `.docs/CONTEXT.md` updated
- [x] ADR created/updated (if applicable)
- [ ] Manual validation done

## Notes for AI (next step)

Comece com poucas regras de alta confianca. Insight demais vira ruido e derruba o valor percebido do produto.

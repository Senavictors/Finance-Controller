# Task: Phase 10 - Forecast Engine

## Status

- [x] Todo
- [ ] In Progress
- [ ] Done

## Context

Depois da Phase 8 e da implementacao de metas, o produto passa a ter base suficiente para projetar o fechamento do periodo com mais confianca, combinando realizado, recorrencias e compromissos do cartao.

Esta task operacionaliza a spec em [Forecast Engine](../future-features/02-forecast-engine.md) e deve se apoiar na mesma base usada por Goal Engine.

## Objective

Responder de forma explicavel a pergunta `Se eu continuar assim, como vou terminar o mes?`, com saldo previsto, breakdown das premissas e classificacao de risco.

## Scope

- Criar dominio e snapshot de forecast mensal
- Combinar realizado no periodo com recorrencias futuras
- Projetar componente variavel com heuristica transparente
- Considerar vencimentos e pagamentos de fatura no periodo
- Expor endpoint de leitura e opcionalmente recalculo
- Integrar forecast ao dashboard

## Out of Scope

- Modelos estatisticos avancados
- Machine learning
- Jobs dedicados de recalculo periodico
- Notificacoes automaticas

## Decisions

- `TRANSFER` continua fora do forecast
- Recorrencias futuras devem entrar na previsao mesmo antes de virarem transacao
- O MVP precisa ser auditavel e explicavel, sem heuristica opaca
- O forecast deve reutilizar snapshots e tags de invalidação ja padronizados

## Contracts

### Internal contracts

- `listProjectedRecurringOccurrences(userId, period, referenceDate)`
- `calculateVariableProjection(userId, period, referenceDate)`
- `buildForecastSnapshot(userId, period, referenceDate)`
- `refreshForecastSnapshot(userId, period, referenceDate)`

### Planned HTTP contracts

- `GET /api/analytics/forecast?month=2026-04`
- `POST /api/analytics/forecast/recalculate?month=2026-04`

### Response expectations

- Toda resposta deve informar:
  - realizado ate agora
  - recorrente futuro
  - variavel projetado
  - saldo previsto
  - nivel de risco
  - premissas resumidas

## Migrations

- Criar `ForecastSnapshot`
- Adicionar enum `ForecastRiskLevel`

## UI

- Widget de forecast na dashboard
- Card com saldo previsto e risco
- Breakdown curto das premissas
- Possivel CTA para abrir transacoes, recorrencias ou faturas relevantes

## Tests

- Projecao de recorrencias futuras sem duplicar realizado
- Exclusao de `TRANSFER`
- Consideracao de vencimento de fatura dentro do periodo
- Classificacao de risco
- Snapshot por periodo e data de referencia

## Checklist

- [ ] Modelo `ForecastSnapshot` criado
- [ ] Use cases de forecast implementados
- [ ] APIs de leitura/recalculo entregues
- [ ] Widget/card na dashboard entregue
- [ ] Integracao com base de snapshot/invalidation concluida
- [ ] `.docs/CONTEXT.md` updated
- [ ] ADR created/updated (if applicable)
- [ ] Manual validation done

## Notes for AI (next step)

Evite vender previsao como certeza. O valor desta fase esta na combinacao pragmatica de sinais reais com heuristicas pequenas e explicaveis.

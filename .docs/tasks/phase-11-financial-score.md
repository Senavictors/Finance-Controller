# Task: Phase 11 - Financial Score

## Status

- [ ] Todo
- [ ] In Progress
- [x] Done

## Context

Com metas e forecast disponiveis, o projeto passa a ter insumos suficientes para sintetizar a saude financeira do usuario de forma explicavel e visualmente forte.

Esta task operacionaliza a spec em [Score Financeiro Pessoal](../future-features/03-financial-score.md).

## Objective

Entregar um score financeiro mensal de `0 a 100`, com fatores explicaveis, historico e indicacoes claras do que ajudou ou prejudicou a nota.

## Scope

- Criar snapshot de score financeiro
- Implementar calculo baseado em fatores com pesos
- Expor leitura mensal e historico
- Integrar score ao dashboard com status e delta
- Reutilizar metas e forecast onde fizer sentido

## Out of Scope

- Comparacao com bureaus de credito externos
- Open Finance
- Score em tempo real a cada mutacao sem snapshot

## Decisions

- O score precisa ser explicavel por fator; nada de numero magico
- `TRANSFER` continua fora da conta
- O peso de metas deve ser neutro ou redistribuido quando o usuario ainda nao tiver Goal Engine configurado
- O fator de cartao deve usar utilizacao real de limite e comportamento de pagamento de fatura

## Contracts

### Internal contracts

- `calculateFinancialScore(userId, period)`
- `getFinancialScoreHistory(userId)`
- `refreshFinancialScoreSnapshot(userId, period)`

### Planned HTTP contracts

- `GET /api/analytics/score?month=2026-04`
- `GET /api/analytics/score/history`

### Response expectations

- Toda resposta de score deve incluir:
  - nota
  - status textual
  - fatores com peso e pontos
  - insights resumidos
  - comparacao com periodo anterior, quando existir

## Migrations

- Criar `FinancialScoreSnapshot`

## UI

- Widget hero de score no dashboard
- Breakdown dos fatores em lista ou accordion
- Historico curto dos ultimos meses
- CTA com recomendacoes acionaveis

## Tests

- Calculo por fator com pesos previsiveis
- Comportamento sem metas configuradas
- Uso de cartao com billing real
- Faixas de status
- Historico ordenado por periodo

## Checklist

- [x] Modelo `FinancialScoreSnapshot` criado
- [x] Motor de score implementado
- [x] APIs mensal e historica entregues
- [x] Widget e breakdown no dashboard entregues
- [x] Compatibilidade com Goal Engine e Forecast validada
- [x] `.docs/CONTEXT.md` updated
- [x] ADR created/updated (if applicable)
- [ ] Manual validation done

## Notes for AI (next step)

Se precisar simplificar, simplifique na quantidade de fatores, nao na explicabilidade. O score so ganha valor se o usuario entender de onde ele veio.

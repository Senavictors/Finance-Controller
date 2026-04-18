# ADR-012: Score Financeiro Pessoal — Pontuacao Explicavel

## Status

Accepted

## Context

Com Goal Engine (ADR-010) e Forecast Engine (ADR-011) entregues, o sistema reune dados suficientes para sintetizar a saude financeira do usuario em um indicador unico. A spec em `.docs/future-features/03-financial-score.md` definiu o objetivo de um score de 0 a 100, mas deixou em aberto:

- Como combinar fatores sem transformar a nota em caixa preta
- Como nao punir configuracao ausente (sem metas, sem cartao)
- Como reaproveitar Goal Engine e credit card billing sem duplicar calculo

## Decision

### Modelo

- Novo `FinancialScoreSnapshot` com chave unica `(userId, periodStart)`
- Novo enum `FinancialScoreStatus`: `CRITICAL`, `ATTENTION`, `GOOD`, `EXCELLENT`
- Campos `factors: Json` e `insights: Json` guardam a trilha audit do calculo

### Fatores e pesos

| Fator                | Peso | Sinal                                                          |
| -------------------- | ---- | -------------------------------------------------------------- |
| `savings_rate`       | 30   | (receita - despesa) / receita, normalizado em meta 20%         |
| `spend_stability`    | 20   | desvio do gasto atual vs media dos 3 meses anteriores          |
| `income_consistency` | 15   | coeficiente de variacao da renda dos 3 meses anteriores        |
| `credit_card`        | 15   | utilizacao de limite (10 pts) + historico de pagamento (5 pts) |
| `goals`              | 20   | media do progresso das metas ativas no periodo                 |

Pontos finais: `score = round(sum(points) / sum(weights) * 100)`.

### Redistribuicao por ausencia de dados

Quando o usuario ainda nao configurou um dominio (sem metas, sem cartao, sem historico suficiente), o fator entra com `weight: 0` e `points: 0`. Isso faz com que o peso se redistribua automaticamente entre os demais fatores em vez de punir quem nao configurou o modulo.

Excecao: `spend_stability` e `income_consistency` sem historico suficiente retornam `neutral: true` com pontos parciais (60% do peso) — punir zero seria injusto, pagar cheio seria inflar nota.

### Faixas de status

- `0-39`: `CRITICAL`
- `40-59`: `ATTENTION`
- `60-79`: `GOOD`
- `80-100`: `EXCELLENT`

### Regras de dominio

- `TRANSFER` nao entra em nenhum calculo de score
- Utilizacao de cartao considera soma dos `creditLimit` dos cartoes ativos e o saldo devedor da(s) fatura(s) com vencimento no periodo
- Pagamento de cartao penaliza quando existe alguma fatura `OVERDUE` ativa
- Metas reusam `listGoalsWithProgress` — logica nao duplica; se o modulo falhar, o fator vira weightless

### Superficie externa

- `GET /api/analytics/score?month=YYYY-MM` — leitura on-demand (nao cria snapshot)
- `GET /api/analytics/score/history` — ultimos snapshots persistidos do usuario
- Widget `score` no dashboard com nota, delta vs mes anterior, breakdown de fatores e insights

### Integracao com ADR-009

- O modulo `score` ja estava reservado em `ANALYTICS_MUTATION_MODULES` desde a fundacao analitica; mutacoes financeiras continuam invalidando tags do modulo automaticamente
- `FinancialScoreSnapshot.staleAt` existe como hint para futura camada de cache

## Consequences

- Score fica disponivel em uma unica chamada server-side, reutilizando analytics core, Goal Engine e credit card billing
- A trilha de `factors` garante explicabilidade: cada ponto do score tem origem declarada
- Redistribuicao por peso evita armadilha tipica de gamificacao (punir quem nao configurou tudo)
- Sem dependencia de IA, bureaus externos ou Open Finance
- A heuristica de 3 meses de historico pode subestimar meses com eventos atipicos; assumido como trade-off do MVP
- Os thresholds de utilizacao de cartao (30/50/80%) sao defaults razoaveis; podem virar configuracao futura

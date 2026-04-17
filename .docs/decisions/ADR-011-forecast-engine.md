# ADR-011: Forecast Engine — Previsao Mensal Auditavel

## Status

Accepted

## Context

Apos a Phase 9 entregar o Goal Engine reutilizando a camada analitica compartilhada, o proximo passo logico e transformar o Finance Controller de ferramenta de controle em ferramenta de decisao. Isso exige responder com confianca:

> Se eu continuar assim, como vou terminar o mes?

O sistema ja possui:

- Camada analitica server-side em `src/server/modules/finance/application/analytics/`
- Motor de recorrencias em `RecurringRule` com logica de materializacao no endpoint de apply
- Ciclo de fatura real em `CreditCardStatement`
- Estrategia de snapshot/invalidation com modulo `forecast` ja reservado em `ANALYTICS_MUTATION_MODULES`

Faltava decidir como montar a previsao sem cair em overengineering, sem depender de jobs ou ML, e sem vender incerteza como certeza.

## Decision

### Modelo

- Novo `ForecastSnapshot` com chave unica `(userId, periodStart)`
- Novo enum `ForecastRiskLevel`: `LOW`, `MEDIUM`, `HIGH`
- Campo `assumptions: Json` guarda a trilha audit das premissas que geraram o saldo

### Calculo transparente e explicavel

A formula do MVP e intencionalmente simples:

```
saldo_previsto =
  (receitas_realizadas + receitas_recorrentes_futuras + receitas_variaveis_projetadas)
  - (despesas_realizadas + despesas_recorrentes_futuras + despesas_variaveis_projetadas)
```

- **Realizado** e somado direto de `Transaction` ate a data de referencia
- **Recorrente futuro** enumera datas restantes no periodo a partir de `RecurringRule` ativas, sem duplicar transacoes ja aplicadas (corte em `referenceDate + 1 dia`)
- **Variavel projetado** usa media diaria de despesa dos ultimos 2 meses como heuristica, multiplicada pelos dias restantes do periodo
- **Faturas em aberto** entram como premissas explicitas no breakdown quando o vencimento cai no periodo, sem inflar duplicado (sao reflexo das transacoes ja contabilizadas)

### Classificacao de risco

- `HIGH` quando saldo previsto fica negativo
- `MEDIUM` quando saldo positivo porem abaixo de R$ 500 (reserva minima implicita)
- `LOW` quando folga acima da reserva

Limite de R$ 500 e um default razoavel para o MVP; pode virar configuracao do usuario no futuro.

### Regras de dominio

- `TRANSFER` nao entra no forecast, nem realizado nem projetado
- Recorrencias so projetam datas estritamente posteriores a `referenceDate`, evitando dupla contagem com transacoes ja aplicadas do mesmo dia
- Faturas em aberto aparecem como linha auditavel, nao como novo gasto — sao compromissos ja representados no realizado ou nas recorrencias

### Superficie externa

- `GET /api/analytics/forecast?month=YYYY-MM` — leitura on-demand (nao cria snapshot)
- `POST /api/analytics/forecast/recalculate?month=YYYY-MM` — forca calculo e persiste snapshot
- Widget `forecast` no dashboard com saldo previsto, badge de risco e top 3 premissas

### Integracao com ADR-009

- O modulo `forecast` ja figurava em `ANALYTICS_MUTATION_MODULES` para `transaction`, `transfer`, `recurringRule`, `account`, `category` e `creditCardPayment`
- Mutacoes financeiras continuam invalidando tags do modulo `forecast` automaticamente
- `ForecastSnapshot.staleAt` existe como hint para futura camada de cache, sem ser obrigatorio ainda

## Consequences

- Previsao do mes fica disponivel em uma unica chamada server-side, reutilizando integralmente o analytics core
- A trilha de `assumptions` torna a UI honesta: o usuario ve de onde vem o numero
- Snapshot persistido da base para historico (ex: comparar previsao de abril no dia 10 vs dia 20)
- Sem dependencia de Redis, fila ou cron — tudo fica on-demand no request
- A heuristica de 2 meses de historico pode subestimar meses com eventos atipicos; assumido como trade-off do MVP
- O limite de R$ 500 para risco medio precisara virar configuracao por usuario quando houver perfis com reservas maiores

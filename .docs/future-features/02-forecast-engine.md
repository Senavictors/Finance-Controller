# Forecast Engine

## Objetivo

Responder com confianca a pergunta: `Se eu continuar assim, como vou terminar o mes?`

No contexto atual do Finance Controller, a previsao deve nascer como um motor analitico server-side que combina dados ja realizados no periodo com eventos provaveis ate o fechamento do mes.

## Dependencia

Depende da fundacao documentada em [Phase 8 - Foundation for Analytics and Credit Card Billing](../tasks/phase-8-analytics-foundation-and-credit-card-billing.md) e da decisao em [ADR-008](../decisions/ADR-008-credit-card-billing-cycle.md).

## Leitura do sistema atual

- O projeto ja possui agregacao mensal em `src/app/api/analytics/summary/route.ts` e em `src/app/(app)/dashboard/page.tsx`.
- O hook `src/hooks/use-period.ts` ja define um contrato de navegacao por mes.
- Recorrencias ja oferecem um sinal forte para previsao de entradas e saidas futuras.
- O sistema ainda nao possui jobs, filas, Redis ou scheduler automatico.
- A implementacao atual ainda replica calculos em mais de um ponto, entao o forecast nao deve nascer como mais um bloco isolado.

## Recomendacao arquitetural

O Forecast Engine deve reutilizar a mesma base analitica das metas:

- `resolvePeriodRange`
- `calculatePeriodSummary`
- `listProjectedRecurringOccurrences`
- `buildForecastSnapshot`

O ideal e criar isso em `src/server/modules/finance/application/forecast/` e `domain/forecast/`, evitando colocar a previsao diretamente em `route.ts`.

## Modelo recomendado

```prisma
enum ForecastRiskLevel {
  LOW
  MEDIUM
  HIGH
}

model ForecastSnapshot {
  id                         String            @id @default(cuid())
  userId                     String            @map("user_id")
  periodStart                DateTime          @map("period_start")
  periodEnd                  DateTime          @map("period_end")
  referenceDate              DateTime          @map("reference_date")
  actualIncome               Int               @map("actual_income")
  actualExpenses             Int               @map("actual_expenses")
  projectedRecurringIncome   Int               @map("projected_recurring_income")
  projectedRecurringExpenses Int               @map("projected_recurring_expenses")
  projectedVariableIncome    Int               @map("projected_variable_income")
  projectedVariableExpenses  Int               @map("projected_variable_expenses")
  predictedBalance           Int               @map("predicted_balance")
  riskLevel                  ForecastRiskLevel @map("risk_level")
  assumptions                Json
  calculatedAt               DateTime          @default(now()) @map("calculated_at")
  staleAt                    DateTime?         @map("stale_at")
}
```

## Estrategia de calculo recomendada

Para o MVP, a previsao pode ser transparente e explicavel:

1. Ler o periodo atual.
2. Somar receitas e despesas ja realizadas ate a data de referencia.
3. Projetar recorrencias futuras ativas dentro do mesmo periodo.
4. Projetar gastos variaveis usando media diaria do proprio mes ou media dos ultimos 2 ou 3 meses.
5. Combinar tudo em um saldo previsto.
6. Classificar risco.

Formula conceitual:

```txt
saldo_previsto =
  saldo_realizado_ate_hoje
  + entradas_recorrentes_futuras
  - saidas_recorrentes_futuras
  + entradas_variaveis_projetadas
  - saidas_variaveis_projetadas
```

## Decisoes importantes para este projeto

- `TRANSFER` nao entra no forecast.
- O forecast deve usar `RecurringRule` mesmo que a transacao ainda nao tenha sido aplicada, porque previsao depende do compromisso futuro e nao apenas do que ja virou transacao.
- O MVP deve prever `saldo do periodo`, mas ja considerando vencimentos de fatura e pagamentos planejados de cartao.
- Contas `CREDIT_CARD` devem projetar:
  - compras futuras
  - valor em aberto de faturas
  - impacto de vencimentos dentro do periodo

## Risco e classificacao

Sugestao simples para o MVP:

- `LOW`: saldo previsto acima de zero e margem confortavel.
- `MEDIUM`: saldo previsto positivo, mas abaixo de uma reserva minima configuravel.
- `HIGH`: saldo previsto negativo ou muito proximo de zero.

Essa classificacao pode virar texto de interface:

- `Saldo previsto: R$ 1.240`
- `Risco: medio`
- `Principal pressao: assinaturas e alimentacao`

## API recomendada

- `GET /api/analytics/forecast?month=2026-04`
- `POST /api/analytics/forecast/recalculate?month=2026-04`

## UI recomendada

- Card destaque no dashboard com saldo previsto no fechamento do mes.
- Widget adicional com breakdown:
  - realizado
  - recorrente futuro
  - variavel projetado
  - saldo previsto
- Bloco de explicacao curta com as hipoteses do forecast.

## Estrategia de cache

Sem infraestrutura extra, o melhor caminho e snapshot em banco:

- Cache por `userId + periodStart + referenceDate`.
- Recalculo on-demand quando estiver stale.
- Invalidacao em mutacoes de transacoes e recorrencias.
- Cron opcional no futuro, mas nao necessario para a primeira entrega.

## Ponto de integracao no codigo atual

- `src/hooks/use-period.ts`
- `src/app/api/analytics/summary/route.ts`
- `src/app/(app)/dashboard/page.tsx`
- `src/app/(app)/dashboard/widgets/registry.ts`
- `src/app/api/recurring-rules/apply/route.ts`
- `prisma/schema.prisma`

## Ordem recomendada de implementacao

1. Consolidar helper de periodo e agregacoes.
2. Criar use case de projeção recorrente.
3. Definir heuristica de projeção variavel e documentar suposicoes.
4. Persistir `ForecastSnapshot`.
5. Expor endpoint de leitura.
6. Adicionar widget de forecast na dashboard.
7. Integrar forecast com score e insights.

## Riscos e cuidados

- Nao vender previsao como certeza. A UI precisa mostrar que existe um modelo por tras com premissas simples.
- Nao duplicar recorrencias ja realizadas e recorrencias futuras no mesmo calculo.
- Nao depender de job para o MVP, porque o produto atual ainda nao usa essa infraestrutura.

## Valor para portfolio

Essa feature transforma o app de controle em ferramenta de decisao. Ela mostra maturidade de produto e, tecnicamente, demonstra capacidade de modelar previsao pragmatica sem cair em overengineering ou falsa IA.

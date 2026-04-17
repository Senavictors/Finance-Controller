# ADR-010: Goal Engine — Modulo de Metas Financeiras

## Status

Accepted

## Context

A Phase 9 introduziu o primeiro modulo realmente alinhado a arquitetura em camadas definida para o projeto. Ate aqui, analytics e billing de cartao ja existiam em `src/server/modules/finance/application/`, porem grande parte da logica de leitura ainda vivia em route handlers.

O objetivo do Goal Engine e transformar metas financeiras em um modulo central do produto, com calculo confiavel por periodo, suporte a escopos diferentes e integracao com o dashboard. Para isso, foi preciso decidir:

- Como modelar metas no dominio (tipos de metrica, escopo, periodo, status)
- Como calcular progresso de forma coerente com o analytics core existente
- Como tratar transferencias e subcategorias
- Como metas ligadas a cartao devem enxergar o ciclo de fatura
- Como persistir o estado do calculo sem bloquear leituras futuras
- Como a feature se conecta ao dashboard

## Decision

### Dominio

- Duas tabelas Prisma: `Goal` e `GoalSnapshot`
- Quatro enums:
  - `GoalMetric`: `SAVING`, `EXPENSE_LIMIT`, `INCOME_TARGET`, `ACCOUNT_LIMIT`
  - `GoalScopeType`: `GLOBAL`, `CATEGORY`, `ACCOUNT`
  - `GoalPeriod`: mensal como default inicial
  - `GoalStatus`: `ON_TRACK`, `WARNING`, `AT_RISK`, `ACHIEVED`, `EXCEEDED`
- Todo `Goal` pertence a um `userId`. Escopos opcionais referenciam `categoryId` ou `accountId`.

### Calculo de progresso

- Reutiliza a camada analitica server-side em `src/server/modules/finance/application/analytics/`
- Transacoes do tipo `TRANSFER` ficam fora de qualquer calculo de meta
- Metas por categoria incluem subcategorias por padrao quando a categoria alvo for pai
- Metas `ACCOUNT_LIMIT` preferem o ciclo de fatura em aberto quando a conta for um cartao de credito, em vez de mes calendario puro
- O progresso sempre retorna:
  - `targetAmount`, `actualAmount`, `projectedAmount`
  - `progressPercent`
  - `status` derivado do ritmo e da metrica
  - `alerts[]` com mensagens objetivas
  - `periodStart`, `periodEnd`

### Superficie externa

- Rotas HTTP thin handlers em `src/app/api/goals/`:
  - `GET /api/goals`, `POST /api/goals`
  - `PATCH /api/goals/[id]`, `DELETE /api/goals/[id]` (archive logico)
- Pagina `/goals` com cards agrupados por status (em risco vs no ritmo)
- Widget `goal-progress` no dashboard, consumindo o mesmo `listGoalsWithProgress`

### Integracao com snapshot/invalidation (ADR-009)

- Mutacoes financeiras relevantes invalidam o modulo `goals` junto com `summary`
- O snapshot persistido (`GoalSnapshot`) guarda o ultimo calculo por meta/periodo, servindo como trilha auditavel e base futura de cache; leituras atuais recalculam sob demanda com dados vivos do analytics core

## Consequences

- O modulo de metas e o primeiro a seguir estritamente `UI -> API -> Use Case -> Domain -> Repositorio`, servindo de referencia para Phase 10 (Forecast Engine) e Phase 11 (Score Financeiro)
- Reutilizar o analytics core evita divergencia entre o numero mostrado na dashboard, na pagina de transacoes e nas metas
- Excluir `TRANSFER` por padrao impede que movimentacoes entre contas proprias inflem metas de receita ou despesa
- Tratar cartao pelo ciclo de fatura em `ACCOUNT_LIMIT` alinha a meta a realidade de cobranca, nao a competencia bruta
- Widget no dashboard consome o mesmo DTO da pagina `/goals`, reduzindo risco de drift visual
- `GoalSnapshot` existe como tabela antes de ser usado como cache real; a fase seguinte pode converter leituras para snapshots sem mudar o contrato publico das APIs

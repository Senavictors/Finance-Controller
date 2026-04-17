# Goal Engine

## Objetivo

Transformar metas financeiras em um modulo central do produto, com calculo confiavel por periodo, suporte a escopos diferentes e forte integracao com dashboard, alertas e futuras features analiticas.

## Dependencia

Depende da fundacao documentada em [Phase 8 - Foundation for Analytics and Credit Card Billing](../tasks/phase-8-analytics-foundation-and-credit-card-billing.md) e da decisao em [ADR-008](../decisions/ADR-008-credit-card-billing-cycle.md).

## Leitura do sistema atual

- O sistema ja trabalha com selecao mensal via `src/hooks/use-period.ts`.
- O dashboard e o endpoint `src/app/api/analytics/summary/route.ts` ja calculam agregados financeiros por mes.
- Recorrencias ja existem em `RecurringRule` + `RecurringLog`, com aplicacao idempotente.
- Contas ja possuem tipos relevantes para metas, incluindo `CREDIT_CARD`.
- Categorias sao hierarquicas, entao metas por categoria precisam considerar subcategorias.
- A arquitetura documentada preve use cases e repositories, mas a implementacao atual ainda concentra muitos calculos em `route.ts` e server pages com Prisma direto.

## Recomendacao arquitetural

Esta feature deve ser o ponto de virada para preencher de verdade `src/server/modules/finance/application`, `domain` e `infra`, em vez de adicionar mais regras diretamente nas rotas.

Antes da implementacao da meta em si, vale extrair uma base compartilhada:

- `resolvePeriodRange(month?: string)` no server para substituir a duplicacao atual em dashboard, transactions e analytics.
- `calculatePeriodSummary(userId, period)` para centralizar receitas, despesas, saldo e agregacoes.
- Convencao explicita de que `TRANSFER` fica fora dos calculos de metas.

## Modelo de dominio recomendado

O modelo abaixo fica mais flexivel do que um `type` unico, porque separa a natureza da meta do escopo monitorado.

```prisma
enum GoalMetric {
  SAVING
  EXPENSE_LIMIT
  INCOME_TARGET
  ACCOUNT_LIMIT
}

enum GoalScopeType {
  GLOBAL
  CATEGORY
  ACCOUNT
}

enum GoalPeriod {
  MONTHLY
  YEARLY
}

enum GoalStatus {
  ON_TRACK
  WARNING
  AT_RISK
  ACHIEVED
  EXCEEDED
}

model Goal {
  id               String        @id @default(cuid())
  userId           String        @map("user_id")
  name             String
  description      String?
  metric           GoalMetric
  scopeType        GoalScopeType @map("scope_type")
  categoryId       String?       @map("category_id")
  accountId        String?       @map("account_id")
  targetAmount     Int           @map("target_amount")
  period           GoalPeriod
  warningPercent   Int           @default(80) @map("warning_percent")
  dangerPercent    Int           @default(95) @map("danger_percent")
  isActive         Boolean       @default(true) @map("is_active")
  createdAt        DateTime      @default(now()) @map("created_at")
  updatedAt        DateTime      @updatedAt @map("updated_at")
}

model GoalSnapshot {
  id               String     @id @default(cuid())
  goalId           String     @map("goal_id")
  periodStart      DateTime   @map("period_start")
  periodEnd        DateTime   @map("period_end")
  actualAmount     Int        @map("actual_amount")
  projectedAmount  Int?       @map("projected_amount")
  progressPercent  Int        @map("progress_percent")
  status           GoalStatus
  calculatedAt     DateTime   @default(now()) @map("calculated_at")
  staleAt          DateTime?  @map("stale_at")
}
```

## Regras de negocio sugeridas

- `SAVING`: progresso calculado por `receitas - despesas` no periodo.
- `EXPENSE_LIMIT`: soma apenas despesas do escopo.
- `INCOME_TARGET`: soma apenas receitas do escopo.
- `ACCOUNT_LIMIT`: para contas `CREDIT_CARD`, deve preferir utilizacao de limite e valor da fatura aberta, nao apenas soma bruta mensal.

## Decisoes importantes para o contexto atual

- Meta por categoria deve incluir subcategorias por padrao quando a meta estiver em uma categoria pai.
- Meta de limite de cartao deve usar o dominio de fatura e limite definido em `Account`, evitando comparar cartao apenas por mes calendario.
- Metas devem filtrar sempre por `userId` e ignorar `TRANSFER`.
- Para evitar ambiguidade, metas devem guardar `name` e nao depender apenas de categoria/conta.

## Use cases recomendados

- `createGoal`
- `updateGoal`
- `archiveGoal`
- `listGoals`
- `calculateGoalProgress`
- `calculateGoalAlerts`
- `refreshGoalSnapshot`

## Estrategia de calculo e cache

Como o projeto ainda nao usa Redis nem jobs recorrentes, a opcao mais alinhada ao estado atual e cache persistido em banco:

- `GoalSnapshot` guarda o ultimo calculo por meta e periodo.
- O snapshot pode ser recalculado on-demand quando estiver ausente ou stale.
- Mutacoes em transacoes, categorias, contas e recorrencias devem invalidar snapshots afetados.
- Mais tarde, isso pode migrar para job ou cron sem quebrar a API.

## API recomendada

- `GET /api/goals`
- `POST /api/goals`
- `PATCH /api/goals/[id]`
- `DELETE /api/goals/[id]`
- `GET /api/goals/progress?month=2026-04`
- `GET /api/goals/[id]/progress?month=2026-04`

## UI recomendada

- Nova pagina `/goals` com cards de metas ativas, progresso, status e filtros por periodo.
- Widget de dashboard `goal-progress` registravel em `src/app/(app)/dashboard/widgets/registry.ts`.
- Alertas na dashboard quando uma meta atingir `warningPercent` ou `dangerPercent`.
- Barra de progresso com linguagem objetiva:
  - `Voce ja atingiu 72% da meta`
  - `Voce ja consumiu 90% do limite de Alimentacao`

## Ponto de integracao no codigo atual

- `src/hooks/use-period.ts`
- `src/app/api/analytics/summary/route.ts`
- `src/app/(app)/dashboard/page.tsx`
- `src/app/(app)/dashboard/widgets/registry.ts`
- `src/app/api/settings/reset-demo/route.ts`
- `prisma/schema.prisma`

## Ordem recomendada de implementacao

1. Extrair helper server-side de periodo e agregacoes.
2. Criar modelos `Goal` e `GoalSnapshot`.
3. Implementar use cases de CRUD e calculo.
4. Expor API de progresso por periodo.
5. Adicionar pagina dedicada.
6. Adicionar widget e alertas no dashboard.
7. Popular reset demo com 2 ou 3 metas para fortalecer portfolio.

## Riscos e cuidados

- Nao duplicar logica mensal entre dashboard, analytics e metas.
- Garantir que metas de cartao usem fatura aberta e limite real, e nao apenas uma janela mensal simplificada.
- Nao recalcular todas as metas a cada request sem snapshot, senao a dashboard vira gargalo.

## Valor para portfolio

Esse modulo conecta muito bem com o que ja existe no projeto: recorrencias, analytics, dashboard customizavel e multi-tenant. Tambem cria uma ponte forte com sua experiencia em metas no CRM, com uma narrativa tecnica facil de defender em entrevista.

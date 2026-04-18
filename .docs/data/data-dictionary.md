# [Data Area]

## Status

- [ ] Draft
- [ ] In Review
- [x] Approved

## Purpose

Documentar o schema Prisma atual do Finance Controller, explicando a responsabilidade de cada model, a semantica dos campos, ownership multi-tenant, relacionamentos, snapshots e regras de integridade praticadas hoje.

## Scope

Cobrir todos os models e enums definidos em `prisma/schema.prisma`, incluindo entidades operacionais, auth, dashboard, recorrencias, metas, billing de cartao e snapshots analiticos.

## Sources of Truth

- Spec: `.docs/future-features/16-docs-data-dictionary.md`
- Task: `.docs/tasks/phase-24-data-dictionary.md`
- ADRs:
  - `.docs/decisions/ADR-003-auth-approach.md`
  - `.docs/decisions/ADR-004-transfer-strategy.md`
  - `.docs/decisions/ADR-005-customizable-dashboard.md`
  - `.docs/decisions/ADR-006-recurring-rules.md`
  - `.docs/decisions/ADR-008-credit-card-billing-cycle.md`
  - `.docs/decisions/ADR-009-analytics-snapshot-invalidation.md`
  - `.docs/decisions/ADR-010-goal-engine.md`
  - `.docs/decisions/ADR-011-forecast-engine.md`
  - `.docs/decisions/ADR-012-financial-score.md`
  - `.docs/decisions/ADR-013-automatic-insights.md`
- Prisma schema: `prisma/schema.prisma`
- Code:
  - `src/server/modules/finance/application/analytics/`
  - `src/server/modules/finance/application/credit-card/`
  - `src/server/modules/finance/application/goals/`
  - `src/server/modules/finance/application/forecast/`
  - `src/server/modules/finance/application/score/`
  - `src/server/modules/finance/application/insights/`
  - `src/app/(app)/dashboard/widgets/registry.ts`
  - `src/app/api/recurring-rules/apply/route.ts`

## Model Summary

| Model | Responsibility | Ownership | Notes |
| ----- | -------------- | --------- | ----- |
| `User` | Identidade principal da aplicacao | Global | Raiz de quase todo o grafo de dados |
| `Session` | Sessao autenticada por token | `userId` | Auth custom server-side |
| `Account` | Conta financeira ou cartao | `userId` | `CREDIT_CARD` habilita ciclo de fatura |
| `Category` | Classificacao de receita/despesa | `userId` | Suporta hierarquia pai/filhos |
| `Transaction` | Lancamento financeiro unitario | `userId` | Inclui receitas, despesas e transferencias |
| `CreditCardStatement` | Fatura de cartao por periodo | `userId` + `accountId` | Unica por cartao + `periodStart` |
| `Dashboard` | Container do layout do dashboard | `userId` | Um dashboard por usuario |
| `DashboardWidget` | Widget posicionado no grid | Via `dashboardId` | `config` e livre; layout fica em `x/y/w/h` |
| `RecurringRule` | Regra recorrente para gerar transacoes | `userId` | Fonte de automacao manual/idempotente |
| `RecurringLog` | Historico de execucao de recorrencia | Via `recurringRuleId` | `status` e string aberta |
| `Goal` | Meta financeira declarativa | `userId` | Base do modulo de metas |
| `GoalSnapshot` | Snapshot de progresso de meta por periodo | Via `goalId` | Unico por meta + `periodStart` |
| `ForecastSnapshot` | Snapshot persistido de previsao mensal | `userId` | Usa `assumptions` em JSON |
| `FinancialScoreSnapshot` | Snapshot persistido do score mensal | `userId` | Guarda `factors` e `insights` em JSON |
| `InsightSnapshot` | Insight automatico persistido por periodo | `userId` | Dedupe por `fingerprint` |

## Enums

| Enum | Values | Meaning |
| ---- | ------ | ------- |
| `AccountType` | `WALLET`, `CHECKING`, `SAVINGS`, `CREDIT_CARD`, `INVESTMENT`, `OTHER` | Tipo funcional da conta |
| `CategoryType` | `INCOME`, `EXPENSE` | Separa categorias de receita e despesa |
| `TransactionType` | `INCOME`, `EXPENSE`, `TRANSFER` | Natureza do lancamento |
| `CreditCardStatementStatus` | `OPEN`, `CLOSED`, `PAID`, `OVERDUE` | Estado operacional da fatura |
| `RecurringFrequency` | `DAILY`, `WEEKLY`, `MONTHLY`, `YEARLY` | Frequencia da regra recorrente |
| `GoalMetric` | `SAVING`, `EXPENSE_LIMIT`, `INCOME_TARGET`, `ACCOUNT_LIMIT` | Tipo de metrica da meta |
| `GoalScopeType` | `GLOBAL`, `CATEGORY`, `ACCOUNT` | Escopo de filtragem da meta |
| `GoalPeriod` | `MONTHLY`, `YEARLY` | Periodicidade declarada da meta |
| `GoalStatus` | `ON_TRACK`, `WARNING`, `AT_RISK`, `ACHIEVED`, `EXCEEDED` | Estado calculado da meta |
| `ForecastRiskLevel` | `LOW`, `MEDIUM`, `HIGH` | Classificacao de risco do forecast |
| `FinancialScoreStatus` | `CRITICAL`, `ATTENTION`, `GOOD`, `EXCELLENT` | Faixa qualitativa do score |
| `InsightSeverity` | `INFO`, `WARNING`, `CRITICAL` | Severidade do insight automatico |

## Fields

### User

| Field | Type | Nullable | Default | Description | Rules |
| ----- | ---- | -------- | ------- | ----------- | ----- |
| `id` | `String` | No | `cuid()` | Identificador do usuario | Chave primaria |
| `email` | `String` | No | - | Login principal | Unico globalmente |
| `name` | `String` | Yes | `null` | Nome exibivel | Opcional |
| `password` | `String` | No | - | Hash da senha | Nunca armazena senha em texto puro |
| `createdAt` | `DateTime` | No | `now()` | Criacao do usuario | Mapeado para `created_at` |
| `updatedAt` | `DateTime` | No | `@updatedAt` | Ultima atualizacao | Automatica |

### Session

| Field | Type | Nullable | Default | Description | Rules |
| ----- | ---- | -------- | ------- | ----------- | ----- |
| `id` | `String` | No | `cuid()` | Identificador da sessao | Chave primaria |
| `token` | `String` | No | - | Token persistido no cookie | Unico |
| `userId` | `String` | No | - | Dono da sessao | FK para `User` |
| `expiresAt` | `DateTime` | No | - | Expiracao da sessao | Usado pela auth |
| `createdAt` | `DateTime` | No | `now()` | Criacao da sessao | Imutavel na pratica |

### Account

| Field | Type | Nullable | Default | Description | Rules |
| ----- | ---- | -------- | ------- | ----------- | ----- |
| `id` | `String` | No | `cuid()` | Identificador da conta | Chave primaria |
| `userId` | `String` | No | - | Dono da conta | FK para `User` |
| `name` | `String` | No | - | Nome exibido | Sem unicidade tecnica |
| `type` | `AccountType` | No | - | Tipo da conta | `CREDIT_CARD` ativa semantica de cartao |
| `initialBalance` | `Int` | No | `0` | Saldo inicial em centavos | Base para saldo acumulado |
| `creditLimit` | `Int` | Yes | `null` | Limite do cartao em centavos | Usado quando `type=CREDIT_CARD` |
| `statementClosingDay` | `Int` | Yes | `null` | Dia de fechamento da fatura | Relevante para cartao |
| `statementDueDay` | `Int` | Yes | `null` | Dia de vencimento da fatura | Relevante para cartao |
| `color` | `String` | Yes | `null` | Cor da conta na UI | Sem semantica de dominio |
| `icon` | `String` | Yes | `null` | Icone da conta | Sem enum no banco |
| `isArchived` | `Boolean` | No | `false` | Arquivamento logico | Nao remove historico |
| `createdAt` | `DateTime` | No | `now()` | Criacao da conta | - |
| `updatedAt` | `DateTime` | No | `@updatedAt` | Ultima atualizacao | - |

### Category

| Field | Type | Nullable | Default | Description | Rules |
| ----- | ---- | -------- | ------- | ----------- | ----- |
| `id` | `String` | No | `cuid()` | Identificador da categoria | Chave primaria |
| `userId` | `String` | No | - | Dono da categoria | FK para `User` |
| `name` | `String` | No | - | Nome da categoria | Sem unicidade tecnica |
| `type` | `CategoryType` | No | - | Receita ou despesa | Hierarquia respeita o tipo na camada HTTP |
| `icon` | `String` | Yes | `null` | Icone visual | Opcional |
| `color` | `String` | Yes | `null` | Cor visual | Opcional |
| `parentId` | `String` | Yes | `null` | Categoria pai | FK autorreferente |
| `createdAt` | `DateTime` | No | `now()` | Criacao | - |
| `updatedAt` | `DateTime` | No | `@updatedAt` | Atualizacao | - |

### Transaction

| Field | Type | Nullable | Default | Description | Rules |
| ----- | ---- | -------- | ------- | ----------- | ----- |
| `id` | `String` | No | `cuid()` | Identificador da transacao | Chave primaria |
| `userId` | `String` | No | - | Dono da transacao | FK para `User` |
| `accountId` | `String` | No | - | Conta impactada | FK para `Account` |
| `categoryId` | `String` | Yes | `null` | Categoria do lancamento | FK opcional para `Category` |
| `creditCardStatementId` | `String` | Yes | `null` | Fatura associada | FK opcional para `CreditCardStatement` |
| `type` | `TransactionType` | No | - | Receita, despesa ou transferencia | Transferencias usam duas linhas ligadas |
| `amount` | `Int` | No | - | Valor em centavos | Convencao do sistema e inteiro positivo |
| `description` | `String` | No | - | Descricao do lancamento | Campo obrigatorio |
| `notes` | `String` | Yes | `null` | Observacoes livres | Opcional |
| `date` | `DateTime` | No | - | Data de competencia | Base de filtros e analytics |
| `transferId` | `String` | Yes | `null` | Agrupador de dupla de transferencia | Nao e FK formal |
| `createdAt` | `DateTime` | No | `now()` | Criacao | - |
| `updatedAt` | `DateTime` | No | `@updatedAt` | Atualizacao | - |

### CreditCardStatement

| Field | Type | Nullable | Default | Description | Rules |
| ----- | ---- | -------- | ------- | ----------- | ----- |
| `id` | `String` | No | `cuid()` | Identificador da fatura | Chave primaria |
| `userId` | `String` | No | - | Dono da fatura | FK para `User` |
| `accountId` | `String` | No | - | Cartao da fatura | FK para `Account` |
| `periodStart` | `DateTime` | No | - | Inicio do ciclo | Participa da unicidade |
| `periodEnd` | `DateTime` | No | - | Fim do ciclo | - |
| `closingDate` | `DateTime` | No | - | Data de fechamento | Derivada da configuracao do cartao |
| `dueDate` | `DateTime` | No | - | Data de vencimento | - |
| `totalAmount` | `Int` | No | `0` | Total da fatura em centavos | Atualizado por sync |
| `paidAmount` | `Int` | No | `0` | Total pago em centavos | Atualizado por pagamentos |
| `status` | `CreditCardStatementStatus` | No | `OPEN` | Estado atual da fatura | Pode virar `OVERDUE` ou `PAID` |
| `createdAt` | `DateTime` | No | `now()` | Criacao | - |
| `updatedAt` | `DateTime` | No | `@updatedAt` | Atualizacao | - |

### Dashboard

| Field | Type | Nullable | Default | Description | Rules |
| ----- | ---- | -------- | ------- | ----------- | ----- |
| `id` | `String` | No | `cuid()` | Identificador do dashboard | Chave primaria |
| `userId` | `String` | No | - | Dono do dashboard | Unico; um dashboard por usuario |
| `createdAt` | `DateTime` | No | `now()` | Criacao | - |
| `updatedAt` | `DateTime` | No | `@updatedAt` | Atualizacao | - |

### DashboardWidget

| Field | Type | Nullable | Default | Description | Rules |
| ----- | ---- | -------- | ------- | ----------- | ----- |
| `id` | `String` | No | `cuid()` | Identificador do widget | Chave primaria |
| `dashboardId` | `String` | No | - | Dashboard pai | FK para `Dashboard` |
| `type` | `String` | No | - | Tipo de widget | Tipos praticados no registry da UI |
| `config` | `Json` | No | `"{}"` | Configuracao especifica do widget | Shape livre hoje |
| `x` | `Int` | No | `0` | Coluna inicial no grid | Persistencia de layout |
| `y` | `Int` | No | `0` | Linha inicial no grid | Persistencia de layout |
| `w` | `Int` | No | `6` | Largura no grid | Persistencia de layout |
| `h` | `Int` | No | `4` | Altura no grid | Persistencia de layout |
| `createdAt` | `DateTime` | No | `now()` | Criacao | - |

### RecurringRule

| Field | Type | Nullable | Default | Description | Rules |
| ----- | ---- | -------- | ------- | ----------- | ----- |
| `id` | `String` | No | `cuid()` | Identificador da regra | Chave primaria |
| `userId` | `String` | No | - | Dono da regra | FK para `User` |
| `accountId` | `String` | No | - | Conta alvo da transacao gerada | FK para `Account` |
| `categoryId` | `String` | Yes | `null` | Categoria da transacao gerada | FK opcional |
| `type` | `TransactionType` | No | - | Tipo da transacao gerada | Na pratica usado para receita/despesa |
| `amount` | `Int` | No | - | Valor em centavos | Inteiro positivo esperado pela API |
| `description` | `String` | No | - | Descricao padrao | Copiada para a transacao |
| `notes` | `String` | Yes | `null` | Observacoes padrao | Copiadas para a transacao |
| `frequency` | `RecurringFrequency` | No | - | Frequencia da regra | Interpreta `dayOfMonth`/`dayOfWeek` |
| `dayOfMonth` | `Int` | Yes | `null` | Dia do mes | Relevante para `MONTHLY`/`YEARLY` |
| `dayOfWeek` | `Int` | Yes | `null` | Dia da semana | Relevante para `WEEKLY` |
| `startDate` | `DateTime` | No | - | Inicio de vigencia | - |
| `endDate` | `DateTime` | Yes | `null` | Fim de vigencia | Opcional |
| `isActive` | `Boolean` | No | `true` | Ativacao da regra | Permite pausar sem excluir |
| `lastApplied` | `DateTime` | Yes | `null` | Ultima aplicacao processada | Ajuda na idempotencia operacional |
| `createdAt` | `DateTime` | No | `now()` | Criacao | - |
| `updatedAt` | `DateTime` | No | `@updatedAt` | Atualizacao | - |

### RecurringLog

| Field | Type | Nullable | Default | Description | Rules |
| ----- | ---- | -------- | ------- | ----------- | ----- |
| `id` | `String` | No | `cuid()` | Identificador do log | Chave primaria |
| `recurringRuleId` | `String` | No | - | Regra executada | FK para `RecurringRule` |
| `transactionId` | `String` | Yes | `null` | Transacao criada, quando houve sucesso | Nao e FK formal no schema atual |
| `appliedDate` | `DateTime` | No | - | Data de competencia aplicada | Base da idempotencia historica |
| `status` | `String` | No | - | Resultado da execucao | Valores observados hoje: `success`, `error` |
| `error` | `String` | Yes | `null` | Mensagem de falha | Preenchido em erro |
| `createdAt` | `DateTime` | No | `now()` | Criacao do log | - |

### Goal

| Field | Type | Nullable | Default | Description | Rules |
| ----- | ---- | -------- | ------- | ----------- | ----- |
| `id` | `String` | No | `cuid()` | Identificador da meta | Chave primaria |
| `userId` | `String` | No | - | Dono da meta | FK para `User` |
| `name` | `String` | No | - | Nome da meta | Campo exibido na UI |
| `description` | `String` | Yes | `null` | Descricao auxiliar | Opcional |
| `metric` | `GoalMetric` | No | - | Tipo de avaliacao | Define a formula de progresso |
| `scopeType` | `GoalScopeType` | No | `GLOBAL` | Escopo de filtragem | Pode combinar com `categoryId` ou `accountId` |
| `categoryId` | `String` | Yes | `null` | Categoria alvo | Opcional; usada em certos escopos |
| `accountId` | `String` | Yes | `null` | Conta alvo | Opcional; usada em certos escopos |
| `targetAmount` | `Int` | No | - | Valor alvo em centavos | Campo central da meta |
| `period` | `GoalPeriod` | No | `MONTHLY` | Periodicidade declarada | Hoje o calculo usa resolucao mensal |
| `warningPercent` | `Int` | No | `80` | Limiar intermediario | Deve ser menor que `dangerPercent` na criacao |
| `dangerPercent` | `Int` | No | `95` | Limiar critico | Maior que `warningPercent` na criacao |
| `isActive` | `Boolean` | No | `true` | Arquivamento logico | `DELETE` da API seta `false` |
| `createdAt` | `DateTime` | No | `now()` | Criacao | - |
| `updatedAt` | `DateTime` | No | `@updatedAt` | Atualizacao | - |

### GoalSnapshot

| Field | Type | Nullable | Default | Description | Rules |
| ----- | ---- | -------- | ------- | ----------- | ----- |
| `id` | `String` | No | `cuid()` | Identificador do snapshot | Chave primaria |
| `goalId` | `String` | No | - | Meta referenciada | FK para `Goal` |
| `periodStart` | `DateTime` | No | - | Inicio do periodo calculado | Unico com `goalId` |
| `periodEnd` | `DateTime` | No | - | Fim do periodo calculado | - |
| `actualAmount` | `Int` | No | - | Valor realizado | Em centavos |
| `projectedAmount` | `Int` | No | - | Projecao de fechamento | Em centavos |
| `progressPercent` | `Int` | No | - | Progresso percentual | Inteiro arredondado |
| `status` | `GoalStatus` | No | - | Estado calculado | Derivado do motor de metas |
| `calculatedAt` | `DateTime` | No | `now()` | Momento do calculo persistido | Atualizado no upsert |

### ForecastSnapshot

| Field | Type | Nullable | Default | Description | Rules |
| ----- | ---- | -------- | ------- | ----------- | ----- |
| `id` | `String` | No | `cuid()` | Identificador do snapshot | Chave primaria |
| `userId` | `String` | No | - | Dono do snapshot | FK para `User` |
| `periodStart` | `DateTime` | No | - | Inicio do mes analisado | Unico com `userId` |
| `periodEnd` | `DateTime` | No | - | Fim do mes analisado | - |
| `referenceDate` | `DateTime` | No | - | Data de referencia do calculo | Base para on-demand vs persistido |
| `actualIncome` | `Int` | No | - | Receitas realizadas | Em centavos |
| `actualExpenses` | `Int` | No | - | Despesas realizadas | Em centavos |
| `projectedRecurringIncome` | `Int` | No | - | Receita recorrente projetada | Em centavos |
| `projectedRecurringExpenses` | `Int` | No | - | Despesa recorrente projetada | Em centavos |
| `projectedVariableIncome` | `Int` | No | - | Receita variavel projetada | Em centavos |
| `projectedVariableExpenses` | `Int` | No | - | Despesa variavel projetada | Em centavos |
| `predictedBalance` | `Int` | No | - | Saldo previsto de fechamento | Em centavos |
| `riskLevel` | `ForecastRiskLevel` | No | - | Risco sintetico do forecast | `LOW`, `MEDIUM`, `HIGH` |
| `assumptions` | `Json` | No | - | Trilhas das premissas usadas | Shape atual: array de `{ label, amount, kind }` |
| `calculatedAt` | `DateTime` | No | `now()` | Momento do calculo persistido | Atualizado no upsert |
| `staleAt` | `DateTime` | Yes | `null` | Marcador de obsolescencia | Usado pela invalidacao de analytics |

### FinancialScoreSnapshot

| Field | Type | Nullable | Default | Description | Rules |
| ----- | ---- | -------- | ------- | ----------- | ----- |
| `id` | `String` | No | `cuid()` | Identificador do snapshot | Chave primaria |
| `userId` | `String` | No | - | Dono do snapshot | FK para `User` |
| `periodStart` | `DateTime` | No | - | Inicio do periodo | Unico com `userId` |
| `periodEnd` | `DateTime` | No | - | Fim do periodo | - |
| `score` | `Int` | No | - | Score 0-100 | Valor final consolidado |
| `status` | `FinancialScoreStatus` | No | - | Faixa qualitativa | Derivada do score |
| `factors` | `Json` | No | - | Breakdown do score | Shape atual: array de `ScoreFactor` |
| `insights` | `Json` | No | - | Insights textuais do score | Shape atual: array de `ScoreInsight` |
| `calculatedAt` | `DateTime` | No | `now()` | Momento do calculo persistido | Atualizado no upsert |
| `staleAt` | `DateTime` | Yes | `null` | Marcador de obsolescencia | Usado pela invalidacao |

### InsightSnapshot

| Field | Type | Nullable | Default | Description | Rules |
| ----- | ---- | -------- | ------- | ----------- | ----- |
| `id` | `String` | No | `cuid()` | Identificador do insight persistido | Chave primaria |
| `userId` | `String` | No | - | Dono do insight | FK para `User` |
| `key` | `String` | No | - | Tipo logico do insight | Exemplos: `goal_at_risk`, `forecast_negative` |
| `title` | `String` | No | - | Titulo curto | Exibido no feed |
| `body` | `String` | No | - | Texto explicativo | Exibido no feed |
| `severity` | `InsightSeverity` | No | - | Severidade do insight | `INFO`, `WARNING`, `CRITICAL` |
| `scopeType` | `String` | No | - | Escopo do insight | Valores observados: `global`, `category`, `account`, `goal`, `forecast`, `statement` |
| `scopeId` | `String` | Yes | `null` | Entidade alvo do insight | Opcional |
| `cta` | `Json` | Yes | `null` | Chamada para acao | Shape atual: `{ label, action, href? }` |
| `payload` | `Json` | No | - | Contexto estruturado da regra | Shape depende da heuristica |
| `periodStart` | `DateTime` | No | - | Inicio do periodo do insight | Participa da unicidade |
| `periodEnd` | `DateTime` | No | - | Fim do periodo do insight | - |
| `fingerprint` | `String` | No | - | Identificador de dedupe | Unico com `userId` + `periodStart` |
| `isDismissed` | `Boolean` | No | `false` | Dismiss persistente | Preservado em recalculos |
| `priority` | `Int` | No | `0` | Prioridade relativa | Usado para ordenacao/dedupe |
| `createdAt` | `DateTime` | No | `now()` | Criacao do snapshot | Nao ha `updatedAt` |

## Relationships

| Relation | Type | Description | Invariants |
| -------- | ---- | ----------- | ---------- |
| `User -> Session` | 1:N | Um usuario pode ter varias sessoes | `Session` e apagada em cascade com `User` |
| `User -> Account` | 1:N | Um usuario possui varias contas | Toda conta pertence a um unico usuario |
| `User -> Category` | 1:N | Um usuario possui varias categorias | Hierarquia nao cruza usuarios |
| `Category -> Category` | 1:N autorreferente | Categoria pode ter subcategorias | `parentId` vira `null` em delete do pai |
| `User -> Transaction` | 1:N | Usuario possui transacoes | Toda query financeira deve filtrar `userId` |
| `Account -> Transaction` | 1:N | Conta acumula transacoes | Delete da conta apaga transacoes em cascade |
| `Category -> Transaction` | 1:N opcional | Categoria classifica a transacao | Delete da categoria faz `SetNull` |
| `CreditCardStatement -> Transaction` | 1:N opcional | Fatura agrupa compras de cartao | Delete da fatura faz `SetNull` nas transacoes |
| `User -> CreditCardStatement` | 1:N | Usuario possui faturas | Uma fatura sempre pertence a um usuario e conta |
| `User -> Dashboard` | 1:1 | Usuario tem um dashboard principal | `userId` e unico em `Dashboard` |
| `Dashboard -> DashboardWidget` | 1:N | Dashboard possui widgets posicionados | Delete do dashboard apaga widgets em cascade |
| `User -> RecurringRule` | 1:N | Usuario possui regras recorrentes | Regra referencia conta e categoria do usuario |
| `RecurringRule -> RecurringLog` | 1:N | Cada aplicacao gera logs | Delete da regra apaga logs em cascade |
| `User -> Goal` | 1:N | Usuario possui metas | Meta pode apontar conta/categoria opcionais |
| `Goal -> GoalSnapshot` | 1:N | Snapshot historico de progresso | Unico por meta + periodo |
| `User -> ForecastSnapshot` | 1:N | Historico de previsao mensal | Unico por usuario + periodo |
| `User -> FinancialScoreSnapshot` | 1:N | Historico de score mensal | Unico por usuario + periodo |
| `User -> InsightSnapshot` | 1:N | Feed persistido de insights | Unico por usuario + periodo + fingerprint |

## Lifecycle

- `User`: criado no cadastro; atualizado quando nome ou credenciais mudam; delete em cascade elimina quase todo o grafo relacionado.
- `Session`: criada no login; removida no logout ou por limpeza/expiracao.
- `Account`: criada manualmente; pode ser arquivada por `isArchived`; historico de transacoes permanece.
- `Category`: criada manualmente; pode ser atualizada e removida, com protecoes na camada HTTP quando ha dependencias.
- `Transaction`: criada manualmente, por transferencia, por pagamento de fatura ou por aplicacao de recorrencia; pode ser editada ou removida; impacta analytics e billing.
- `CreditCardStatement`: criada/sincronizada pelo motor de cartao; status muda ao fechar, vencer ou quitar.
- `Dashboard`: criado sob demanda para o usuario; serve de container para widgets.
- `DashboardWidget`: criado/removido conforme customizacao do dashboard; layout e persistido.
- `RecurringRule`: criada e editada manualmente; aplicada sob demanda; pode ser pausada por `isActive`.
- `RecurringLog`: criado a cada tentativa relevante de aplicar recorrencia; registra sucesso ou erro.
- `Goal`: criada manualmente; `DELETE` da API arquiva via `isActive=false`; progresso pode ser calculado on-demand ou persistido em snapshot.
- `GoalSnapshot`: criado/atualizado por `refreshGoalSnapshot`; nao e lido diretamente pelas rotas principais de goals hoje.
- `ForecastSnapshot`: criado/atualizado por `refreshForecastSnapshot`; `staleAt` marca snapshot potencialmente invalido.
- `FinancialScoreSnapshot`: criado/atualizado por `calculateFinancialScore(..., persist=true)`; `staleAt` marca obsolescencia.
- `InsightSnapshot`: upsertado por `refreshInsightSnapshots`; dismiss sobrevive a recalculos; registros obsoletos nao dismissados podem ser removidos.

## Integrity Rules

- Todos os valores monetarios sao armazenados em centavos (`Int`), sem decimal no banco.
- Quase todas as tabelas financeiras sao multi-tenant por `userId`; excecoes derivadas usam ownership transitivo, como `DashboardWidget`, `RecurringLog` e `GoalSnapshot`.
- `Dashboard.userId` e unico, garantindo um dashboard por usuario.
- `CreditCardStatement` e unica por `accountId + periodStart`.
- `GoalSnapshot` e unico por `goalId + periodStart`.
- `ForecastSnapshot` e unico por `userId + periodStart`.
- `FinancialScoreSnapshot` e unico por `userId + periodStart`.
- `InsightSnapshot` e unico por `userId + periodStart + fingerprint`.
- `Transaction.transferId` nao impõe integridade referencial; o par de transferencia e uma convencao de aplicacao.
- `RecurringLog.transactionId` nao e FK formal; e apenas referencia textual ao registro criado.
- `InsightSnapshot.scopeType` e `DashboardWidget.type` sao `String` abertas no banco; a lista valida e imposta pela aplicacao, nao pelo schema Prisma.
- `Goal.period` permite `MONTHLY` e `YEARLY`, mas parte do motor atual de progresso opera sempre sobre janelas resolvidas por mes.

## Multi-tenant and Access Rules

- Ownership boundary: `User` e a raiz de ownership direto.
- Required filters: queries de contas, categorias, transacoes, faturas, recorrencias, metas e snapshots por usuario devem sempre filtrar `userId`.
- Transitive ownership: `DashboardWidget` pertence ao usuario atraves de `Dashboard`; `RecurringLog` atraves de `RecurringRule`; `GoalSnapshot` atraves de `Goal`.
- Cross-user protections: as rotas HTTP normalmente validam `userId` no `where`, mas nem todo FK opcional recebido por payload passa por cheque explicito antes de persistir.

## Derived Data and Snapshots

- `CreditCardStatement.totalAmount`, `paidAmount` e `status` sao derivados do ciclo de fatura e dos pagamentos.
- `GoalSnapshot` materializa progresso, projecao, percentual e status por meta/periodo.
- `ForecastSnapshot.assumptions` guarda a trilha das premissas do forecast no shape atual `ForecastAssumption[]`.
- `FinancialScoreSnapshot.factors` guarda o breakdown dos fatores no shape atual `ScoreFactor[]`.
- `FinancialScoreSnapshot.insights` guarda insights resumidos do score no shape atual `ScoreInsight[]`.
- `InsightSnapshot.cta` guarda a CTA opcional do insight; `payload` guarda contexto tecnico da heuristica que originou o registro.
- `staleAt` em forecast e score funciona como marcador de invalidez, nao como TTL automatico de expiracao.

## Query Patterns

- `Transaction`: consultas por `userId`, `accountId`, `categoryId`, `date`, `transferId` e `creditCardStatementId`.
- `CreditCardStatement`: consultas por `userId`, `accountId`, `dueDate` e status operacional.
- `Goal`: listagens por `userId + isActive`; calculo de progresso pode expandir subcategorias e olhar transacoes/faturas.
- `DashboardWidget`: consulta por `dashboardId` para reconstruir o layout.
- `RecurringLog`: consulta por `recurringRuleId` e `appliedDate` para suportar apply idempotente.
- Snapshots analiticos: acesso por `userId + periodStart`, com invalidação desacoplada por tags.

## Migration Notes

- O documento representa o schema atual e suas dividas tecnicas conhecidas, sem propor renomear tabelas nem normalizar colunas abertas.
- Existe uma pasta `src/server/modules/finance/infra/`, mas a semantica principal do dicionario hoje deriva do `prisma/schema.prisma` e dos use cases que operam sobre ele.

## Open Questions

- `DashboardWidget.type` deveria virar enum persistido para evitar tipos invalidos no banco.
- `RecurringLog.status` deveria virar enum formal para impedir valores arbitrarios.
- `Transaction.transferId` e `RecurringLog.transactionId` deveriam virar relacoes formais para aumentar integridade.
- O banco deveria reforcar ownership de FKs opcionais entre entidades do mesmo usuario, reduzindo dependencia de validacoes na camada HTTP.

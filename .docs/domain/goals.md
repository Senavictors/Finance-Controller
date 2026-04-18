# Goals

## Status

- [ ] Draft
- [ ] In Review
- [x] Approved

## Purpose

Formalizar o dominio de metas financeiras do Finance Controller, explicando como uma meta e representada, quais estados ela pode assumir, como o produto interpreta seu progresso e quais invariantes de negocio valem hoje na implementacao.

## Scope

Este documento cobre:

- os agregados `Goal` e `GoalSnapshot`
- metricas, escopos, periodos e status do dominio
- regras de ownership e multi-tenant
- a interpretacao de progresso em nivel de negocio
- relacao com categorias, contas e cartao de credito

Este documento nao cobre o contrato HTTP detalhado da API nem o deep dive completo do algoritmo de calculo; isso fica para as fases posteriores do backlog documental.

## Sources of Truth

- Spec: [Docs - Domain Goals](../future-features/06-docs-domain-goals.md)
- Task: [Phase 14 - Domain Docs: Goals](../tasks/phase-14-domain-goals.md)
- ADRs: [ADR-010 Goal Engine](../decisions/ADR-010-goal-engine.md)
- Code:
  - `prisma/schema.prisma`
  - `src/server/modules/finance/application/goals/calculate-progress.ts`
  - `src/server/modules/finance/application/goals/use-cases.ts`
  - `src/server/modules/finance/application/goals/types.ts`
  - `src/server/modules/finance/http/schemas.ts`
- APIs:
  - `src/app/api/goals/route.ts`
  - `src/app/api/goals/[id]/route.ts`

## Business Context

O modulo de metas existe para transformar objetivos financeiros em acompanhamento operacional dentro do produto. Em vez de o usuario apenas registrar transacoes, o sistema passa a responder perguntas como:

- estou economizando no ritmo esperado?
- ja consumi meu limite de gasto desta categoria?
- minha receita do mes esta suficiente para a meta?
- quanto do limite do cartao ou da conta ainda esta disponivel?

O valor do modulo vem de combinar uma definicao persistida de meta com um resultado derivado de progresso para um periodo. Essa separacao permite reutilizar a mesma regra em pagina dedicada, dashboard e futuros motores de analytics/insights.

## Core Concepts

| Concept | Description | Notes |
| ------- | ----------- | ----- |
| Goal | Definicao persistida de uma meta financeira do usuario | Guarda regra base, escopo, limiares e alvo |
| GoalSnapshot | Registro persistido do ultimo calculo de uma meta para um periodo | Serve como trilha auditavel e base futura de cache |
| Goal metric | Natureza da meta | Define como o sistema interpreta “melhor” ou “pior” desempenho |
| Goal scope | Recorte do universo observado | Pode ser global, por categoria ou por conta |
| Progress result | Resultado derivado retornado pelo calculo | Inclui `actualAmount`, `projectedAmount`, `progressPercent`, `status` e `alerts` |
| Limit metric | Metricas em que menor consumo e melhor | `EXPENSE_LIMIT` e `ACCOUNT_LIMIT` |
| Achievement metric | Metricas em que maior acumulado e melhor | `SAVING` e `INCOME_TARGET` |

## Types and Entities

| Item | Kind | Description | Notes |
| ---- | ---- | ----------- | ----- |
| `Goal` | Prisma model | Meta persistida do usuario | Soft-delete via `isActive = false` |
| `GoalSnapshot` | Prisma model | Foto do progresso da meta por periodo | `@@unique([goalId, periodStart])` |
| `GoalMetric` | Enum | Tipo de meta | `SAVING`, `EXPENSE_LIMIT`, `INCOME_TARGET`, `ACCOUNT_LIMIT` |
| `GoalScopeType` | Enum | Escopo da meta | `GLOBAL`, `CATEGORY`, `ACCOUNT` |
| `GoalPeriod` | Enum | Periodicidade declarada da meta | Schema aceita `MONTHLY` e `YEARLY`; calculo atual opera com janela mensal |
| `GoalStatus` | Enum | Situacao do progresso | `ON_TRACK`, `WARNING`, `AT_RISK`, `ACHIEVED`, `EXCEEDED` |
| `GoalProgressResult` | Application DTO | Visao calculada da meta para um periodo | E o shape consumido pela UI e pelo `GET /api/goals` |

## States

| State | Meaning | Entry Condition | Exit Condition |
| ----- | ------- | --------------- | -------------- |
| `ON_TRACK` | Meta esta em ritmo saudavel | Metricas de limite abaixo dos limiares; metas de acumulacao em ritmo suficiente | Pode migrar para `WARNING`, `AT_RISK`, `ACHIEVED` ou `EXCEEDED` conforme calculo |
| `WARNING` | Meta exige atencao, mas ainda nao esta no pior estado | Para limite: consumo acima de `warningPercent`; para acumulacao: progresso entre `warningPercent` e `dangerPercent` | Pode voltar para `ON_TRACK`, cair para `AT_RISK` ou subir para `ACHIEVED` |
| `AT_RISK` | Meta de acumulacao esta atrasada ou meta de limite esta muito proxima de romper | Para limite: consumo acima de `dangerPercent`; para acumulacao: progresso abaixo de `warningPercent` | Pode voltar para `WARNING` ou `ON_TRACK`, ou migrar para `EXCEEDED`/`ACHIEVED` |
| `ACHIEVED` | Meta de acumulacao atingiu ou ultrapassou o alvo | `SAVING` ou `INCOME_TARGET` com percentual >= 100 | Pode sair desse estado em recalculos futuros do periodo corrente, se o resultado projetado cair abaixo do alvo |
| `EXCEEDED` | Meta de limite foi ultrapassada | `EXPENSE_LIMIT` ou `ACCOUNT_LIMIT` com percentual >= 100 | Pode sair desse estado em recalculos futuros somente se o valor observado cair, como no caso de pagamento de fatura/cartao |

## Business Rules

1. Toda meta pertence a um unico `userId`, e qualquer leitura ou mutacao deve respeitar essa fronteira de ownership.
2. O produto trata metas ativas como o conjunto oficial de acompanhamento; metas arquivadas deixam de aparecer em listagens usuais, mas nao sao removidas fisicamente.
3. `ACCOUNT_LIMIT` sempre exige `accountId`, mesmo quando o `scopeType` nao e explicitamente `ACCOUNT`.
4. `CATEGORY` exige `categoryId`; `ACCOUNT` exige `accountId`.
5. `warningPercent` precisa ser estritamente menor que `dangerPercent`.
6. Transferencias nao entram em calculos de meta, porque o modulo observa apenas transacoes `INCOME` e `EXPENSE`.
7. Metas por categoria incluem a categoria alvo e todas as suas subcategorias descendentes.
8. Metas `ACCOUNT_LIMIT` ligadas a conta de cartao priorizam a fatura em aberto, e nao apenas a soma bruta do mes calendario.
9. Metas `SAVING` nunca retornam valor negativo de progresso; se despesas superarem receitas, o valor observado e truncado para zero.
10. O progresso retornado ao produto pode usar valor projetado para o periodo corrente ao determinar status, mas `progressPercent` continua sendo baseado no valor atual realizado.
11. Embora o schema permita `GoalPeriod.YEARLY`, o calculo atual de progresso usa uma janela mensal derivada de `resolveMonthPeriod`; portanto, o comportamento efetivamente implementado hoje e mensal.
12. O `metric` da meta e imutavel na atual superficie de update; a atualizacao permite ajustar detalhes da meta, mas nao trocar sua natureza.

## Formulas and Calculations

| Name | Formula or Logic | Inputs | Output | Notes |
| ---- | ---------------- | ------ | ------ | ----- |
| Saving actual | `max(totalIncome - totalExpense, 0)` | Receitas e despesas do usuario no periodo | `actualAmount` | Ignora transferencias |
| Expense limit actual | Soma de despesas do periodo dentro do escopo | Tipo `EXPENSE`, escopo global/categoria/conta | `actualAmount` | Categoria inclui descendentes |
| Income target actual | Soma de receitas do periodo dentro do escopo | Tipo `INCOME`, escopo global/categoria/conta | `actualAmount` | Categoria inclui descendentes |
| Account limit actual (credit card) | `max(statement.totalAmount - statement.paidAmount, 0)` | Fatura aberta do cartao | `actualAmount` | Usa a primeira fatura nao paga com `dueDate >= periodStart` |
| Account limit actual (non credit card) | Soma das despesas da conta no periodo | Conta e transacoes `EXPENSE` | `actualAmount` | Nao usa saldo da conta, usa gasto associado a ela |
| Projected amount | Projecao linear do valor atual no periodo | `actualAmount`, `periodStart`, `periodEnd`, `now` | `projectedAmount` | Serve para status no periodo corrente |
| Progress percent | `round((actualAmount / targetAmount) * 100)` | Atual e alvo | `progressPercent` | Se alvo <= 0, retorna `0` |
| Limit status | Compara percentual do valor observado/projetado com `warningPercent`, `dangerPercent` e `100%` | Meta de limite | `GoalStatus` | Menor consumo e melhor |
| Achievement status | Compara percentual do valor observado/projetado com `warningPercent`, `dangerPercent` e `100%` | Meta de acumulacao | `GoalStatus` | Maior acumulado e melhor |

## Invariants

- Todo `Goal` pertence a um unico usuario e nao pode ser lido por outro.
- `GoalSnapshot` sempre referencia um `Goal` valido.
- So pode existir um snapshot por `goalId` e `periodStart`.
- `targetAmount` deve ser inteiro positivo em centavos.
- O dominio usa centavos como unidade monetaria em todos os valores.
- Listagens usuais retornam apenas metas com `isActive = true`.
- Para `scopeType = CATEGORY`, `categoryId` nao pode faltar.
- Para `scopeType = ACCOUNT` e para `metric = ACCOUNT_LIMIT`, `accountId` nao pode faltar.
- O limiar de aviso nunca pode ser maior ou igual ao de perigo.

## Edge Cases

- `GoalPeriod.YEARLY` existe no schema, mas a implementacao atual calcula progresso em janela mensal; isso deve ser tratado como limitacao conhecida, nao como comportamento suportado.
- `ACCOUNT_LIMIT` de cartao sem fatura em aberto retorna `actualAmount = 0`.
- `SAVING` em periodo com despesas maiores que receitas nao retorna valor negativo; fica em zero.
- `progressPercent` pode ser baixo enquanto o `status` ja indica `ON_TRACK` ou `EXCEEDED`, porque o status do periodo corrente usa `projectedAmount`.
- Em meta de limite, `EXCEEDED` pode regredir apos pagamento de fatura ou ajuste que reduza o valor observado.
- Se categoria ou conta associada forem removidas, o relacionamento em `Goal` vira `null` no banco (`SetNull`), mas a meta continua existindo e precisa ser tratada operacionalmente.

## Examples

### Example 1 - Meta global de economia mensal

- Input:
  - `metric = SAVING`
  - `scopeType = GLOBAL`
  - `targetAmount = 100000`
  - receitas do periodo = `320000`
  - despesas do periodo = `250000`
- Expected result:
  - `actualAmount = 70000`
  - `progressPercent = 70`
  - status tende a `AT_RISK` ou `WARNING` dependendo da projecao e do momento do mes
- Notes:
  - se as despesas fossem `340000`, o `actualAmount` seria `0`, nao `-20000`

### Example 2 - Limite de gasto por categoria pai

- Input:
  - `metric = EXPENSE_LIMIT`
  - `scopeType = CATEGORY`
  - categoria alvo = `Alimentacao`
  - subcategorias = `Mercado`, `Restaurantes`
  - `targetAmount = 80000`
- Expected result:
  - o calculo considera despesas da categoria pai e das subcategorias descendentes
- Notes:
  - isso evita que o usuario burle a meta apenas registrando o gasto em uma subcategoria

### Example 3 - Limite de cartao usando fatura em aberto

- Input:
  - `metric = ACCOUNT_LIMIT`
  - conta = cartao de credito
  - fatura em aberto = `150000`
  - pago ate agora = `20000`
  - `targetAmount = 180000`
- Expected result:
  - `actualAmount = 130000`
  - o sistema compara o saldo em aberto da fatura com o alvo da meta
- Notes:
  - a meta olha para cobranca real do cartao, nao apenas para despesas do mes

## Operational Notes

- Multi-tenant considerations:
  - toda leitura e mutacao valida `userId`
  - categorias, contas, metas e snapshots vivem no contexto de um unico usuario
- Snapshot or cache implications:
  - `refreshGoalSnapshot` persiste o resultado calculado por periodo
  - a API e a UI de metas atuais calculam progresso sob demanda; snapshots existem como trilha auditavel e base futura de cache
- Failure or fallback behavior:
  - metas inexistentes retornam erro de dominio `Meta nao encontrada`
  - inputs invalidos sao barrados na camada Zod antes da persistencia
  - ausencia de fatura aberta ou ausencia de transacoes apenas reduz o observado para zero; nao gera erro de dominio

## Related Decisions

- ADR: [ADR-010 Goal Engine](../decisions/ADR-010-goal-engine.md)

## Open Questions

- `GoalPeriod.YEARLY` deve ser efetivamente suportado no calculo e na UI, ou removido do dominio ate haver implementacao completa?
- O snapshot de metas deve se tornar fonte primaria de leitura em algum ponto, ou continuar apenas como trilha auditavel/cache auxiliar?
- A exclusao logica via `isActive` precisa de documentacao futura sobre reativacao, ou o produto vai manter apenas fluxo de arquivamento?

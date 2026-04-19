# [API Surface]

## Status

- [ ] Draft
- [ ] In Review
- [x] Approved

## Purpose

Documentar a superficie HTTP real do modulo de metas, cobrindo criacao, listagem, leitura individual de progresso, atualizacao e arquivamento.

## Scope

Cobrir `GET/POST /api/goals`, `GET/PATCH/DELETE /api/goals/[id]`, validacoes Zod expostas pela camada HTTP, regras de autenticacao/ownership, formatos de resposta e diferencas entre contrato HTTP e regras calculadas no dominio de metas.

## Sources of Truth

- Spec: `.docs/future-features/15-docs-api-goals.md`
- Task: `.docs/tasks/phase-23-api-goals.md`
- ADRs: `.docs/decisions/ADR-009-analytics-snapshot-invalidation.md`, `.docs/decisions/ADR-010-goal-engine.md`
- Code:
  - `src/app/api/goals/route.ts`
  - `src/app/api/goals/[id]/route.ts`
  - `src/server/modules/finance/http/schemas.ts`
  - `src/server/modules/finance/application/goals/use-cases.ts`
  - `src/server/modules/finance/application/goals/calculate-progress.ts`
  - `src/server/modules/finance/application/analytics/invalidation.ts`

## Module Summary

| Endpoint          | Method   | Purpose                                                         | Auth             | Notes                                           |
| ----------------- | -------- | --------------------------------------------------------------- | ---------------- | ----------------------------------------------- |
| `/api/goals`      | `GET`    | Lista metas ativas do usuario com progresso calculado on-demand | Session required | Aceita `month=YYYY-MM` opcional                 |
| `/api/goals`      | `POST`   | Cria uma nova meta                                              | Session required | Valida escopo, limites e metrica                |
| `/api/goals/[id]` | `GET`    | Retorna o progresso calculado de uma meta especifica            | Session required | Existe hoje mesmo sem destaque na spec da phase |
| `/api/goals/[id]` | `PATCH`  | Atualiza campos editaveis da meta                               | Session required | `metric` nao pode ser alterada                  |
| `/api/goals/[id]` | `DELETE` | Arquiva a meta                                                  | Session required | Soft delete via `isActive: false`               |

## Authentication and Authorization

- Session requirement: todas as rotas usam `requireAuth()` e retornam `401 { "error": "Nao autorizado" }` quando a sessao nao existe ou falha.
- Roles or ownership rules: a meta sempre e criada com `userId` da sessao; leitura individual, atualizacao e arquivamento filtram por `id + userId`.
- Multi-tenant filters: `listGoals()` retorna apenas metas com `where: { userId, isActive: true }`.
- Limite atual: `categoryId` e `accountId` recebidos em `POST/PATCH` nao passam por verificacao explicita de ownership; a implementacao depende apenas da integridade referencial do banco.

## Common Rules

- Validation: query params usam `goalQuerySchema`; payloads usam `createGoalSchema` e `updateGoalSchema`.
- Month param: quando presente, deve seguir `YYYY-MM`; a camada de dominio resolve esse valor em um periodo mensal via `resolveMonthPeriod`.
- Idempotency: nao existe chave idempotente para `POST`, `PATCH` ou `DELETE`.
- Pagination or filtering: nao existe paginação; a listagem retorna todas as metas ativas do usuario em ordem de `createdAt asc`.
- Cache or invalidation: as rotas de goals calculam progresso on-demand e nao leem `GoalSnapshot`; tambem nao chamam `invalidateAnalyticsSnapshots`, apesar de a infraestrutura de invalidacao ja prever o modulo `goals`.
- Error envelope: erros esperados usam `{ "error": string }`; validacoes Zod em `POST/PATCH` adicionam `details`.
- JSON malformado: `request.json()` nao e tratado separadamente, entao body JSON invalido cai no catch generico com `500 { "error": "Erro interno" }`.

## Endpoints

### GET /api/goals

#### Purpose

Lista as metas ativas do usuario autenticado e anexa o progresso calculado para o periodo solicitado.

#### Request

| Field   | Type     | Required | Description                  | Validation            |
| ------- | -------- | -------- | ---------------------------- | --------------------- |
| `month` | `string` | No       | Mes de referencia do calculo | Regex `^\d{4}-\d{2}$` |

#### Response

```json
{
  "data": [
    {
      "goalId": "cm_goal_123",
      "name": "Reserva do mes",
      "description": "Guardar parte da renda",
      "metric": "SAVING",
      "scopeType": "GLOBAL",
      "period": "MONTHLY",
      "targetAmount": 150000,
      "actualAmount": 82000,
      "projectedAmount": 126154,
      "progressPercent": 55,
      "status": "AT_RISK",
      "alerts": ["Faltam R$ 680.00 para atingir a meta"],
      "periodStart": "2026-04-01T00:00:00.000Z",
      "periodEnd": "2026-04-30T23:59:59.999Z"
    }
  ]
}
```

#### Errors

| Status | Condition                                 | Body Shape                            |
| ------ | ----------------------------------------- | ------------------------------------- |
| `400`  | Query string invalida                     | `{ "error": "Parametros invalidos" }` |
| `401`  | Sessao ausente/invalida                   | `{ "error": "Nao autorizado" }`       |
| `500`  | Falha inesperada no handler ou no calculo | `{ "error": "Erro interno" }`         |

#### Side Effects

- Nenhum efeito persistente; a rota apenas calcula e retorna dados.

#### Notes

- O calculo e feito com `listGoalsWithProgress()`, que primeiro lista metas ativas e depois executa `calculateGoalProgress()` para cada item.
- O contrato retorna progresso calculado, nao o registro bruto de `Goal`.
- A listagem nao inclui metas arquivadas (`isActive: false`).

### POST /api/goals

#### Purpose

Cria uma meta nova para o usuario autenticado.

#### Request

| Field            | Type                                                                | Required | Description                     | Validation                                                              |
| ---------------- | ------------------------------------------------------------------- | -------- | ------------------------------- | ----------------------------------------------------------------------- |
| `name`           | `string`                                                            | Yes      | Nome da meta                    | Min 2, max 100                                                          |
| `description`    | `string`                                                            | No       | Texto auxiliar da meta          | Max 500                                                                 |
| `metric`         | `"SAVING" \| "EXPENSE_LIMIT" \| "INCOME_TARGET" \| "ACCOUNT_LIMIT"` | Yes      | Tipo da metrica de negocio      | Enum Zod                                                                |
| `scopeType`      | `"GLOBAL" \| "CATEGORY" \| "ACCOUNT"`                               | No       | Escopo filtrado da meta         | Default `GLOBAL`                                                        |
| `categoryId`     | `string`                                                            | No       | Categoria alvo                  | Obrigatorio se `scopeType="CATEGORY"`                                   |
| `accountId`      | `string`                                                            | No       | Conta alvo                      | Obrigatorio se `scopeType="ACCOUNT"` ou `metric="ACCOUNT_LIMIT"`        |
| `targetAmount`   | `number`                                                            | Yes      | Valor alvo em centavos          | Inteiro positivo                                                        |
| `period`         | `"MONTHLY" \| "YEARLY"`                                             | No       | Periodicidade declarada da meta | Default `MONTHLY`                                                       |
| `warningPercent` | `number`                                                            | No       | Threshold intermediario         | Inteiro entre 1 e 99; default `80`                                      |
| `dangerPercent`  | `number`                                                            | No       | Threshold critico               | Inteiro entre 1 e 99; default `95`; deve ser maior que `warningPercent` |

#### Response

```json
{
  "data": {
    "id": "cm_goal_123",
    "userId": "cm_user_123",
    "name": "Reserva do mes",
    "description": "Guardar parte da renda",
    "metric": "SAVING",
    "scopeType": "GLOBAL",
    "categoryId": null,
    "accountId": null,
    "targetAmount": 150000,
    "period": "MONTHLY",
    "warningPercent": 80,
    "dangerPercent": 95,
    "isActive": true,
    "createdAt": "2026-04-17T10:00:00.000Z",
    "updatedAt": "2026-04-17T10:00:00.000Z"
  }
}
```

#### Errors

| Status | Condition                                      | Body Shape                                           |
| ------ | ---------------------------------------------- | ---------------------------------------------------- |
| `400`  | Payload invalido pelo Zod                      | `{ "error": "Dados invalidos", "details": { ... } }` |
| `401`  | Sessao ausente/invalida                        | `{ "error": "Nao autorizado" }`                      |
| `500`  | JSON invalido, FK invalida ou falha inesperada | `{ "error": "Erro interno" }`                        |

#### Side Effects

- Persiste um novo registro em `goals` com `userId` da sessao.

#### Notes

- A resposta devolve o registro persistido, sem calculo de progresso.
- A camada HTTP nao impede combinacoes semanticamente estranhas como enviar `categoryId` com `scopeType="GLOBAL"`; nesse caso o valor pode ser persistido, embora nao seja usado pelo calculo.
- Nao existe verificacao explicita de que `accountId`/`categoryId` pertencem ao mesmo usuario.

### GET /api/goals/[id]

#### Purpose

Retorna o progresso calculado de uma meta especifica do usuario autenticado.

#### Request

| Field   | Type     | Required | Description                  | Validation                       |
| ------- | -------- | -------- | ---------------------------- | -------------------------------- |
| `id`    | `string` | Yes      | Identificador da meta        | Sem validacao de formato na rota |
| `month` | `string` | No       | Mes de referencia do calculo | Regex `^\d{4}-\d{2}$`            |

#### Response

```json
{
  "data": {
    "goalId": "cm_goal_123",
    "name": "Limite supermercado",
    "description": null,
    "metric": "EXPENSE_LIMIT",
    "scopeType": "CATEGORY",
    "period": "MONTHLY",
    "targetAmount": 80000,
    "actualAmount": 54000,
    "projectedAmount": 83100,
    "progressPercent": 68,
    "status": "WARNING",
    "alerts": ["Gasto acima de 80% do limite"],
    "periodStart": "2026-04-01T00:00:00.000Z",
    "periodEnd": "2026-04-30T23:59:59.999Z"
  }
}
```

#### Errors

| Status | Condition                                      | Body Shape                            |
| ------ | ---------------------------------------------- | ------------------------------------- |
| `400`  | Query string invalida                          | `{ "error": "Parametros invalidos" }` |
| `401`  | Sessao ausente/invalida                        | `{ "error": "Nao autorizado" }`       |
| `404`  | Meta nao encontrada ou nao pertence ao usuario | `{ "error": "Meta nao encontrada" }`  |
| `500`  | Falha inesperada no handler ou no calculo      | `{ "error": "Erro interno" }`         |

#### Side Effects

- Nenhum efeito persistente.

#### Notes

- A diferenca para `GET /api/goals` e apenas o escopo; o calculo interno e o mesmo.
- A regra de progresso, projecao e alertas vem do dominio (`calculateGoalProgress`), nao da camada HTTP.

### PATCH /api/goals/[id]

#### Purpose

Atualiza campos editaveis de uma meta existente do usuario autenticado.

#### Request

| Field            | Type                                  | Required | Description             | Validation                                      |
| ---------------- | ------------------------------------- | -------- | ----------------------- | ----------------------------------------------- |
| `name`           | `string`                              | No       | Nome da meta            | Min 2, max 100                                  |
| `description`    | `string`                              | No       | Texto auxiliar da meta  | Max 500                                         |
| `scopeType`      | `"GLOBAL" \| "CATEGORY" \| "ACCOUNT"` | No       | Escopo da meta          | Enum Zod                                        |
| `categoryId`     | `string`                              | No       | Categoria alvo          | Opcional; sem `superRefine` adicional no update |
| `accountId`      | `string`                              | No       | Conta alvo              | Opcional; sem `superRefine` adicional no update |
| `targetAmount`   | `number`                              | No       | Valor alvo em centavos  | Inteiro positivo                                |
| `period`         | `"MONTHLY" \| "YEARLY"`               | No       | Periodicidade           | Enum Zod                                        |
| `warningPercent` | `number`                              | No       | Threshold intermediario | Inteiro entre 1 e 99                            |
| `dangerPercent`  | `number`                              | No       | Threshold critico       | Inteiro entre 1 e 99                            |
| `isActive`       | `boolean`                             | No       | Estado ativo da meta    | Boolean                                         |

#### Response

```json
{
  "data": {
    "id": "cm_goal_123",
    "userId": "cm_user_123",
    "name": "Reserva anual",
    "description": "Atualizada",
    "metric": "SAVING",
    "scopeType": "GLOBAL",
    "categoryId": null,
    "accountId": null,
    "targetAmount": 300000,
    "period": "YEARLY",
    "warningPercent": 70,
    "dangerPercent": 90,
    "isActive": true,
    "createdAt": "2026-04-01T10:00:00.000Z",
    "updatedAt": "2026-04-17T10:30:00.000Z"
  }
}
```

#### Errors

| Status | Condition                                      | Body Shape                                           |
| ------ | ---------------------------------------------- | ---------------------------------------------------- |
| `400`  | Payload invalido pelo Zod                      | `{ "error": "Dados invalidos", "details": { ... } }` |
| `401`  | Sessao ausente/invalida                        | `{ "error": "Nao autorizado" }`                      |
| `404`  | Meta nao encontrada ou nao pertence ao usuario | `{ "error": "Meta nao encontrada" }`                 |
| `500`  | JSON invalido, FK invalida ou falha inesperada | `{ "error": "Erro interno" }`                        |

#### Side Effects

- Atualiza o registro em `goals`.

#### Notes

- `metric` e imutavel na API porque `updateGoalSchema` faz `omit({ metric: true })`.
- Diferente do `createGoalSchema`, o update nao reaplica `superRefine`; isso significa que a rota pode aceitar estados inconsistentes, como `scopeType="CATEGORY"` sem `categoryId` ou `warningPercent >= dangerPercent`.
- Como o schema nao aceita `null`, a rota nao oferece um jeito explicito de limpar `description`, `categoryId` ou `accountId`.

### DELETE /api/goals/[id]

#### Purpose

Arquiva uma meta do usuario autenticado.

#### Request

| Field | Type     | Required | Description           | Validation                       |
| ----- | -------- | -------- | --------------------- | -------------------------------- |
| `id`  | `string` | Yes      | Identificador da meta | Sem validacao de formato na rota |

#### Response

```json
{
  "data": {
    "archived": true
  }
}
```

#### Errors

| Status | Condition                                      | Body Shape                           |
| ------ | ---------------------------------------------- | ------------------------------------ |
| `401`  | Sessao ausente/invalida                        | `{ "error": "Nao autorizado" }`      |
| `404`  | Meta nao encontrada ou nao pertence ao usuario | `{ "error": "Meta nao encontrada" }` |
| `500`  | Falha inesperada                               | `{ "error": "Erro interno" }`        |

#### Side Effects

- Atualiza `isActive` para `false` no registro da meta.

#### Notes

- O endpoint nao remove snapshots existentes e nao faz delete fisico da linha.
- Como `GET /api/goals` filtra por `isActive: true`, a meta arquivada desaparece da listagem padrao imediatamente.

## Observability and Debugging

- Relevant logs: os handlers nao possuem logging estruturado proprio.
- Metrics or traces: nao ha metricas dedicadas para goals API hoje.
- Failure signatures:
  - `400 Parametros invalidos`: `month` fora do padrao `YYYY-MM`
  - `400 Dados invalidos`: Zod rejeitou o payload
  - `404 Meta nao encontrada`: `id` inexistente ou de outro usuario
  - `500 Erro interno`: JSON invalido, excecao Prisma, ou falha inesperada no calculo

## Related Decisions

- ADR-009: base de snapshots/invalidation ja considera o modulo `goals`, mesmo sem uso direto nestes handlers
- ADR-010: Goal Engine define metricas, status, projecao e semantica do progresso

## Open Questions

- A API deve validar ownership de `categoryId` e `accountId` antes de persistir a meta.
- `PATCH` deveria reaplicar as mesmas invariantes do `POST`, evitando estados inconsistentes.
- Faz sentido expor um endpoint explicito de `archive` ou `restore` em vez de reutilizar `DELETE` como soft delete.

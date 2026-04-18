# Transactions API

## Status

- [ ] Draft
- [ ] In Review
- [x] Approved

## Purpose

Formalizar a superficie HTTP do modulo de transacoes do Finance Controller, cobrindo listagem, criacao, edicao, exclusao e transferencia entre contas com os payloads, validacoes, erros e efeitos colaterais realmente implementados hoje.

## Scope

Este documento cobre:

- `GET /api/transactions`
- `POST /api/transactions`
- `PATCH /api/transactions/[id]`
- `DELETE /api/transactions/[id]`
- `POST /api/transactions/transfer`
- filtros, busca e paginacao da listagem
- ownership, multi-tenant e efeitos colaterais em billing/invalidation

Este documento nao cobre outros modulos HTTP nem props da UI cliente.

## Sources of Truth

- Spec: [Docs - API Transactions](../future-features/13-docs-api-transactions.md)
- Task: [Phase 21 - API Docs: Transactions](../tasks/phase-21-api-transactions.md)
- ADRs:
  - [ADR-004 Transfer Strategy](../decisions/ADR-004-transfer-strategy.md)
  - [ADR-008 Credit Card Billing Cycle](../decisions/ADR-008-credit-card-billing-cycle.md)
  - [ADR-009 Analytics Snapshot and Invalidation Strategy](../decisions/ADR-009-analytics-snapshot-invalidation.md)
- Code:
  - `src/app/api/transactions/route.ts`
  - `src/app/api/transactions/[id]/route.ts`
  - `src/app/api/transactions/transfer/route.ts`
  - `src/server/modules/finance/http/schemas.ts`
  - `src/server/modules/finance/application/credit-card/billing.ts`
  - `src/server/modules/finance/application/analytics/invalidation.ts`
  - `prisma/schema.prisma`

## Module Summary

| Endpoint | Method | Purpose | Auth | Notes |
| -------- | ------ | ------- | ---- | ----- |
| `/api/transactions` | `GET` | Listar transacoes do usuario com filtros e paginacao | Required | Inclui transacoes `INCOME`, `EXPENSE` e `TRANSFER` |
| `/api/transactions` | `POST` | Criar transacao simples (`INCOME` ou `EXPENSE`) | Required | Sincroniza billing de cartao quando aplicavel |
| `/api/transactions/[id]` | `PATCH` | Atualizar transacao existente | Required | Nao permite editar transferencias diretamente |
| `/api/transactions/[id]` | `DELETE` | Remover transacao ou o par inteiro de transferencia | Required | Deletar uma perna de transferencia remove as duas |
| `/api/transactions/transfer` | `POST` | Criar transferencia atomica entre duas contas | Required | Cria duas linhas `TRANSFER` com o mesmo `transferId` |

## Authentication and Authorization

- Session requirement:
  - todas as rotas chamam `requireAuth()`
  - falha de sessao retorna `401 { "error": "Unauthorized" }`
- Roles or ownership rules:
  - nao existe sistema de roles; a regra e ownership por `userId`
  - toda leitura e mutacao filtra por `userId`
- Multi-tenant filters:
  - `GET /api/transactions` sempre injeta `userId` no `where`
  - `PATCH` e `DELETE` buscam a transacao por `id + userId`
  - `POST` e `POST /transfer` validam se as contas e categoria informadas pertencem ao usuario autenticado

## Common Rules

- Validation:
  - as rotas usam `safeParse` com Zod
  - erro de validacao retorna `400` com shape `{ error: "Validation failed", details: { ...fieldErrors } }`
  - JSON malformado nao e tratado separadamente; hoje cai no `catch` geral e retorna `500`
- Idempotency:
  - nenhuma rota oferece chave de idempotencia
  - `POST /transfer` cria sempre um novo `transferId`
- Pagination or filtering:
  - apenas `GET /api/transactions` pagina resultados
  - `page` default `1`
  - `limit` default `20`, maximo `100`
  - `totalPages` pode ser `0` quando `total = 0`
- Cache or invalidation:
  - criacao/edicao/exclusao de transacao invalida os modulos de analytics previstos em `ANALYTICS_MUTATION_MODULES`
  - transferencia invalida o conjunto de tags do modulo `transfer`
  - transacoes de despesa em conta de cartao podem sincronizar `creditCardStatement`

## Response Shapes

### Transaction Resource

Campos escalares persistidos em `Transaction`:

- `id`
- `userId`
- `accountId`
- `categoryId`
- `creditCardStatementId`
- `type`
- `amount`
- `description`
- `notes`
- `date`
- `transferId`
- `createdAt`
- `updatedAt`

### Transaction List Item

`GET /api/transactions` adiciona relacoes embutidas:

- `account: { name, color }`
- `category: { name, color } | null`
- `creditCardStatement: { id, dueDate } | null`

### Transfer Result

`POST /api/transactions/transfer` retorna:

- `outgoing`: transacao `TRANSFER` na conta de origem
- `incoming`: transacao `TRANSFER` na conta de destino
- `transferId`: UUID compartilhado pelas duas linhas

## Endpoints

### GET /api/transactions

#### Purpose

Listar transacoes do usuario autenticado com filtros simples, busca textual por descricao e paginacao offset-based.

#### Request

| Field | Type | Required | Description | Validation |
| ----- | ---- | -------- | ----------- | ---------- |
| `from` | query `date` | No | Limite inferior da data | `z.coerce.date()` |
| `to` | query `date` | No | Limite superior da data | `z.coerce.date()` |
| `accountId` | query `string` | No | Filtra por conta exata | String simples |
| `categoryId` | query `string` | No | Filtra por categoria exata | String simples |
| `q` | query `string` | No | Busca por descricao | Match `contains` case-insensitive |
| `page` | query `number` | No | Pagina atual | Int positivo, default `1` |
| `limit` | query `number` | No | Tamanho da pagina | Int positivo, max `100`, default `20` |

#### Response

```json
{
  "data": [
    {
      "id": "txn_1",
      "userId": "user_1",
      "accountId": "acc_1",
      "categoryId": "cat_1",
      "creditCardStatementId": null,
      "type": "EXPENSE",
      "amount": 25990,
      "description": "Supermercado",
      "notes": "Compra da semana",
      "date": "2026-04-10T03:00:00.000Z",
      "transferId": null,
      "createdAt": "2026-04-10T14:00:00.000Z",
      "updatedAt": "2026-04-10T14:00:00.000Z",
      "account": {
        "name": "Conta principal",
        "color": "#0f766e"
      },
      "category": {
        "name": "Alimentacao",
        "color": "#14b8a6"
      },
      "creditCardStatement": null
    }
  ],
  "meta": {
    "total": 42,
    "page": 1,
    "limit": 20,
    "totalPages": 3
  }
}
```

#### Errors

| Status | Condition | Body Shape |
| ------ | --------- | ---------- |
| `400` | Query string invalida | `{ "error": "Validation failed", "details": { ... } }` |
| `401` | Sessao ausente/invalida | `{ "error": "Unauthorized" }` |
| `500` | Falha inesperada | `{ "error": "Internal server error" }` |

#### Side Effects

- Nenhum efeito colateral persistente.

#### Notes

- A busca `q` usa apenas `description`; nao procura em `notes`, conta ou categoria.
- Nao existe filtro por `type`; a lista pode incluir transferencias.
- `accountId` e `categoryId` sao filtros exatos; nao existe expansao de subcategorias.
- O `orderBy` e sempre `date desc`.

### POST /api/transactions

#### Purpose

Criar uma transacao simples do tipo `INCOME` ou `EXPENSE`.

#### Request

| Field | Type | Required | Description | Validation |
| ----- | ---- | -------- | ----------- | ---------- |
| `amount` | body `number` | Yes | Valor em centavos | Int positivo |
| `date` | body `date` | Yes | Data da transacao | `z.coerce.date()` |
| `description` | body `string` | Yes | Descricao da transacao | `1..255` chars |
| `categoryId` | body `string` | No | Categoria da transacao | Deve existir e pertencer ao usuario se enviada |
| `accountId` | body `string` | Yes | Conta da transacao | Obrigatoria e precisa pertencer ao usuario |
| `type` | body enum | Yes | Tipo da transacao | Apenas `INCOME` ou `EXPENSE` |
| `notes` | body `string` | No | Observacoes livres | Max `1000` chars |

#### Response

```json
{
  "data": {
    "id": "txn_1",
    "userId": "user_1",
    "accountId": "acc_1",
    "categoryId": "cat_1",
    "creditCardStatementId": null,
    "type": "EXPENSE",
    "amount": 25990,
    "description": "Supermercado",
    "notes": "Compra da semana",
    "date": "2026-04-10T03:00:00.000Z",
    "transferId": null,
    "createdAt": "2026-04-10T14:00:00.000Z",
    "updatedAt": "2026-04-10T14:00:00.000Z"
  }
}
```

#### Errors

| Status | Condition | Body Shape |
| ------ | --------- | ---------- |
| `400` | Body invalido | `{ "error": "Validation failed", "details": { ... } }` |
| `400` | Conta inexistente ou de outro usuario | `{ "error": "Conta nao encontrada" }` |
| `400` | Categoria inexistente ou de outro usuario | `{ "error": "Categoria nao encontrada" }` |
| `401` | Sessao ausente/invalida | `{ "error": "Unauthorized" }` |
| `500` | JSON malformado ou falha inesperada | `{ "error": "Internal server error" }` |

#### Side Effects

- cria uma linha em `Transaction`
- chama `syncCreditCardTransactionStatement(transaction.id)`
- invalida snapshots de analytics do modulo `transaction`
- quando houver statement associado, invalida tambem a entidade de statement correspondente

#### Notes

- A API aceita apenas `INCOME` e `EXPENSE`; transferencias usam `/api/transactions/transfer`.
- Quando `categoryId` nao e enviado, o valor persistido vira `null`.
- A resposta usa o objeto retornado logo apos `prisma.transaction.create()`.
- Se a sincronizacao de cartao atualizar `creditCardStatementId` depois da criacao, a resposta pode nao refletir esse vinculo final; um `GET` posterior traz o estado reconciliado.

### PATCH /api/transactions/[id]

#### Purpose

Atualizar parcialmente uma transacao existente do usuario.

#### Request

| Field | Type | Required | Description | Validation |
| ----- | ---- | -------- | ----------- | ---------- |
| `id` | path `string` | Yes | ID da transacao | Deve existir e pertencer ao usuario |
| `amount` | body `number` | No | Novo valor em centavos | Int positivo |
| `date` | body `date` | No | Nova data | `z.coerce.date()` |
| `description` | body `string` | No | Nova descricao | `1..255` chars |
| `categoryId` | body `string` | No | Nova categoria | Deve existir e pertencer ao usuario se enviada |
| `accountId` | body `string` | No | Nova conta | Deve existir e pertencer ao usuario se enviada |
| `type` | body enum | No | Novo tipo | Apenas `INCOME` ou `EXPENSE` |
| `notes` | body `string` | No | Novas observacoes | Max `1000` chars |

#### Response

```json
{
  "data": {
    "id": "txn_1",
    "userId": "user_1",
    "accountId": "acc_2",
    "categoryId": "cat_1",
    "creditCardStatementId": null,
    "type": "EXPENSE",
    "amount": 30000,
    "description": "Supermercado premium",
    "notes": "Atualizado",
    "date": "2026-04-11T03:00:00.000Z",
    "transferId": null,
    "createdAt": "2026-04-10T14:00:00.000Z",
    "updatedAt": "2026-04-11T18:00:00.000Z"
  }
}
```

#### Errors

| Status | Condition | Body Shape |
| ------ | --------- | ---------- |
| `400` | Body invalido | `{ "error": "Validation failed", "details": { ... } }` |
| `400` | Conta inexistente ou de outro usuario | `{ "error": "Conta nao encontrada" }` |
| `400` | Categoria inexistente ou de outro usuario | `{ "error": "Categoria nao encontrada" }` |
| `400` | Tentativa de editar transferencia diretamente | `{ "error": "Transferencias nao podem ser editadas diretamente" }` |
| `404` | Transacao nao encontrada | `{ "error": "Transacao nao encontrada" }` |
| `401` | Sessao ausente/invalida | `{ "error": "Unauthorized" }` |
| `500` | JSON malformado ou falha inesperada | `{ "error": "Internal server error" }` |

#### Side Effects

- atualiza a linha em `Transaction`
- se a transacao antiga estava vinculada a statement, chama `refreshCreditCardStatement(existing.creditCardStatementId)`
- chama `syncCreditCardTransactionStatement(transaction.id)` apos o update
- invalida snapshots de analytics do modulo `transaction` com datas/contas/categorias antigas e novas

#### Notes

- O corpo e parcial; qualquer campo omitido permanece inalterado.
- A API atual nao aceita `null` para limpar `categoryId` ou `notes`; so e possivel trocar valores, nao remover explicitamente.
- A resposta usa o objeto retornado por `prisma.transaction.update()` antes de eventual ajuste posterior de `creditCardStatementId` na sincronizacao.

### DELETE /api/transactions/[id]

#### Purpose

Remover uma transacao do usuario. Se a transacao fizer parte de uma transferencia, a API remove o par inteiro.

#### Request

| Field | Type | Required | Description | Validation |
| ----- | ---- | -------- | ----------- | ---------- |
| `id` | path `string` | Yes | ID da transacao | Deve existir e pertencer ao usuario |

#### Response

```json
{
  "success": true
}
```

#### Errors

| Status | Condition | Body Shape |
| ------ | --------- | ---------- |
| `404` | Transacao nao encontrada | `{ "error": "Transacao nao encontrada" }` |
| `401` | Sessao ausente/invalida | `{ "error": "Unauthorized" }` |
| `500` | Falha inesperada | `{ "error": "Internal server error" }` |

#### Side Effects

- se for transacao comum:
  - remove uma linha
  - atualiza statement anterior com `refreshCreditCardStatement` quando houver
  - invalida analytics do modulo `transaction`
- se for transferencia:
  - busca todas as linhas com o mesmo `transferId` do usuario
  - remove o par inteiro com `deleteMany`
  - atualiza statements vinculados encontrados no par
  - invalida analytics do modulo `transfer`

#### Notes

- Deletar qualquer uma das pernas de uma transferencia remove as duas.
- Nao existe endpoint para remover so uma metade da transferencia.

### POST /api/transactions/transfer

#### Purpose

Criar uma transferencia atomica entre duas contas do mesmo usuario.

#### Request

| Field | Type | Required | Description | Validation |
| ----- | ---- | -------- | ----------- | ---------- |
| `amount` | body `number` | Yes | Valor em centavos | Int positivo |
| `date` | body `date` | Yes | Data da transferencia | `z.coerce.date()` |
| `description` | body `string` | Yes | Descricao comum do par | `1..255` chars |
| `sourceAccountId` | body `string` | Yes | Conta de origem | Obrigatoria, deve pertencer ao usuario |
| `destinationAccountId` | body `string` | Yes | Conta de destino | Obrigatoria, deve pertencer ao usuario e ser diferente da origem |
| `notes` | body `string` | No | Observacoes comuns do par | Max `1000` chars |

#### Response

```json
{
  "data": {
    "outgoing": {
      "id": "txn_out",
      "userId": "user_1",
      "accountId": "acc_source",
      "categoryId": null,
      "creditCardStatementId": null,
      "type": "TRANSFER",
      "amount": 50000,
      "description": "Transferencia interna",
      "notes": "Reserva",
      "date": "2026-04-12T03:00:00.000Z",
      "transferId": "uuid-transfer",
      "createdAt": "2026-04-12T10:00:00.000Z",
      "updatedAt": "2026-04-12T10:00:00.000Z"
    },
    "incoming": {
      "id": "txn_in",
      "userId": "user_1",
      "accountId": "acc_destination",
      "categoryId": null,
      "creditCardStatementId": null,
      "type": "TRANSFER",
      "amount": 50000,
      "description": "Transferencia interna",
      "notes": "Reserva",
      "date": "2026-04-12T03:00:00.000Z",
      "transferId": "uuid-transfer",
      "createdAt": "2026-04-12T10:00:00.000Z",
      "updatedAt": "2026-04-12T10:00:00.000Z"
    },
    "transferId": "uuid-transfer"
  }
}
```

#### Errors

| Status | Condition | Body Shape |
| ------ | --------- | ---------- |
| `400` | Body invalido | `{ "error": "Validation failed", "details": { ... } }` |
| `400` | Conta de origem inexistente ou de outro usuario | `{ "error": "Conta de origem nao encontrada" }` |
| `400` | Conta de destino inexistente ou de outro usuario | `{ "error": "Conta de destino nao encontrada" }` |
| `401` | Sessao ausente/invalida | `{ "error": "Unauthorized" }` |
| `500` | JSON malformado ou falha inesperada | `{ "error": "Internal server error" }` |

#### Side Effects

- cria duas linhas `Transaction` dentro de `prisma.$transaction`
- ambas usam `type = TRANSFER`
- ambas compartilham `amount`, `date`, `description`, `notes` e `transferId`
- invalida analytics do modulo `transfer`

#### Notes

- A validacao Zod impede `sourceAccountId === destinationAccountId`.
- O contrato e atomico: se uma criacao falhar, nenhuma das duas transacoes deve ser persistida.
- As duas linhas `TRANSFER` usam `amount` positivo; a direcao e inferida pela conta de origem/destino, nao pelo sinal do valor.
- Esta rota nao chama `syncCreditCardTransactionStatement`; o efeito colateral implementado e apenas a invalidacao analitica.

## Observability and Debugging

- Relevant logs:
  - as rotas nao emitem logs estruturados hoje
- Metrics or traces:
  - nao ha metricas especificas de endpoint implementadas no codigo atual
- Failure signatures:
  - `Validation failed` indica rejeicao do schema Zod
  - `Conta nao encontrada`, `Categoria nao encontrada`, `Conta de origem nao encontrada` e `Conta de destino nao encontrada` indicam falha de ownership ou referencia inexistente
  - `Transferencias nao podem ser editadas diretamente` indica tentativa de usar `PATCH` numa linha com `transferId`
  - `Transacao nao encontrada` em `PATCH`/`DELETE` indica `id` inexistente ou de outro usuario
  - respostas `500` podem incluir JSON malformado, falha de banco, falha de billing ou falha de invalidacao

## Related Decisions

- ADR: [ADR-004 Transfer Strategy](../decisions/ADR-004-transfer-strategy.md)
- ADR: [ADR-008 Credit Card Billing Cycle](../decisions/ADR-008-credit-card-billing-cycle.md)
- ADR: [ADR-009 Analytics Snapshot and Invalidation Strategy](../decisions/ADR-009-analytics-snapshot-invalidation.md)

## Open Questions

- A API deve permitir limpar `categoryId` e `notes` em `PATCH`, em vez de apenas atualizar valores?
- `POST` e `PATCH` deveriam responder com o estado final ja reconciliado de `creditCardStatementId`, em vez do objeto anterior ao sync?
- `GET /api/transactions` deve ganhar filtro por `type` para reduzir filtragem client-side de transferencias?
- JSON malformado deveria retornar `400` em vez de cair no `500` generico atual?

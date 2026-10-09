---
estado: real
fonte: src/app/api/accounts/** e src/server/modules/accounts/http/ (task FC2-F1-02)
ultima-revisao: FC2-F1-02 2026-10-07
---

# API de contas

Route Handlers finos: `requireAuth()` (sessão por cookie; sem sessão 401 `UNAUTHORIZED`), Zod, use-case de `accounts` ([`../domain/accounts.md`](../domain/accounts.md)), erro mapeado para `{ error, code }` em pt-BR. Valores em centavos inteiros; datas como `AAAA-MM-DD`. Toda consulta filtra por `userId`: id de outro usuário devolve 404.

## Rotas

| rota                                | uso                                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------------------ |
| `GET /api/accounts`                 | lista com saldo e uso do limite; query `includeArchived`, `excludeBusiness` (`true`/`false`) |
| `POST /api/accounts`                | cria conta (e o saldo inicial, se informado); `201`                                  |
| `GET /api/accounts/[id]`            | uma conta com saldo e uso do limite                                                  |
| `PATCH /api/accounts/[id]`          | altera campos (parcial); `type` só sem lançamentos além do saldo inicial             |
| `DELETE /api/accounts/[id]`         | exclui conta sem lançamentos além do saldo inicial                                   |
| `POST /api/accounts/[id]/archive`   | arquiva; `warnings: ['ARCHIVED_WITH_BALANCE']` se houver saldo                        |
| `POST /api/accounts/[id]/unarchive` | reabre                                                                               |
| `POST /api/accounts/reorder`        | `{ ids: string[] }`: define `sortOrder`                                              |

## `POST /api/accounts`

Corpo (`.strict()`, campo desconhecido é 400):

```json
{
  "name": "Conta Exemplo",
  "type": "CHECKING",
  "overdraftLimit": 100000,
  "openingBalance": -20000,
  "openingDate": "2026-10-01"
}
```

Campos opcionais: `issuerKey`, `networkKey`, `colorKey`, `icon`, `creditLimit`, `closingDay`, `dueDay`. Cartão: `creditLimit`, `closingDay` e `dueDay` obrigatórios; `openingBalance` é dívida (`<= 0`). Regras por tipo em [`../domain/accounts.md`](../domain/accounts.md).

Resposta `201`: `{ account, warnings }`, com `warnings` vindos do ledger (`OVERDRAFT_USED`, `OVERDRAFT_LIMIT_EXCEEDED`, `CREDIT_LIMIT_EXCEEDED`...).

## Formato da conta

```json
{
  "id": "…",
  "name": "Conta Exemplo",
  "type": "CHECKING",
  "issuerKey": null,
  "networkKey": null,
  "colorKey": null,
  "icon": null,
  "overdraftLimit": 100000,
  "creditLimit": null,
  "closingDay": null,
  "dueDay": null,
  "isArchived": false,
  "sortOrder": 0,
  "balance": { "cleared": -20000, "pending": 0, "planned": 0, "current": -20000, "projected": -20000 },
  "usage": { "kind": "OVERDRAFT", "limit": 100000, "used": 20000, "available": 80000, "excess": 0 }
}
```

`GET /api/accounts` devolve `{ accounts: [...], totals: { cash, investments, cardDebt } }`. `GET /api/accounts/[id]` devolve `{ account }`; `PATCH` e `archive` devolvem `{ account, warnings }`; `unarchive` devolve `{ account }`; `DELETE` e `reorder` devolvem `{ ok: true }`.

## Erros

| código                                  | HTTP | quando                                                         |
| --------------------------------------- | ---- | -------------------------------------------------------------- |
| `UNAUTHORIZED`                          | 401  | sem sessão                                                     |
| `VALIDATION_FAILED`                     | 400  | corpo ou query inválidos (Zod); `details` por campo            |
| `INVALID_JSON`                          | 400  | corpo não é JSON                                               |
| `ACCOUNT_INVALID`                       | 400  | regra por tipo violada; `details` por campo                    |
| `ACCOUNT_NOT_FOUND`                     | 404  | id inexistente ou de outro usuário                             |
| `ACCOUNT_NAME_TAKEN`                    | 409  | nome já usado (sem diferenciar caixa; arquivadas contam)       |
| `ACCOUNT_TYPE_LOCKED`                   | 409  | troca de `type` com lançamentos                                |
| `ACCOUNT_HAS_TRANSACTIONS`              | 409  | exclusão de conta com lançamentos além do saldo inicial        |
| `ACCOUNT_IN_USE`                        | 409  | exclusão recusada por referência de outra tabela               |
| `LEDGER_*`                              | 400/404/409 | erros do ledger (ex.: `LEDGER_ACCOUNT_ARCHIVED` em `POST /api/transactions`), mapeamento em [`../domain/ledger.md`](../domain/ledger.md) |
| `INTERNAL_ERROR`                        | 500  | inesperado; mensagem genérica, sem stack                       |

## Idempotência e atomicidade

Criação e exclusão rodam numa única transação do ledger (conta, `AccountBalance` e `ADJUSTMENT` entram e saem juntos). `archive` e `unarchive` são idempotentes. Não há `clientRequestId` aqui: o cadastro de conta é ação manual rara, e nome duplicado já é recusado (`ACCOUNT_NAME_TAKEN`).

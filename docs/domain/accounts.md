---
estado: real
fonte: src/server/modules/accounts/ (task FC2-F1-02); decisões em ADR-019, ADR-016, ADR-025
ultima-revisao: FC2-F1-02 2026-10-07
---

# Contas

Cadastro de contas (corrente, PJ, poupança, carteira, investimento e cartão de crédito) com **saldo real** e **uso do limite**. O módulo não guarda saldo: o saldo e o uso do limite vêm do ledger (ADR-019, [`ledger.md`](ledger.md)); o saldo inicial é um lançamento `ADJUSTMENT`, nunca uma coluna.

Código: `src/server/modules/accounts/{domain,application,infra,http}`. Rotas: `src/app/api/accounts/**` ([`../api/accounts.md`](../api/accounts.md)). Tela: `src/app/(app)/mais/contas/`.

## Campos e regras por tipo

| Campo                    | Regra                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------- |
| `name`                   | 1 a 60 caracteres, único por usuário sem diferenciar caixa (RN-02); o nome de conta arquivada fica reservado |
| `type`                   | `CHECKING`, `SAVINGS`, `WALLET`, `INVESTMENT`, `CREDIT_CARD`, `BUSINESS`                                 |
| `issuerKey`              | opcional; chave do `src/lib/brands/registry.ts`, categoria `bank` ou `payment`                           |
| `networkKey`             | opcional; só `CREDIT_CARD`; categoria `network`                                                          |
| `colorKey`, `icon`       | opcionais; `cat-1`..`cat-10`; nome lucide em kebab-case (até 40 caracteres)                              |
| `overdraftLimit`         | `Int >= 0` em centavos; só `CHECKING`/`BUSINESS` (nos demais, 0 ou omitido)                              |
| `creditLimit`            | obrigatório e `> 0` em `CREDIT_CARD`; proibido nos demais                                                |
| `closingDay`, `dueDay`   | obrigatórios (1 a 31) em `CREDIT_CARD`; proibidos nos demais                                             |
| `openingBalance`         | só na criação; `Int` assinado em centavos; **não é coluna**                                              |
| `openingDate`            | só na criação; dia de calendário (meio-dia UTC); padrão: hoje em São Paulo                               |

As regras por tipo são puras (`domain/validation.ts`, matriz coberta em `validation.test.ts`) e o mesmo conjunto vale na API (Zod `superRefine`) e no use-case, que devolve `ACCOUNT_INVALID` com mensagens por campo.

## Use-cases (`application/`)

Fachada `createAccountsService(deps)` (`@/server/modules/accounts`); instância ligada ao Prisma em `@/server/modules/accounts/service` (`getAccountsService()`). Todo método recebe `userId` primeiro.

- `createAccount(userId, input)`: gera o id **antes** da unit of work e roda tudo em `ledger.runInTransaction`: insere a `Account` (repositório com `uow.tx`), `uow.openAccountBalance(id)` e, se `openingBalance != 0`, `uow.createTransaction` com `ADJUSTMENT` "Saldo inicial" (`CLEARED`, `source = MANUAL`, `review = REVIEWED`, `excludeFromBudget = true`). Falha em qualquer passo desfaz a conta, o saldo e o lançamento (RN-01). Em cartão, `openingBalance` é dívida existente (valor `<= 0`); a F1-03 trata faturas.
- `updateAccount(userId, id, patch)`: renomeia e ajusta emissor, bandeira, ícone, cor, limites e dias de fatura. `type` só muda enquanto não há lançamento além do saldo inicial (`ACCOUNT_TYPE_LOCKED`, RN-05); ao mudar de tipo, campos que não se aplicam ao novo tipo e que o patch não informou são zerados. Mudar `closingDay`/`dueDay` de cartão devolve `warnings: ['STATEMENT_DAYS_CHANGED']` e só vale para faturas futuras (a F1-03 aplica).
- `archiveAccount` / `unarchiveAccount`: idempotentes. Arquivar com saldo (`cleared`, `pending` ou `planned` diferente de zero) devolve `warnings: ['ARCHIVED_WITH_BALANCE']`. Conta arquivada sai da lista padrão e o ledger só aceita `ADJUSTMENT` nela (`LEDGER_ACCOUNT_ARCHIVED`).
- `deleteAccount`: só conta sem lançamento além do saldo inicial; apaga o `ADJUSTMENT` inicial pelo ledger, o `AccountBalance` e a conta na mesma transação. Com qualquer outro lançamento: `ACCOUNT_HAS_TRANSACTIONS`. A conferência é refeita depois de apagar o saldo inicial (a linha de saldo fica travada), então um lançamento concorrente não some junto com a conta.
- `listAccounts(userId, { includeArchived, excludeBusiness })`: contas por `sortOrder` e nome, cada uma com `balance` (`cleared`, `pending`, `planned`, `current`, `projected`) e `usage` (`kind`, `limit`, `used`, `available`, `excess`) do ledger (`listAccountPositions`), mais `totals`.
- `getAccount(userId, id)`, `reorderAccounts(userId, ids)` (as listadas primeiro, na ordem dada; as demais seguem).

## Totais

`totals = { cash, investments, cardDebt }`, só contas ativas: `cash = Σ current` de `CHECKING|SAVINGS|WALLET|BUSINESS`; `investments = Σ current` de `INVESTMENT`; `cardDebt = Σ max(0, -current)` dos cartões. `excludeBusiness` tira as contas PJ de `cash` (RN-07). Transferência entre contas de caixa não muda `cash`.

## Erros de domínio

| código                     | HTTP |
| -------------------------- | ---- |
| `ACCOUNT_INVALID`          | 400  |
| `ACCOUNT_NOT_FOUND`        | 404  |
| `ACCOUNT_NAME_TAKEN`       | 409  |
| `ACCOUNT_TYPE_LOCKED`      | 409  |
| `ACCOUNT_HAS_TRANSACTIONS` | 409  |
| `ACCOUNT_IN_USE`           | 409  |

`ACCOUNT_IN_USE` é a chave estrangeira recusando a exclusão (conta referenciada por outra tabela, como fatura). Erros do ledger (`LEDGER_*`) passam pelo mapeamento do próprio ledger.

## Isolamento e concorrência

- Toda leitura e escrita filtra por `userId`; id de outro usuário é `ACCOUNT_NOT_FOUND` (RN-08).
- O unique `(userId, name)` do banco é sensível a caixa; a comparação normalizada (trim, espaços colapsados, caixa) é feita no use-case antes de gravar. Corrida entre duas criações simultâneas do mesmo nome com caixa diferente é improvável (usuário único); se virar problema, índice único em `lower(name)` por migration incremental (pendência).
- O módulo nunca escreve em `transactions`/`account_balances` (guard `tests/guards/ledger-boundaries.test.ts`): usa só a API pública do ledger.

## API pública para outros módulos

`@/server/modules/accounts`: `createAccountsService`, `AccountsService`, tipos (`AccountView`, `AccountRecord`, `AccountType`, `AccountTotals`, `AccountDeps`, `AccountRepository`), `AccountError`/`ACCOUNT_ERROR_CODES`/`ACCOUNT_ERROR_STATUS`, `computeTotals`, `isOpeningTxn`, `OPENING_DESCRIPTION`, `createPrismaAccountRepository`. Instância real em `@/server/modules/accounts/service`. A reconciliação (F1-04) consome `getAccount`/`listAccounts` para o saldo do app e `OPENING_DESCRIPTION`/`isOpeningTxn` para distinguir o saldo inicial.

## Testes

Domínio (`domain/*.test.ts`), aplicação com repositório em memória (`application/accounts.test.ts`, `test-helpers.ts`), rotas com sessão e serviços simulados (`src/app/api/accounts/routes.test.ts`) e integração no Postgres de teste (`infra/prisma-account-repository.integration.test.ts`, só com `DATABASE_URL_TEST`): criação com saldo inicial, atomicidade, exclusão, arquivar com o ledger recusando lançamento, transferência e isolamento por usuário.

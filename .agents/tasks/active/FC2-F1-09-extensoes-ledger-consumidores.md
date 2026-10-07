---
id: FC2-F1-09
title: Extensões do ledger para módulos consumidores (vínculos, occurrenceKey, unit of work)
status: active
type: feature
phase: F1
wave: 2
owner: dominio-financeiro
depends_on: [FC2-F1-01]
created_at: 2026-10-06
updated_at: 2026-10-06
affected_modules: [ledger]
related_use_cases: [createTransaction, createTransfer, upsertPlannedByOccurrenceKey]
related_adrs: [ADR-019, ADR-004, ADR-025, ADR-008, ADR-020, ADR-028, ADR-029]
---

# FC2-F1-09 — Extensões do ledger para módulos consumidores

## Contexto
Criada pelo orquestrador em 2026-10-06 ao planejar a onda 2 da F1. A FC2-F1-01 entregou o ledger (`src/server/modules/ledger/`) com `createTransaction`, `createTransfer`, lock por linha e guard `tests/guards/ledger-boundaries.ts` (só `ledger/infra` escreve em `transactions`/`account_balances`). As tasks seguintes precisam de capacidades que o ledger ainda não expõe:
- **FC2-F1-03 (cartões)**: lançamentos com `statementId`/`statementKey`; pagamento de fatura (`CARD_PAYMENT`) com `statementId` na perna de entrada (cartão); estorno com `refundOfId`; criar `CardPurchase`/`CardInstallment`/`CreditCardStatement` **na mesma transação de banco** dos lançamentos.
- **FC2-F1-06 (renda MEI)**: previstos `PLANNED` idempotentes por `occurrenceKey` (criar se não existe; atualizar valor/data se ainda `PLANNED`; não tocar se já `CLEARED`), com `seriesId` opcional.
- **FC2-F1-02 (contas)**: criar `Account` (repositório do módulo de contas), a linha de `AccountBalance` e o lançamento `ADJUSTMENT` "Saldo inicial" (`CLEARED`, `excludeFromBudget = true`) **na mesma transação**; o ledger precisa expor `uow.openAccountBalance(accountId)` (ou equivalente) para que nenhum outro módulo escreva em `account_balances`.
- **FC2-F1-05 (dívidas)**: pagar parcela gravando o lançamento e atualizando `LoanInstallment.transactionId` na mesma transação.

Fazer isso numa task única evita que três implementadores editem o ledger em paralelo.

## Objetivo
1. `NewLedgerTxn`/`createTransaction`/`createTransfer` aceitam vínculos opcionais: `statementId`, `statementKey`, `refundOfId`, `seriesId`, `occurrenceKey`, `importBatchId`, `importHash`, `categorySource`, `aiConfidence` (os que existem no schema). `createTransfer` aceita vínculos **por perna** (ex.: `incoming: { statementId, statementKey }`).
2. **Unit of work**: API pública para outro módulo executar suas próprias escritas (no repositório dele) e operações do ledger **na mesma transação de banco**, sem que o outro módulo escreva em `transactions`/`account_balances` diretamente. Ex.: `ledger.runInTransaction(ctx, async (uow) => { const r = await uow.createTransaction(...); await uow.tx /* handle opaco para o repositório do módulo */ ... })`. Definir como o repositório Prisma de outro módulo recebe o mesmo `Prisma.TransactionClient` (handle opaco tipado), e como o em-memória participa (rollback conjunto) para testes.
3. `upsertPlannedByOccurrenceKey(ctx, input)`: idempotente pelo unique `(userId, occurrenceKey)`; cria `PLANNED`; se existir e ainda `PLANNED`, atualiza valor/data/descrição aplicando deltas; se não for `PLANNED`, não altera e retorna `{ skipped: 'NOT_PLANNED' }`. Seguro sob concorrência (lock/`ON CONFLICT`).
4. Manter o guard de fronteiras: módulos consumidores continuam proibidos de escrever em `transactions`/`account_balances`.

## Fora de escopo
Regras de fatura, parcelas, dívidas e renda (ficam nas tasks donas). Migration (se faltar algo no schema, registrar pendência para dados-prisma).

## Critérios de aceitação
- [ ] CA-01: `createTransaction` com `statementId`/`statementKey`/`refundOfId`/`seriesId`/`occurrenceKey` persiste os campos (teste em memória + integração Postgres).
- [ ] CA-02: `createTransfer({ kind: 'CARD_PAYMENT', incoming: { statementId, statementKey } })` grava o vínculo só na perna do cartão.
- [ ] CA-03: unit of work: falha injetada na escrita do módulo consumidor após `uow.createTransaction` desfaz o lançamento e o saldo (memória + Postgres).
- [ ] CA-04: `upsertPlannedByOccurrenceKey` chamado 2x não duplica; com valor novo atualiza o `PLANNED` e o `balancePlanned`; com o lançamento já `CLEARED` não altera; 10 chamadas concorrentes com a mesma chave resultam em 1 lançamento e saldo correto (Postgres).
- [ ] CA-08: criação de conta + `AccountBalance` + `ADJUSTMENT` inicial numa única unit of work: falha injetada em qualquer passo não deixa conta sem linha de saldo nem saldo sem conta (memória + Postgres).
- [ ] CA-05: guard `ledger-boundaries` continua verde e cobre a nova API (outro módulo não importa `ledger/infra` diretamente, só a API pública).
- [ ] CA-06: `docs/domain/ledger.md` documenta a API para consumidores (exemplos para cartões, renda, dívidas).
- [ ] CA-07: `npm run lint`, `npm run typecheck`, `npm test`, `npm run guard:data`, `npx next build` passam; integração verde com `DATABASE_URL_TEST`.

## Registro de execução
### Alterações realizadas
### Decisões
### Pendências

## Validação

---
id: FC2-F1-09
title: Extensões do ledger para módulos consumidores (vínculos, occurrenceKey, unit of work)
status: completed
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
- [x] CA-01: `createTransaction` com `statementId`/`statementKey`/`refundOfId`/`seriesId`/`occurrenceKey` persiste os campos (teste em memória + integração Postgres).
- [x] CA-02: `createTransfer({ kind: 'CARD_PAYMENT', incoming: { statementId, statementKey } })` grava o vínculo só na perna do cartão.
- [x] CA-03: unit of work: falha injetada na escrita do módulo consumidor após `uow.createTransaction` desfaz o lançamento e o saldo (memória + Postgres).
- [x] CA-04: `upsertPlannedByOccurrenceKey` chamado 2x não duplica; com valor novo atualiza o `PLANNED` e o `balancePlanned`; com o lançamento já `CLEARED` não altera; 10 chamadas concorrentes com a mesma chave resultam em 1 lançamento e saldo correto (Postgres).
- [x] CA-08: criação de conta + `AccountBalance` + `ADJUSTMENT` inicial numa única unit of work: falha injetada em qualquer passo não deixa conta sem linha de saldo nem saldo sem conta (memória + Postgres).
- [x] CA-05: guard `ledger-boundaries` continua verde e cobre a nova API (outro módulo não importa `ledger/infra` diretamente, só a API pública).
- [x] CA-06: `docs/domain/ledger.md` documenta a API para consumidores (exemplos para cartões, renda, dívidas).
- [x] CA-07: `npm run lint`, `npm run typecheck`, `npm test`, `npm run guard:data`, `npx next build` passam; integração verde com `DATABASE_URL_TEST`.

## Registro de execução
### Alterações realizadas
- Domínio: `TxnLinks` (9 vínculos) em `LedgerTxn`/`NewLedgerTxn`; `domain/links.ts` (validação/normalização, `STATEMENT_KEY_PATTERN`) com testes; `buildTransferLegs` aceita `outgoing`/`incoming` por perna; 3 códigos novos em `LEDGER_ERROR_CODES` (`LEDGER_INVALID_LINK`, `LEDGER_LINK_NOT_FOUND`, `LEDGER_DUPLICATE_KEY`).
- Aplicação: `createTransaction`/`createTransfer` com vínculos (validação de dono por `assertLinkRefs`); `setTransactionLinks`; `openAccountBalance`; `upsertPlannedByOccurrenceKey`/`upsertPlannedBatch` (`upsert-planned.ts`); unit of work (`unit-of-work.ts`: `runInTransaction`, `LedgerUnitOfWork`, `bindToTransaction` que reaproveita os use-cases existentes na mesma transação e adia `afterLedgerMutation` para depois do commit); `LedgerService` ganhou `runInTransaction`, `upsertPlannedByOccurrenceKey`, `upsertPlannedBatch`, `openAccountBalance`, `setTransactionLinks`.
- Portas (`ports.ts`): `TransactionHandle`; `LedgerTx.handle`, `ensureBalance`, `lockOccurrenceKeys`; `LedgerReader.findTxnByOccurrenceKey`, `linkRefsExist`; filtros `statementId`/`seriesId`/`refundOfId`/`kind` em `TxnListFilter`; `TxnPatch` aceita vínculos.
- Infra: `transaction-handle.ts` (`PrismaTransactionHandle`, `InMemoryTransactionHandle`, `prismaClientOf`, `memoryTxOf`, `onRollback`); repositório Prisma (links, `ensureBalance` com `createMany skipDuplicates`, `lockOccurrenceKeys` com `pg_advisory_xact_lock`, `P2002` em `occurrence_key`/`import_hash` vira `LEDGER_DUPLICATE_KEY`); repositório em memória (mesmas capacidades; callbacks de undo de outros módulos entram no rollback; unicidade de `occurrenceKey`/`importHash`; `missingLinks`; `failOn('ensureBalance')`).
- API pública: `ledger/index.ts` (fábrica, unit of work, handle, tipos, erros, `mapErrorToHttp`), `ledger/service.ts` (`getLedgerService`), `ledger/testing.ts` (memória e helpers).
- Guard `tests/guards/ledger-boundaries.ts`: detecta SQL de escrita em várias linhas; novo detector de imports (`findLedgerImportViolations`): fora de `ledger/`, só `index`/`service`/`testing` (este só em testes); rotas em `src/app/**` mantêm `ledger/http/*` e `infra/ledger-service`.
- Docs: `docs/domain/ledger.md` com a seção "API para módulos consumidores" (contas, cartões, renda, dívidas), códigos de erro novos.
- Testes: `domain/links.test.ts`, `application/unit-of-work.test.ts` (41 testes, memória, exemplos de módulo consumidor), `infra/prisma-ledger-repository.uow.integration.test.ts` (20 testes, Postgres), guards. Timeout das suítes de integração do ledger subiu para 30 s (`describe` options) porque a suíte do F1-01 estourava 5 s quando rodava em paralelo com o novo arquivo (2,7 s isolada).

### Decisões
- Handle opaco com duas implementações (`PrismaTransactionHandle`/`InMemoryTransactionHandle`); outros módulos nunca importam `ledger/infra`: acessam por `prismaClientOf(uow.tx)`/`onRollback(uow.tx, undo)` exportados pelo `index`.
- Lock do upsert: `pg_advisory_xact_lock(hashtextextended('ledger:occ:<userId>:<chave>', 0))` em ordem crescente (em vez de `ON CONFLICT`), depois `lockTxns` na linha existente. Vem antes dos locks de linha na ordem global. `upsertPlannedBatch` trava todas as chaves antes de escrever (evita deadlock entre lotes cruzados).
- `upsertPlannedByOccurrenceKey` atualiza como engine (`actor: 'SYSTEM'`): `userLocked` vence (ADR-024), reportado em `skippedFields`.
- Em deadlock o `withTransaction` refaz a `fn` inteira (1 retry): documentado que a `fn` do uow deve ser idempotente, sem efeito externo e com ids gerados antes; teste de integração simula o retry.
- Sem migration e sem dependência nova. `LedgerTxn` ganhou campos novos (todos nulos por padrão); `TransactionDto` (HTTP) não os expõe.

### Pendências
- Nenhuma no ledger. Para os consumidores: conta criada pelo módulo de contas em memória precisa ser registrada em `InMemoryLedgerRepository.accounts` (documentado); faturas/séries/lotes em memória só são "inexistentes" via `repo.missingLinks`.
- Não coberto por análise estática: escrita no ledger por alias de variável (`const t = db.transaction; t.create(...)`); o guard cobre os padrões de chamada direta e SQL cru.

### Ciclo de correção 1 (2026-10-07, após parecer QA do commit 5e522b9)
- **(1) Lock do vínculo de fatura**: `setTransactionLinks(id, links, { actor?: 'USER' | 'SYSTEM' })` (serviço e uow). `USER` com `statementId`/`statementKey` no patch (inclusive `null`) grava `userLocked.statement = true` (preserva os outros locks); `SYSTEM` com o lock ligado não altera `statementId`/`statementKey`, devolve `skippedFields` e aplica os demais vínculos do patch (sem nada a aplicar, não grava nem emite evento); sem `actor` o comportamento anterior (neutro). Retorno: `LedgerTxn & { skippedFields }` (compatível). Constantes `STATEMENT_LOCK_KEY`/`STATEMENT_LOCKED_FIELDS` em `domain/links.ts`. Observação: não acrescentei `statement` à lista `LOCKABLE_FIELDS` de `update-transaction.ts`, que filtra campos do `UpdateTransactionInput` (a chave nunca estaria no patch); o lock vive em `set-links.ts`.
- **(2) Filtros**: `TxnListFilter` ganhou `status` (um ou array; array vazio não casa com nada), `categoryId` e `occurrenceKeyPrefix`. Prisma: `IN`/`startsWith` parametrizado. Achado durante a validação em Postgres: o `startsWith` do Prisma **não escapa** `%`/`_`; o repositório escapa `\`, `%` e `_` (`escapeLike`) para o prefixo ser literal.
- **(3) Ordem de locks**: `uow.lockOccurrenceKeys(keys)` adquire os advisory locks antecipadamente (ordem crescente, idempotente, valida a chave); `docs/domain/ledger.md` documenta "`upsertPlanned*` antes de outras escritas" e "trave as linhas do seu módulo antes de chamar o ledger" (regra 6 da `fn`). Teste Postgres: 12 execuções concorrentes (uow mista + upsert avulso) em 3 rodadas, nenhuma rejeitada.
- **(4) Aninhamento**: `infra/transaction-scope.ts` (`AsyncLocalStorage`) envolve `withTransaction` dos dois repositórios; qualquer transação do ledger aberta de dentro da `fn` (serviço ou `runInTransaction`) lança na hora `LedgerError` `LEDGER_NESTED_TRANSACTION` (409, novo código estável) e a externa desfaz. O `afterLedgerMutation` (pós-commit) pode chamar o ledger.
- **(5) `LEDGER_DUPLICATE_KEY` no ponto da operação**: `insertTxns`/`updateTxn` do Prisma traduzem P2002 (`occurrence_key`/`import_hash`); a conversão em `withTransaction` continua como rede. Paridade com a memória. No Postgres a transação já está abortada depois do erro (documentado).
- **(6) `upsertPlanned*`** atualiza `categoryId`, `merchantId`, `notes`, `tags` e vínculos (via `updateTransaction`/`setTransactionLinks` com `actor: 'SYSTEM'`): `undefined` não toca, `null` limpa, `userLocked` vence (inclusive `statement`; com `categoryId` travado, `categorySource`/`aiConfidence` também ficam).
- **(7) `prismaClientOf`** devolve `ConsumerTransactionClient` (`Omit<Prisma.TransactionClient, 'transaction' | 'accountBalance'>`, exportado pelo `index`); teste de tipo com `@ts-expect-error`.
- Testes novos: `application/consumer-extensions.test.ts` (25, memória) e `infra/prisma-ledger-repository.uow-extensions.integration.test.ts` (6, Postgres). Testes QA e F1-01 não foram alterados. Sem migration e sem dependência nova.

## Validação
- `npm run lint`: ok. `npm run typecheck`: ok. `npx prettier --check --end-of-line auto .`: ok.
- `npm test` (sem banco): 53 arquivos ok, 864 testes ok (49 de integração pulados).
- Integração (Postgres 16 em Docker, banco `fc2_f109_test`, `DATABASE_URL_TEST` sem `DATABASE_URL`): 58 arquivos, 911 testes ok; rodada repetida 3 vezes sem falha (uma rodada anterior falhou por timeout de 5 s no teste de F1-01, corrigido com timeout de 30 s).
- `npm run guard:data`: 4 arquivos, 195 testes ok. `npm run test:coverage`: domínio 100% linhas (limites do ADR-016 atendidos).
- `DATABASE_URL=postgresql://ci:ci@localhost:5432/ci npx next build`: ok.

### Parecer QA (2026-10-07, commit revisado 5e522b9)
Parecer: **REPROVADO** (1 lacuna importante de suficiência; restante conforme).
- Reexecutado: lint, typecheck, `npm test` (864 ok), `guard:data` (195 ok), prettier, `test:coverage` (domínio ledger 100% linhas), `next build` com `DATABASE_URL` de CI: ok. Integração Postgres 16 (Docker, banco descartável): 2 rodadas, 58 arquivos / 911 testes ok; com os 3 testes QA novos, 59 arquivos / 914 ok.
- CA-01..CA-08 atendidos por testes (memória + Postgres). Guard: violação deliberada (`prismaClientOf(uow.tx).transaction.create`, `.accountBalance.update`, `$executeRaw UPDATE account_balances`, import de `ledger/infra/*`) é detectada; alias de variável e SQL montado por concatenação não são (limitação já registrada).
- Importante: (1) `setTransactionLinks`/`updateTransaction` não permitem gravar `userLocked.statement`, exigido por FC2-F1-03 (RN-08/CA-08: lançamento movido de fatura não volta ao ciclo após `syncCardStatuses`). Resolver aqui (ex.: `setTransactionLinks(id, links, { lock: true })` e `actor: 'SYSTEM'` respeitando o lock).
- Menores: (2) `listTransactions` sem `status` múltiplo, `categoryId` e prefixo de `occurrenceKey` (F1-06 faz N chamadas por conta × status e filtra em memória); (3) mistura de escrita no ledger antes de `upsertPlanned*` na mesma uow inverte a ordem de locks (balance -> advisory): sob contenção devolve `LEDGER_CONCURRENT_UPDATE` após 1 retry; documentar "upsert primeiro" ou travar chaves antecipadamente; (4) aninhar `runInTransaction`/serviço dentro da `fn` trava até o timeout de 15 s, falha com erro cru do Prisma e a chamada interna ainda confirma depois do rollback externo; só documentado, sem detecção em runtime; (5) `LEDGER_DUPLICATE_KEY` só é traduzido na saída de `runInTransaction`; dentro da `fn` o consumidor vê erro cru do Prisma (memória lança `LedgerError`); (6) `upsertPlanned*` não atualiza categoria/merchant/notas/tags/vínculos de um `PLANNED` existente; (7) `prismaClientOf` devolve o `TransactionClient` completo (proteção só estática).
- Testes QA adicionados: `src/server/modules/ledger/infra/prisma-ledger-repository.uow-qa.integration.test.ts` (fluxo de cartão com tarifa/estorno/pagamento, `LEDGER_DUPLICATE_KEY` na saída da uow, invariantes sob ordem de locks invertida).

### Validação do ciclo 1 (2026-10-07)
- `npm run lint`, `npm run typecheck`, `npx prettier --check --end-of-line auto .`: ok. `npm test` (sem banco): 54 arquivos ok, 889 testes ok (58 pulados). `npm run guard:data`: 195 ok. `npm run test:coverage`: ok, domínio do ledger 100% linhas.
- Integração (Postgres 16 em Docker, banco `fc2_fixf109_test`, `DATABASE_URL_TEST` sem `DATABASE_URL`): 2 rodadas, 61 arquivos / 945 testes ok (2 placeholders pulados), incluindo os testes QA.
- `DATABASE_URL=postgresql://ci:ci@localhost:5432/ci npx next build`: ok.

### Parecer QA (re-revisão, 2026-10-07, commit revisado 40f2f4b)
Parecer: **APROVADO** (nenhum achado bloqueante ou importante; 2 observações menores para os consumidores).
- Reexecutado: `npm run lint`, `npm run typecheck`, `npx prettier --check --end-of-line auto .`: ok. `npm test` (sem banco): 55 arquivos ok, 893 testes ok (58 pulados). `npm run guard:data`: 195 ok. `npm run test:coverage`: ok, domínio do ledger 100% linhas. `DATABASE_URL=postgresql://ci:ci@localhost:5432/ci npx next build`: ok.
- Integração (Postgres 16 em Docker, banco descartável `fc2_reqaf109_test`, `DATABASE_URL_TEST` sem `DATABASE_URL`): 2 rodadas, 62 arquivos / 949 testes ok (2 placeholders pulados), incluindo o teste novo de QA. Testes QA anteriores (`*qa*`) intactos entre 63b971e e 40f2f4b (diff vazio).
- Achado importante do ciclo 0 fechado: `setTransactionLinks(..., { actor: 'USER' })` grava `userLocked.statement` (preserva demais locks, inclusive com `null`); `actor: 'SYSTEM'` não altera `statementId`/`statementKey`, devolve `skippedFields`, aplica os outros vínculos e não emite evento se nada mudou. Teste em memória e em Postgres (`prisma-ledger-repository.uow-extensions.integration.test.ts:94`) reproduzem "usuário move -> sync não desfaz". O desvio (chave `statement` fora de `LOCKABLE_FIELDS`, lock em `set-links.ts`) é aceito: `LOCKABLE_FIELDS` filtra o `UpdateTransactionInput`, que não carrega vínculos de fatura; `updateTransaction` com `USER` preserva `userLocked.statement` (merge em `lockFields`). `upsertPlanned*` passa vínculos por `setTransactionLinks` com `actor: 'SYSTEM'`, logo respeita o lock de fatura (e `categorySource`/`aiConfidence` seguem `categoryId` travado).
- Menores 2 a 7: conferidos no código e nos testes novos (filtros `status[]`/`categoryId`/`occurrenceKeyPrefix` com `escapeLike`, `lockOccurrenceKeys`, `LEDGER_NESTED_TRANSACTION`, `LEDGER_DUPLICATE_KEY` no ponto, `upsertPlanned*` com categoria/merchant/notas/tags/vínculos, `ConsumerTransactionClient` com `@ts-expect-error`).
- Lacuna de teste coberta por QA: o escopo `AsyncLocalStorage` de `LEDGER_NESTED_TRANSACTION` não tinha teste de isolamento entre requisições concorrentes. Adicionado `src/server/modules/ledger/application/nested-scope-isolation.qa.test.ts` (4 testes: chamada independente durante uow aberta funciona; timer agendado dentro da `fn` herda o escopo e é barrado; escopo não fica preso após falha; 30 uows concorrentes independentes sem rejeição). Sem vazamento.
- Observações menores (sem bloquear): (a) a FC2-F1-03 deve chamar `setTransactionLinks`/`upsertPlanned*` com `actor: 'SYSTEM'` em `syncCardStatuses` e `actor: 'USER'` em `moveTransactionToStatement`; sem `actor` o patch é neutro e sobrescreve o lock; (b) `ConsumerTransactionClient` ainda expõe `$queryRaw`/`$executeRaw`: a barreira para SQL cru em `transactions`/`account_balances` é só o guard estático (limitação já registrada).

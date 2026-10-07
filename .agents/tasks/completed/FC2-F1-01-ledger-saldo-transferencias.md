---
id: FC2-F1-01
title: Ledger + AccountBalance + transferências + cheque especial
status: completed
type: feature
phase: F1
wave: 1
owner: dominio-financeiro
depends_on: [FC2-F0-02]
created_at: 2026-10-05
updated_at: 2026-10-05
affected_modules: [ledger, accounts]
related_use_cases: [createTransaction, updateTransaction, deleteTransaction, changeTransactionStatus, createTransfer, rebuildAccountBalance, getAccountPosition]
related_adrs: [ADR-019, ADR-004, ADR-002, ADR-025]
---

# FC2-F1-01 — Ledger + AccountBalance + transferências + cheque especial

## Contexto
Principal causa de abandono do 1.x: "saldo errado". `monthly-summary.ts` somava só o mês e ignorava transferências; não havia status de lançamento, nem noção de cheque especial. O ADR-019 define o **ledger como fonte de verdade do saldo**: toda movimentação é uma `Transaction` assinada; o saldo de cada conta é a soma dos lançamentos por status e é cacheado em `AccountBalance`, atualizado **na mesma transação** que grava o lançamento e reconciliável (F1-04). O dono usa cheque especial com frequência: saldo negativo é cenário normal e o uso do limite precisa ser exibido, não tratado como erro.

Este módulo é a base de F1-02 (contas), F1-03 (cartões), F1-05, F1-06 e de todo o resto; é a task de domínio mais crítica.

## Problema
- O 1.x grava transações com `type` e valor positivo; saldo era derivado por consultas ad hoc.
- Transferência no 1.x (`src/app/api/transactions/transfer/route.ts`) cria duas pernas em `prisma.$transaction([...])` dentro do Route Handler, sem use-case, sem atualização de cache e sem tratar status.
- Não existe o conceito de lançamento previsto/pendente/conciliado, nem de limite do cheque especial.

## Objetivo
Entregar o módulo `src/server/modules/ledger/` com:
1. Domínio puro (tipos, regras de sinal por `kind`, cálculo de saldo por status, uso do limite).
2. Use-cases transacionais: criar, editar, apagar, mudar status, criar transferência atômica (par ligado por `transferId`), recalcular `AccountBalance`.
3. Repositório Prisma com atualização de `AccountBalance` por incremento atômico na mesma `prisma.$transaction`.
4. Zod/DTOs e route handlers finos para transações e transferências.

## Fora de escopo
- CRUD de contas e cálculo "saldo real" por conta na API (FC2-F1-02).
- Faturas, parcelas, estorno e pagamento de fatura (FC2-F1-03; este módulo só expõe o primitivo de par ligado e o kind `CARD_PAYMENT`).
- Reconciliação com saldo do banco (FC2-F1-04).
- Parser, categorização, createFromDraft (F2), recorrências/PLANNED automáticos (F3-01), matching (F4-04).
- Tela de lançamentos.

## Comportamento atual
1.x: `Transaction { type INCOME|EXPENSE|TRANSFER, amount (positivo), transferId?, creditCardStatementId? }`; saldo calculado nas telas somando por `type`. Transferência: 2 `create` com o mesmo `transferId = crypto.randomUUID()` dentro de `$transaction`; `createTransferSchema` em `finance/http/schemas.ts` valida `sourceAccountId !== destinationAccountId`. Datas de calendário vêm de `localDateSchema` (meio-dia UTC), helper preservado em `src/lib/dates.ts` pela F0-01. Não há cache de saldo.

## Comportamento esperado
### Modelo conceitual (schema da F0-02)
- `Transaction.amount` **assinado** (`> 0` entra na conta; `< 0` sai), nunca zero.
- `kind`: `EXPENSE` (amount < 0), `INCOME` (> 0), `TRANSFER` e `CARD_PAYMENT` (duas pernas: -X na origem, +X no destino, mesmo `transferId`), `FEE` (< 0), `INTEREST` (< 0; juros recebidos de investimento usam `INCOME`), `ADJUSTMENT` (qualquer sinal).
- `status`: `PLANNED` (previsto), `PENDING` (lançado, ainda não compensado), `CLEARED` (compensado), `RECONCILED` (conferido com o banco).
- Datas de calendário = meio-dia UTC (`date`); `postedDate` opcional.
- Saldo de uma conta (`AccountBalance`): `balanceCleared = Σ amount de CLEARED + RECONCILED`, `balancePending = Σ PENDING`, `balancePlanned = Σ PLANNED`.
- Saldo inicial de uma conta = lançamento `ADJUSTMENT` "Saldo inicial", `CLEARED`, `excludeFromBudget = true` (criado pela F1-02); **não existe** coluna `initialBalance`.

### Domínio puro — `src/server/modules/ledger/domain/`
- `types.ts`: `LedgerTxn`, `TxnKind`, `TxnStatus`, `AccountKind`, `AccountPosition`.
- `rules.ts`:
  - `assertSignForKind(kind, amount)`: EXPENSE/FEE/INTEREST exigem `< 0`; INCOME exige `> 0`; TRANSFER/CARD_PAYMENT são validados no par (ver abaixo); ADJUSTMENT aceita qualquer sinal diferente de zero. Erros com código estável (`LEDGER_INVALID_SIGN`, `LEDGER_ZERO_AMOUNT`).
  - `bucketOf(status)`: `PLANNED -> 'planned'`, `PENDING -> 'pending'`, `CLEARED|RECONCILED -> 'cleared'`.
  - `deltaFor(txn)`: devolve `{cleared, pending, planned}` com o `amount` no balde do status e 0 nos demais.
  - `diffDeltas(before, after)`: para edição/mudança de status/conta: delta a aplicar em cada conta (suporta mudança de `accountId`).
  - `validateStatusChange(from, to)`: permitido `PLANNED -> PENDING -> CLEARED -> RECONCILED` e retrocessos entre PLANNED/PENDING/CLEARED; **`RECONCILED -> qualquer` proibido** (código `LEDGER_RECONCILED_LOCKED`) salvo pelo caminho explícito de "desconciliar" da F1-04.
  - `isMutableWhenReconciled(patch)`: para lançamento `RECONCILED`, só `categoryId`, `notes`, `tags`, `merchantId` são editáveis; valor, data, conta e kind não.
- `balance.ts`:
  - `computeBalances(txns): {cleared, pending, planned}` (soma por balde).
  - `limitUsage({ accountType, balanceCleared, balancePending, balancePlanned, overdraftLimit, creditLimit })` devolve `{ limit, used, available, excess, kind: 'OVERDRAFT'|'CREDIT'|'NONE' }` onde, para `CHECKING`/`BUSINESS`: `position = cleared + pending`; `used = min(max(0, -position), overdraftLimit)`; `excess = max(0, -position - overdraftLimit)`; `available = max(0, position) + (overdraftLimit - used)` (o que ainda pode gastar). Para `CREDIT_CARD`: `used = max(0, -(cleared + pending + planned))` limitado a `creditLimit` com `excess` análogo; `available = creditLimit - used`. Outros tipos: `kind: 'NONE'`; saldo negativo gera aviso `NEGATIVE_BALANCE_UNEXPECTED` (não bloqueia).
  - `positionOf(...)`: `{ balanceCleared, balancePending, balancePlanned, current: cleared + pending, projected: cleared + pending + planned, usage }`.
- `transfer.ts`: `buildTransferLegs({ sourceAccountId, destinationAccountId, amount, date, kind, description, status, ... })` retorna as 2 pernas (`-amount` na origem, `+amount` no destino) com o mesmo `transferId` (UUID v4 injetável), valida `source !== destination`, `amount > 0` (valor informado em módulo), `kind ∈ {TRANSFER, CARD_PAYMENT}`; `isTransferLeg(txn)`.

### Aplicação — `src/server/modules/ledger/application/`
Todos recebem `{ userId }` e dependências por injeção (`LedgerRepository`, `clock`, `uuid`) para teste. **Toda** mutação roda em uma única `prisma.$transaction` interativa que (1) grava/atualiza/apaga lançamentos e (2) aplica incrementos em `AccountBalance` (upsert da linha da conta com `increment`, nunca "ler-somar-gravar"), e (3) incrementa `version`.
- `createTransaction(input)`: valida sinal/kind, conta pertence ao usuário e não está arquivada (arquivada só aceita `ADJUSTMENT`), `date` meio-dia UTC, grava, aplica delta, devolve `{ transaction, position }` com o uso do limite e `warnings[]` (`OVERDRAFT_USED`, `OVERDRAFT_LIMIT_EXCEEDED`, `NEGATIVE_BALANCE_UNEXPECTED`). Não bloqueia por limite excedido: o ledger reflete a realidade bancária.
- `updateTransaction(id, patch)`: carrega, aplica `isMutableWhenReconciled` se `RECONCILED`; se o lançamento é perna de transferência, **edição de valor/data/status propaga às duas pernas** (valor com sinais opostos), edição de conta de uma perna é proibida (`LEDGER_TRANSFER_ACCOUNT_IMMUTABLE`); recalcula deltas por `diffDeltas`; `userLocked` registra campos editados manualmente (`{ amount: true, categoryId: true... }`).
- `changeTransactionStatus(id, to)`: aplica `validateStatusChange`; transferência muda as duas pernas juntas.
- `deleteTransaction(id)`: remove (perna de transferência remove o par inteiro); `RECONCILED` não pode ser apagado (`LEDGER_RECONCILED_LOCKED`); reverte os deltas.
- `createTransfer(input)`: `buildTransferLegs`, grava as duas pernas e os dois deltas **atomicamente**; ambas as pernas com o mesmo `status` (default `CLEARED`), `source` e `date`; contas devem ser distintas, pertencer ao usuário e não arquivadas; origem não pode ser `CREDIT_CARD` quando `kind = TRANSFER` (pagamento de cartão usa `CARD_PAYMENT`, F1-03); `INVESTMENT`/`WALLET` podem ser origem. Retorna `{ transferId, outgoing, incoming, positions }`. Reaproveita a ideia do 1.x (`transferId` UUID por par, ADR-004).
- `rebuildAccountBalance(accountId)`: recomputa `AccountBalance` somando `transactions` agrupadas por balde (query `groupBy`) dentro de transação e substitui os três campos; incrementa `version`. Usado por F1-04 e por scripts de reparo; idempotente.
- `getAccountPosition(accountId)` / `listAccountPositions()`: lê `AccountBalance` + conta e devolve `positionOf(...)`.
- Hook `afterLedgerMutation` (no-op nesta task) onde F3 plugará invalidação de projeções.

### HTTP — `src/server/modules/ledger/http/` e rotas
- `schemas.ts`: Zod 4: `createTransactionSchema` (`accountId`, `kind`, `amount` inteiro positivo em centavos, em módulo: **decisão desta task** — a API recebe o módulo e o use-case aplica o sinal conforme o `kind` (EXPENSE/FEE/INTEREST negativo, INCOME positivo); apenas `ADJUSTMENT` recebe `amount` assinado), `date` via `localDateSchema`, `description` 1-255, `categoryId?`, `merchantId?`, `status?`, `notes?`, `tags?`), `updateTransactionSchema`, `createTransferSchema` (`sourceAccountId`, `destinationAccountId`, `amount > 0`, `date`, `description`, `status?`).
- Rotas finas: `POST /api/transactions`, `PATCH /api/transactions/[id]`, `DELETE /api/transactions/[id]`, `POST /api/transactions/[id]/status`, `POST /api/transfers`, `GET /api/transactions` (filtros `from`, `to`, `accountId`, `status`, `q`, paginação por cursor). Cada uma: `requireAuth()` -> Zod -> use-case -> JSON; erros de domínio mapeados para 400/404/409 com `{ error, code }`.

## Regras de negócio
- RN-01: Valores em centavos, `Int`; `amount` nunca é zero; sinal obrigatório conforme `kind` (RN do domínio, validado antes do banco; o CHECK do banco é segunda barreira).
- RN-02: O saldo de uma conta é `Σ amount` dos seus lançamentos; `AccountBalance` é cache atualizado **na mesma transação** da mutação, por incremento atômico.
- RN-03: Transferência e pagamento de fatura são **pares ligados** (`transferId`), criados, editados, alterados de status e apagados juntos; uma perna por conta.
- RN-04: Cheque especial: saldo negativo em `CHECKING`/`BUSINESS` é permitido até `overdraftLimit`; o uso (`used`) e o excedente (`excess`) são **informados**, nunca bloqueiam o lançamento.
- RN-05: `RECONCILED` é imutável em valor, data, conta e kind; só rótulos (categoria, notas, tags, merchant) mudam.
- RN-06: Conta arquivada só aceita `ADJUSTMENT`.
- RN-07: Datas de calendário sempre meio-dia UTC (`localDateSchema`); o domínio rejeita datas fora desse padrão em `createTransaction`.
- RN-08: Toda consulta e mutação filtra por `userId`; id de outro usuário => 404.
- RN-09: Mutação financeira só existe como use-case (reuso por UI, bot e MCP; ADR-025). Route handlers não fazem regra.

## Critérios de aceitação
- [x] CA-01: Para qualquer sequência de operações (criar, editar valor, mudar status, apagar, transferir), `AccountBalance` de cada conta é igual a `computeBalances` sobre os lançamentos da conta (teste de propriedade com sequência aleatória de semente fixa, 200 operações).
- [x] CA-02: `createTransfer` de R$ 100,00 da conta A para a B grava exatamente 2 lançamentos com o mesmo `transferId`, `amount` -10000 em A e +10000 em B, e muda os saldos de A e B em -10000/+10000 na mesma transação; se a escrita da segunda perna falhar, nada é gravado e nenhum saldo muda (teste com falha injetada).
- [x] CA-03: `createTransfer` com origem = destino, `amount <= 0`, conta de outro usuário ou conta arquivada falha com código estável e sem efeitos.
- [x] CA-04: Editar o valor de uma perna de transferência para R$ 150,00 altera as duas pernas (-15000/+15000) e ajusta os dois `AccountBalance`; editar `accountId` de uma perna retorna `LEDGER_TRANSFER_ACCOUNT_IMMUTABLE`.
- [x] CA-05: Apagar uma perna remove as duas e reverte os dois saldos.
- [x] CA-06: Conta `CHECKING` com `overdraftLimit = 100000` e saldo 20000: despesa de 50000 devolve posição `current = -30000`, `usage = { used: 30000, excess: 0, available: 70000 }` e `warnings` contendo `OVERDRAFT_USED`; despesa adicional de 90000 devolve `used = 100000`, `excess = 20000` e `OVERDRAFT_LIMIT_EXCEEDED`; **ambas são gravadas** (não há erro).
- [x] CA-07: Conta `SAVINGS` com saldo negativo devolve `NEGATIVE_BALANCE_UNEXPECTED` (sem erro).
- [x] CA-08: Lançamentos por status: `PLANNED` de +500000 não altera `balanceCleared` e altera apenas `balancePlanned`; mudar para `CLEARED` move 500000 de `planned` para `cleared`.
- [x] CA-09: `RECONCILED -> CLEARED` retorna `LEDGER_RECONCILED_LOCKED`; editar o valor de um lançamento `RECONCILED` também; editar apenas `notes` é permitido.
- [x] CA-10: `rebuildAccountBalance` corrige um `AccountBalance` propositalmente corrompido (teste de integração) e é idempotente. Verificado pelo QA contra Postgres 16 (Docker): `prisma-ledger-repository.integration.test.ts` passa.
- [x] CA-11: Duas criações concorrentes na mesma conta (`Promise.all` de 20 despesas de 100) resultam em `balanceCleared` igual à soma exata (sem perda por corrida) — teste de integração com `DATABASE_URL_TEST`; sem a variável, teste marcado `skip` com motivo. Verificado pelo QA contra Postgres 16, inclusive na primeira criação da linha de cache (o `upsert` do Prisma 7 usa `INSERT ... ON CONFLICT`; 30 contas novas x 8 despesas, 3 rodadas, sem perda).
- [x] CA-12: Todos os testes de domínio passam com `TZ=America/Sao_Paulo` e `TZ=UTC` (rodar ambos).
- [x] CA-13: `rg "prisma" src/server/modules/ledger/domain` não encontra nada (domínio puro).
- [x] CA-14: `npm run lint`, `npm test`, `npx next build`, `npm run format:check` passam.

## Impacto técnico
### Backend
Módulo novo `src/server/modules/ledger/{domain,application,infra,http}`. Estrutura: `domain/{types,rules,balance,transfer}.ts` + `.test.ts` ao lado; `application/{create-transaction,update-transaction,delete-transaction,change-status,create-transfer,rebuild-balance,get-position}.ts`; `infra/prisma-ledger-repository.ts` implementando a porta `LedgerRepository` (`withTransaction`, `findTxn`, `findTransferLegs`, `insertTxns`, `updateTxn`, `deleteTxns`, `incrementBalance(accountId, {cleared,pending,planned})`, `sumByBucket(accountId)`) e `infra/in-memory-ledger-repository.ts` para testes de aplicação. Rotas em `src/app/api/transactions/**` e `src/app/api/transfers/route.ts`.
### Frontend
Nenhum.
### Banco de dados
Usa as tabelas da F0-02 (`transactions`, `account_balances`, `accounts`). Atualização de saldo por `UPDATE account_balances SET balance_cleared = balance_cleared + $1, ...` (Prisma `increment`); `version` incrementa a cada mutação. Sem migration nova. Se faltar índice, abrir pendência para dados-prisma.
### Integrações
Nenhuma.
### Segurança
`userId` em toda query; validação Zod em toda entrada; erros sem vazar stack; ids de outro usuário retornam 404. Nenhum dado real em testes (valores redondos fictícios).

## Plano de implementação
- [x] Etapa 1 — Ler ADR-019, ADR-004, §5/§6 da especificação, schema 2.0 (`Transaction`, `AccountBalance`) e a rota de transferência do 1.x via `git show fc-1.x-final:src/app/api/transactions/transfer/route.ts`.
- [x] Etapa 2 — Domínio: `types.ts`, `rules.ts`, `balance.ts`, `transfer.ts` com testes (tabelas de casos abaixo).
- [x] Etapa 3 — Porta `LedgerRepository` + repositório em memória.
- [x] Etapa 4 — Use-cases com testes sobre o repositório em memória (inclui falha injetada e corrida simulada).
- [x] Etapa 5 — Repositório Prisma (`incrementBalance` por `upsert`+`increment` dentro de `$transaction` interativa); testes de integração com `DATABASE_URL_TEST` (`describe.skipIf`).
- [x] Etapa 6 — `http/schemas.ts` + testes de schema; rotas finas.
- [x] Etapa 7 — Teste de propriedade (CA-01) com gerador pseudoaleatório de semente fixa (sem dependência nova).
- [x] Etapa 8 — Documentar em `docs/domain/ledger.md` e `docs/data/` (regras de sinal, status, cache); `.agents/context/CONTEXT.md`, `PLANS.md`; commit `feat(f1-ledger): ledger, saldos e transferências atômicas`.

## Estratégia de testes
- [x] Unitários (domínio): `assertSignForKind`: EXPENSE com +100 falha; INCOME com -100 falha; amount 0 falha para todos; ADJUSTMENT aceita ±. `deltaFor`: 1 caso por status. `diffDeltas`: mudança de valor, de status (PLANNED->CLEARED), de conta (move delta de A para B), valor+status juntos. `validateStatusChange`: matriz 4x4 completa (RECONCILED como origem sempre falha). `limitUsage`: saldo positivo; zero; negativo dentro do limite; exatamente no limite; acima (excess); `overdraftLimit = 0` com saldo negativo (excess = |saldo|); cartão com compras PENDING + PLANNED; tipo SAVINGS negativo; valores grandes próximos de 2^31 não estouram (usar `Number` seguro e validar `Int` do banco: rejeitar `|amount| > 2_000_000_000`). `buildTransferLegs`: sinais opostos, mesmo `transferId`, pernas na ordem origem/destino, origem = destino falha.
- [x] Unitários (aplicação, repositório em memória): criar/editar/apagar mantém `AccountBalance` igual ao recomputado; transferência atômica (falha na segunda perna desfaz a primeira); edição de perna propaga; `RECONCILED` imutável; conta arquivada; usuário errado => 404; `PLANNED` não afeta cleared.
- [x] Integração (banco de teste): CA-10, CA-11 e unicidade `@@unique([transferId, accountId])` (inserir 2 pernas na mesma conta falha); CHECK `amount <> 0`.
- [x] E2E: não aplicável.
- [x] Manual: via `curl` com cookie de sessão: criar duas contas (SQL manual ou F1-02), transferir, conferir saldos; criar despesa que usa cheque especial e ler o aviso.

## Riscos e rollback
- **Corrida em saldo**: mitigada por incremento atômico (nunca ler-somar-gravar) e por `rebuildAccountBalance` como rede de segurança.
- **Divergência cache x ledger** por escrita fora dos use-cases (SQL manual, import em massa): proibir `prisma.transaction.create/update/delete` fora do repositório do ledger (regra ESLint `no-restricted-syntax` ou teste de grep em `src/server`), e job de verificação em F3.
- **Cartão e status**: a semântica PENDING/CLEARED/PLANNED para contas de cartão é definida na F1-03; este módulo apenas soma por balde, sem assumir significado de fatura.
- **Sinal na API** (módulo vs assinado): decisão documentada em "Decisões"; se mudar, reescrever os schemas e testes antes da F2-03.
- Rollback: `git revert`; sem migration própria. Dados criados por testes de integração ficam no banco de teste descartável.

## Registro de execução
### Alterações realizadas
- Domínio puro (`domain/`): tipos e códigos de erro estáveis (`LedgerError` com categoria INVALID/NOT_FOUND/CONFLICT), regras de sinal por kind, baldes e deltas (`deltaFor`, `diffDeltas`, `mergeDeltas`), matriz de status, imutabilidade de `RECONCILED`, `computeBalances`, `limitUsage`, `positionOf` (com avisos) e `buildTransferLegs`/`assertTransferPair`.
- Aplicação (`application/`): porta `LedgerRepository`/`LedgerTx`/`LedgerReader`; use-cases `createTransaction`, `updateTransaction`, `deleteTransaction`, `changeTransactionStatus`, `createTransfer`, `rebuildAccountBalance`, `getAccountPosition`, `listAccountPositions`, `listTransactions`; fachada `createLedgerService(deps)`; hook `afterLedgerMutation` (no-op, pós-commit).
- Infra: `PrismaLedgerRepository` (`$transaction` interativa; `incrementBalance` por `upsert`+`increment`; `sumByBucket` por `groupBy`), `InMemoryLedgerRepository` (rollback, serialização, unicidade de perna, falha injetável), `getLedgerService()`.
- HTTP: schemas Zod 4 (`.strict()`), DTO, mapeamento de erros e rotas `POST/GET /api/transactions`, `PATCH/DELETE /api/transactions/[id]`, `POST /api/transactions/[id]/status`, `POST /api/transfers`, todas com `requireAuth()` no handler.
- `src/lib/dates.ts`: `localDateSchema` agora é estrito (rejeita `2026-02-30`), fechando a pendência deixada pela F0-01.
- Guard `tests/guards/ledger-boundaries.test.ts`: só `ledger/infra` escreve em `transactions`/`account_balances`; `ledger/domain` sem Prisma nem imports de camadas externas; rotas sem Prisma.
- Docs: `docs/domain/ledger.md` (novo), índice `docs/domain/README.md`, nota em `docs/data/modelo-fc2.md`.
### Arquivos principais
- `src/server/modules/ledger/domain/{types,rules,balance,transfer}.ts` (+ testes)
- `src/server/modules/ledger/application/{ports,shared,create-transaction,update-transaction,delete-transaction,change-status,create-transfer,rebuild-balance,get-position,ledger-service,test-helpers}.ts` (+ `create-transaction.test.ts`, `transfer-and-edit.test.ts`, `ledger.property.test.ts`)
- `src/server/modules/ledger/infra/{prisma-ledger-repository,in-memory-ledger-repository,ledger-service}.ts` e `prisma-ledger-repository.integration.test.ts`
- `src/server/modules/ledger/http/{schemas,dto,error-response,route}.ts` (+ `schemas.test.ts`, `routes.test.ts`)
- `src/app/api/transactions/{route.ts,[id]/route.ts,[id]/status/route.ts}`, `src/app/api/transfers/route.ts`
- `tests/guards/ledger-boundaries.{ts,test.ts}`, `src/lib/dates.{ts,test.ts}`
### Decisões
- **API recebe módulo; use-case aplica sinal.** `POST /api/transactions` e `POST /api/transfers` recebem `amount` positivo em centavos; o use-case aplica o sinal pelo `kind` (EXPENSE/FEE/INTEREST negativo, INCOME positivo). Só `ADJUSTMENT` recebe valor assinado (nunca zero). No `PATCH`, `amount` também é em módulo (ou assinado se o kind final for `ADJUSTMENT`); em perna de transferência é o módulo do par.
- `TRANSFER` e `CARD_PAYMENT` não são criáveis por `createTransaction` (`LEDGER_USE_TRANSFER`); `createTransfer` aceita `kind` (padrão `TRANSFER`) para a F1-03 reaproveitar com `CARD_PAYMENT`.
- Pares ficam sempre `excludeFromBudget = true` e sem categoria (dupla contagem é bug); `excludeFromBudget = false` em perna é rejeitado.
- `RECONCILED` não é status inicial. Conciliar por `changeTransactionStatus(..., 'RECONCILED')` (somente a partir de `CLEARED`) afeta **só a perna informada** (conciliação é por conta); demais mudanças de status propagam ao par, e uma perna conciliada trava o par para valor/data/status/exclusão.
- `userLocked`: edição manual (`actor: 'USER'`, padrão) registra os campos editados; `actor: 'SYSTEM'` ignora campos travados e devolve `skippedFields` sem travar nada (ADR-024).
- Deltas de saldo são aplicados em ordem de `accountId` (evita deadlock entre transferências opostas). Hook pós-commit nunca desfaz a mutação.
- `rebuildAccountBalance` trava a linha do cache (incremento zero) antes de somar, para não perder escritas concorrentes.
- Regra contra escrita fora do ledger: teste de grep em `tests/guards/` (sem alterar `eslint.config.mjs`).
- Gerador pseudoaleatório próprio (mulberry32) no teste de propriedade: sem dependência nova.
### Divergências
- A regra "RECONCILED nunca propaga" e a validação de `PLANNED/PENDING -> RECONCILED` como `LEDGER_INVALID_STATUS_CHANGE` não estavam na task (a task só proibia sair de RECONCILED); foram adicionadas por coerência com a conciliação por conta.
- `version` não incrementa em edições só de rótulos (sem delta de saldo); `rebuildAccountBalance` incrementa uma vez (a trava) e não altera `version` ao substituir os baldes.
- `lastEntryDate` de `AccountBalance` não é mantido nesta task (incremento atômico não calcula "máximo" sem SQL cru).
- Etapa 8 (atualizar `.agents/context/CONTEXT.md` e `PLANS.md`) ficou com o orquestrador, por instrução; o commit é `feat(f1-ledger): ledger, saldos e transferencias atomicas`.
- `localDateSchema` estrito (alteração em `src/lib/dates.ts`, fora do módulo): único arquivo compartilhado tocado.
### Pendências
- **Testes de integração com Postgres (CA-10, CA-11, unicidade de perna, CHECK, atomicidade, concorrência cruzada) escritos mas NÃO executados**: não havia Postgres/Docker disponível. Rodar com `DATABASE_URL_TEST` (database com "test" no nome, migrations aplicadas) antes de fechar a F1. Risco conhecido a observar: corrida de **primeira criação** da linha de `account_balances` (o CA-11 usa conta sem linha); o `upsert` do Prisma deve usar `INSERT ... ON CONFLICT`, mas a F1-02 deve criar a linha junto com a conta.
- `dados-prisma`: baldes `INT4` (~R$ 21 milhões); sem CHECK de sinal por `kind`; sem manutenção de `last_entry_date`.
- Teste manual com `curl` não executado (sem banco/sessão).
- Verificação de deriva em job (F3, ADR-030) usa `rebuildAccountBalance`/`sumByBucket`.

## Validação
Executado em `.claude/worktrees` (Windows, Node local, sem banco):

- `npm run lint`: sem avisos.
- `npm run typecheck`: sem erros.
- `npm test`: 30 arquivos passam + 1 `skip` (integração Postgres, 11 testes `skip`); 519 testes passam.
- CA-12: `TZ=UTC npx vitest run src/server/modules/ledger` roda **sob a config padrão, que fixa `TZ=America/Sao_Paulo` (`vitest.config.mts` e `tests/helpers/setup.ts`), portanto o override é ignorado**. Para validar de fato, rodei os testes do ledger e de `src/lib/dates` com uma config temporária (removida) sem fixar fuso, com `TZ=UTC`, `TZ=America/Sao_Paulo` e `TZ=Pacific/Kiritimati` (UTC+14): 164 passam / 11 skip nos três.
- `npm run guard:data`: 4 arquivos, 172 testes passam.
- `npx prettier --check --end-of-line auto .`: ok.
- `DATABASE_URL=postgresql://ci:ci@localhost:5432/ci npx next build`: compilou; rotas `/api/transactions`, `/api/transactions/[id]`, `/api/transactions/[id]/status` e `/api/transfers` registradas.
- `rg prisma src/server/modules/ledger/domain` (sem diferenciar maiúsculas): vazio (e coberto por guard).
- `npm run test:coverage`: domínio do ledger 100% linhas / 98,4% branches (limite 80%).
- CA-01: 5 sementes x 200 operações (criar, transferir, editar valor/conta/data, mudar status inclusive RECONCILED, apagar) com invariante cache == `computeBalances` e pares somando zero a cada passo; `rebuild` final sem deriva.

### Parecer QA (revisão de FC2-F1-01, commit 4b3564d)
**REPROVADO** por 1 bloqueante (concorrência sobre o MESMO lançamento); todo o restante atende.

Comandos (worktree, Windows): `npm run lint` ok; `npm run typecheck` ok; `npm test` 30 arquivos / 519 testes ok (+18 skip de integração sem banco); `npm run guard:data` 172 ok; `npx prettier --check --end-of-line auto .` ok; `npm run test:coverage` domínio do ledger 100% linhas / 98,44% branches; `DATABASE_URL=postgresql://ci:ci@localhost:5432/ci npx next build` ok (4 rotas do ledger registradas).

Postgres 16 em Docker (`prisma migrate deploy` + `DATABASE_URL_TEST`): `src/server/modules/ledger/infra` 10 passam / 1 skip (o skip é o placeholder do `runIf(!db)`); CA-10 e CA-11 ok; unicidade de perna, CHECK `amount <> 0` e CHECK de TRANSFER sem `transferId` ok; atomicidade ok; transferências cruzadas A<->B concorrentes sem deadlock. Testes QA adicionais (`prisma-ledger-repository.qa.integration.test.ts`): primeira criação de linha de cache sob carga (30 contas x 8 criações concorrentes, 3 rodadas), 3 contas com 36 transferências cruzadas e rebuild concorrente com criações passam; **4 falham de forma determinística (3 execuções)**: DELETE x2 simultâneos, mudança de status x2 simultânea, 3 PATCH de valor simultâneos e PATCH x DELETE simultâneos no mesmo lançamento.

Smoke HTTP (`next start -p 3113`, banco descartável, usuário criado por SQL com hash bcrypt de `<senha>` gerada na hora; login por curl com `<cookie>`): ajuste 20000 + despesa 50000 => `current -30000`, `usage {used 30000, excess 0, available 70000}`, `OVERDRAFT_USED`; despesa 90000 => `used 100000, excess 20000`, `OVERDRAFT_USED` + `OVERDRAFT_LIMIT_EXCEEDED`, ambas 201; transferência A->B 10000 grava 2 pernas (-10000/+10000), `excludeFromBudget = true`, sem categoria, saldos conferem; PATCH 15000 na perna destino => -15000/+15000; PATCH `accountId` na perna => 409 `LEDGER_TRANSFER_ACCOUNT_IMMUTABLE`; PLANNED propaga ao par; sem cookie 401; origem=destino 400; conta de outro usuário 404 `LEDGER_ACCOUNT_NOT_FOUND`; id inexistente 404; data 2026-02-30 400; `kind: TRANSFER` em `/api/transactions` 400; JSON inválido 400; campo extra (`userId`) 400. Servidor encerrado pelo PID.

CA-12: `vitest.config.mts` + `tests/helpers/setup.ts` fixam `TZ`, então o override é ignorado; repeti com config temporária (removida) sem fixar fuso: `TZ=UTC`, `America/Sao_Paulo` e `Pacific/Kiritimati` => 164 passam / 18 skip nos três.

**Bloqueante B1 — corrida de leitura-modificação-escrita sobre o mesmo lançamento (cache deriva do ledger em silêncio).** `update-transaction.ts`, `change-status.ts` e `delete-transaction.ts` leem o lançamento com `loadTxn`/`loadWithCounterpart` (SELECT sem lock, READ COMMITTED) e calculam o delta a partir dessa leitura; duas requisições simultâneas sobre o mesmo id (duplo clique, retry de rede, bot + UI) aplicam o delta duas vezes. Evidência (Postgres): DELETE x2 de uma despesa de 1000 (saldo certo 5000) => cache 6000; status PENDING->CLEARED x2 => cache `{cleared 14000, pending -7000}` com ledger `{cleared 7000, pending 0}`; PATCH x3 de valor => cache -7000, ledger -3000; PATCH x DELETE => cache -1000, ledger 0. Os testes em memória não pegam porque o `InMemoryLedgerRepository` serializa as transações. Correção sugerida (infra): `findTxn`/`findTransferLegs` dentro de `withTransaction` devem travar as linhas (`SELECT ... FOR UPDATE`, ordenado por id, via `$queryRaw` com `userId`), relendo o estado já commitado; e/ou `deleteTxns` conferir `count === ids.length` e `updateTxn` usar compare-and-set (status/amount esperados). Reexecutar `prisma-ledger-repository.qa.integration.test.ts`: deve ficar 7/7 verde. Também fazer o repositório em memória simular o lock para o teste de aplicação cobrir o caso.

Importante I1: duas edições simultâneas em pernas opostas do mesmo par travam as linhas de `transactions` em ordens diferentes (perna do id vs. contraparte) e podem dar deadlock do Postgres (40P01) => hoje vira 500 genérico; o `FOR UPDATE` ordenado por id do B1 resolve e deve ser coberto por teste.
Importante I2: `docs/domain/ledger.md` e a task devem registrar que o ledger depende de lock por linha para mutações sobre o mesmo lançamento (RN novo) assim que o B1 for corrigido.
Menor M1: erros de banco inesperados (P2002/P2025/40P01) viram 500 genérico; considerar mapear conflito de concorrência para 409 `LEDGER_CONCURRENT_UPDATE` com retry.
Menor M2: o checkbox "Integração (banco de teste)" permanece pendente até o B1 ser corrigido (CA-10/CA-11 já verificados).
Menor M3: `last_entry_date` não mantido e baldes INT4 (já registrados como pendência para dados-prisma).

### Ciclo de correção 1 (resposta ao parecer QA: B1, I1, I2, M1, M2)
**Abordagem.**
- **B1 (lock por linha).** A porta `LedgerTx` ganhou `lockTxns(userId, ids)`: no Postgres, um único `SELECT id FROM transactions WHERE user_id = $1 AND id = ANY($2::text[]) ORDER BY id FOR UPDATE` (`$queryRaw` parametrizado, sempre com `userId`) seguido da leitura do estado commitado; ids apagados ou de outro usuário não voltam. O helper `loadLockedWithCounterpart` (`application/shared.ts`) lê o lançamento, descobre as pernas do par, trava **todas juntas** e devolve o estado já commitado; `updateTransaction`, `changeTransactionStatus` e `deleteTransaction` passam a usá-lo (as leituras sem lock `loadTxn`/`loadWithCounterpart` deixaram de ser usadas por essas mutações; `loadWithCounterpart` foi removido). Lançamento apagado enquanto esperávamos o lock vira 404 `LEDGER_TXN_NOT_FOUND`. `deleteTransaction` confere `deleteTxns === legs.length` (senão `LEDGER_CONCURRENT_UPDATE` e rollback). Compare-and-set em `updateTxn` não foi necessário: com a linha travada e relida, o `UPDATE` não corre contra ninguém; `P2025` residual vira 409.
- **I1 (deadlock entre pernas).** As duas pernas do par travam no mesmo comando e na ordem do `ORDER BY id`; ordem global de locks: `transactions` (ordenado) e depois `account_balances` (por `accountId`, já existente).
- **M1 (409).** Novo código estável `LEDGER_CONCURRENT_UPDATE` (categoria `CONFLICT`, HTTP 409). `PrismaLedgerRepository.withTransaction` refaz a transação inteira **uma vez** em deadlock/serialização (40P01, 40001, P2034) e, se persistir, ou em `P2025`, lança `LEDGER_CONCURRENT_UPDATE`; classificação em `infra/concurrency.ts`.
- **I2 (documentação).** Regra de lock por linha e a nova linha do contrato de erros em `docs/domain/ledger.md`.
- **Repositório em memória.** Reescrito para simular a semântica real: transação própria por chamada (sem fila global), leituras sem lock, locks de linha por dono (`lockTxns`, UPDATE/DELETE/INSERT e incremento/ajuste de saldo seguram a linha até o fim da transação), log de desfazer para rollback e detecção de deadlock (erro 40P01 simulado). Antes ele serializava todas as transações e escondia o bug.

**Testes adicionados (nenhum teste do QA foi alterado).**
- `application/concurrency.test.ts` (8): DELETE x2, status x2, 3 PATCH, PATCH x DELETE, `deleteTxns` devolvendo menos linhas (409 + rollback), edições simultâneas nas duas pernas, status/DELETE/PATCH em pernas opostas, rajada de 20 mutações no par. Contra a leitura sem lock, 6 dos 8 falham (verificado trocando temporariamente o `lockTxns` por `findTxn`); com o lock, passam.
- `infra/concurrency.test.ts` (7): classificação de erros (40P01/40001/P2034/P2025 em `code`, `meta`, `cause`, mensagem) e `withTransaction` com cliente simulado (1 retry em deadlock, 409 se persistir, 409 em P2025 sem retry, demais erros intactos).
- `infra/prisma-ledger-repository.locking.integration.test.ts` (3, Postgres real): 15 rodadas de 6 edições simultâneas nas duas pernas do mesmo par (sem rejeição, **sem retry**: o repositório sob teste conta as chamadas a `$transaction`, pois um retry mascararia o deadlock), 15 rodadas de PATCH/status/DELETE em pernas opostas (só 404 de domínio; par com 0 ou 2 pernas; cache = ledger) e `lockTxns` com ordens opostas de ids e id de outro usuário.
- `http/routes.test.ts`: `LEDGER_CONCURRENT_UPDATE` mapeia para 409 com o código estável.

**Evidência (Postgres 16 em Docker, database descartável `fc2_fixledger_test`, `prisma migrate deploy`, `DATABASE_URL_TEST`).** `npx vitest run src/server/modules/ledger`, três rodadas seguidas: **13 arquivos passam, 195 testes passam, 1 skip (placeholder `runIf(!db)`)** nas três; `prisma-ledger-repository.qa.integration.test.ts` **7/7 verde** (eram 3/7). Sanidade: retirando só o `FOR UPDATE`, 5 testes de integração (3 do QA + 2 de lock) voltam a falhar. Container encerrado ao fim.

**Validação final (worktree).** `npm run lint` e `npm run typecheck` sem erros/avisos; `npm test` 32 arquivos passam + 3 skip, 534 testes passam + 21 skip (sem banco); `npm run guard:data` 172 ok; `npx prettier --check --end-of-line auto .` ok; `npm run test:coverage` domínio do ledger 100% linhas / 98,44% branches; `DATABASE_URL=postgresql://ci:ci@localhost:5432/ci npx next build` ok (4 rotas do ledger registradas). Sem migration.

**Pendência derivada.** O checkbox "Integração (banco de teste)" da estratégia de testes foi marcado (M2); `last_entry_date` e baldes `INT4` (M3) seguem como pendência para `dados-prisma`.

### Parecer QA (re-revisão, commit d2a91d0)
**APROVADO.** B1, I1, I2, M1 e M2 do parecer anterior fechados; nenhum achado bloqueante ou importante novo.

Comandos (worktree, Windows): `npm run lint` ok; `npm run typecheck` ok; `npm test` 32 arquivos / 534 testes ok (+21 skip sem banco); `npm run guard:data` 172 ok; `npx prettier --check --end-of-line auto .` ok; `npm run test:coverage` domínio do ledger 100% linhas / 98,44% branches; `DATABASE_URL=postgresql://ci:ci@localhost:5432/ci npx next build` ok (4 rotas do ledger registradas).

B1 fechado (Postgres 16 em Docker descartável, `prisma migrate deploy`, `DATABASE_URL_TEST`; `DATABASE_URL` de produção não usada): `npx vitest run src/server/modules/ledger` três rodadas seguidas, 13 arquivos / 195 testes passam / 1 skip (placeholder `runIf(!db)`). `prisma-ledger-repository.qa.integration.test.ts` 7/7 (eram 3/7) e `git diff 2594342..d2a91d0` sobre esse arquivo vazio (testes do QA intactos). Prova de controle própria: removido só o `FOR UPDATE`, 5 testes voltam a falhar (3 do QA: status duplo, edições simultâneas, edição x DELETE; 2 de lock do implementador); restaurado por `git checkout`.

Verificações de código: (a) `lockTxns` e SQL: `$queryRaw` com template tagged (parâmetros ligados, sem interpolação de string), sempre `user_id = ${userId}`, `ORDER BY id FOR UPDATE`, depois releitura com `userId`; (b) ordem de lock: pernas do par travam num único comando ordenado; escritas seguem `transactions` e depois `account_balances` (ordem de `accountId`); `rebuild` trava só o cache e soma por leitura, sem lock em `transactions`, sem ciclo possível; (c) retry: `withTransaction` refaz a transação inteira (nova chamada a `$transaction`, a anterior já foi desfeita), 1 vez em 40P01/40001/P2034, depois 409 `LEDGER_CONCURRENT_UPDATE`; P2025 vai direto a 409; sem efeito duplicado: `uuid` do par e `buildTransferLegs` rodam antes do `withTransaction`, e `notifyMutation`/`afterLedgerMutation` só roda depois do commit, fora do laço de retry; (d) `InMemoryLedgerRepository` reescrito mantém a fidelidade (leituras sem lock, locks por dono até o fim da transação, rollback por log, deadlock simulado) e o teste CA-01 (`ledger.property.test.ts`, via `makeLedgerEnv`) continua verde; (e) `LEDGER_CONCURRENT_UPDATE` mapeado para 409 com teste em `http/routes.test.ts`.

Menor M4: o `InMemoryLedgerRepository` não aplica o retry de deadlock (vive só no repositório Prisma, coberto por `infra/concurrency.test.ts` com cliente simulado); aceitável, sem ação.
Menor M3 (herdado): `last_entry_date` não mantido e baldes INT4, pendência para `dados-prisma`.

## Handoff
Link para o handoff ativo, quando aplicável.

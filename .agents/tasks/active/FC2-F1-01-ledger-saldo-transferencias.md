---
id: FC2-F1-01
title: Ledger + AccountBalance + transferências + cheque especial
status: active
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
- [ ] CA-01: Para qualquer sequência de operações (criar, editar valor, mudar status, apagar, transferir), `AccountBalance` de cada conta é igual a `computeBalances` sobre os lançamentos da conta (teste de propriedade com sequência aleatória de semente fixa, 200 operações).
- [ ] CA-02: `createTransfer` de R$ 100,00 da conta A para a B grava exatamente 2 lançamentos com o mesmo `transferId`, `amount` -10000 em A e +10000 em B, e muda os saldos de A e B em -10000/+10000 na mesma transação; se a escrita da segunda perna falhar, nada é gravado e nenhum saldo muda (teste com falha injetada).
- [ ] CA-03: `createTransfer` com origem = destino, `amount <= 0`, conta de outro usuário ou conta arquivada falha com código estável e sem efeitos.
- [ ] CA-04: Editar o valor de uma perna de transferência para R$ 150,00 altera as duas pernas (-15000/+15000) e ajusta os dois `AccountBalance`; editar `accountId` de uma perna retorna `LEDGER_TRANSFER_ACCOUNT_IMMUTABLE`.
- [ ] CA-05: Apagar uma perna remove as duas e reverte os dois saldos.
- [ ] CA-06: Conta `CHECKING` com `overdraftLimit = 100000` e saldo 20000: despesa de 50000 devolve posição `current = -30000`, `usage = { used: 30000, excess: 0, available: 70000 }` e `warnings` contendo `OVERDRAFT_USED`; despesa adicional de 90000 devolve `used = 100000`, `excess = 20000` e `OVERDRAFT_LIMIT_EXCEEDED`; **ambas são gravadas** (não há erro).
- [ ] CA-07: Conta `SAVINGS` com saldo negativo devolve `NEGATIVE_BALANCE_UNEXPECTED` (sem erro).
- [ ] CA-08: Lançamentos por status: `PLANNED` de +500000 não altera `balanceCleared` e altera apenas `balancePlanned`; mudar para `CLEARED` move 500000 de `planned` para `cleared`.
- [ ] CA-09: `RECONCILED -> CLEARED` retorna `LEDGER_RECONCILED_LOCKED`; editar o valor de um lançamento `RECONCILED` também; editar apenas `notes` é permitido.
- [ ] CA-10: `rebuildAccountBalance` corrige um `AccountBalance` propositalmente corrompido (teste de integração) e é idempotente.
- [ ] CA-11: Duas criações concorrentes na mesma conta (`Promise.all` de 20 despesas de 100) resultam em `balanceCleared` igual à soma exata (sem perda por corrida) — teste de integração com `DATABASE_URL_TEST`; sem a variável, teste marcado `skip` com motivo.
- [ ] CA-12: Todos os testes de domínio passam com `TZ=America/Sao_Paulo` e `TZ=UTC` (rodar ambos).
- [ ] CA-13: `rg "prisma" src/server/modules/ledger/domain` não encontra nada (domínio puro).
- [ ] CA-14: `npm run lint`, `npm test`, `npx next build`, `npm run format:check` passam.

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
- [ ] Etapa 1 — Ler ADR-019, ADR-004, §5/§6 da especificação, schema 2.0 (`Transaction`, `AccountBalance`) e a rota de transferência do 1.x via `git show fc-1.x-final:src/app/api/transactions/transfer/route.ts`.
- [ ] Etapa 2 — Domínio: `types.ts`, `rules.ts`, `balance.ts`, `transfer.ts` com testes (tabelas de casos abaixo).
- [ ] Etapa 3 — Porta `LedgerRepository` + repositório em memória.
- [ ] Etapa 4 — Use-cases com testes sobre o repositório em memória (inclui falha injetada e corrida simulada).
- [ ] Etapa 5 — Repositório Prisma (`incrementBalance` por `upsert`+`increment` dentro de `$transaction` interativa); testes de integração com `DATABASE_URL_TEST` (`describe.skipIf`).
- [ ] Etapa 6 — `http/schemas.ts` + testes de schema; rotas finas.
- [ ] Etapa 7 — Teste de propriedade (CA-01) com gerador pseudoaleatório de semente fixa (sem dependência nova).
- [ ] Etapa 8 — Documentar em `docs/domain/ledger.md` e `docs/data/` (regras de sinal, status, cache); `.agents/context/CONTEXT.md`, `PLANS.md`; commit `feat(f1-ledger): ledger, saldos e transferências atômicas`.

## Estratégia de testes
- [ ] Unitários (domínio): `assertSignForKind`: EXPENSE com +100 falha; INCOME com -100 falha; amount 0 falha para todos; ADJUSTMENT aceita ±. `deltaFor`: 1 caso por status. `diffDeltas`: mudança de valor, de status (PLANNED->CLEARED), de conta (move delta de A para B), valor+status juntos. `validateStatusChange`: matriz 4x4 completa (RECONCILED como origem sempre falha). `limitUsage`: saldo positivo; zero; negativo dentro do limite; exatamente no limite; acima (excess); `overdraftLimit = 0` com saldo negativo (excess = |saldo|); cartão com compras PENDING + PLANNED; tipo SAVINGS negativo; valores grandes próximos de 2^31 não estouram (usar `Number` seguro e validar `Int` do banco: rejeitar `|amount| > 2_000_000_000`). `buildTransferLegs`: sinais opostos, mesmo `transferId`, pernas na ordem origem/destino, origem = destino falha.
- [ ] Unitários (aplicação, repositório em memória): criar/editar/apagar mantém `AccountBalance` igual ao recomputado; transferência atômica (falha na segunda perna desfaz a primeira); edição de perna propaga; `RECONCILED` imutável; conta arquivada; usuário errado => 404; `PLANNED` não afeta cleared.
- [ ] Integração (banco de teste): CA-10, CA-11 e unicidade `@@unique([transferId, accountId])` (inserir 2 pernas na mesma conta falha); CHECK `amount <> 0`.
- [ ] E2E: não aplicável.
- [ ] Manual: via `curl` com cookie de sessão: criar duas contas (SQL manual ou F1-02), transferir, conferir saldos; criar despesa que usa cheque especial e ler o aviso.

## Riscos e rollback
- **Corrida em saldo**: mitigada por incremento atômico (nunca ler-somar-gravar) e por `rebuildAccountBalance` como rede de segurança.
- **Divergência cache x ledger** por escrita fora dos use-cases (SQL manual, import em massa): proibir `prisma.transaction.create/update/delete` fora do repositório do ledger (regra ESLint `no-restricted-syntax` ou teste de grep em `src/server`), e job de verificação em F3.
- **Cartão e status**: a semântica PENDING/CLEARED/PLANNED para contas de cartão é definida na F1-03; este módulo apenas soma por balde, sem assumir significado de fatura.
- **Sinal na API** (módulo vs assinado): decisão documentada em "Decisões"; se mudar, reescrever os schemas e testes antes da F2-03.
- Rollback: `git revert`; sem migration própria. Dados criados por testes de integração ficam no banco de teste descartável.

## Registro de execução
### Alterações realizadas
### Arquivos principais
### Decisões
### Divergências
### Pendências

## Validação
Comandos e resultados.

## Handoff
Link para o handoff ativo, quando aplicável.

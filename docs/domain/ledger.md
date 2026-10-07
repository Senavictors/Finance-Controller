---
estado: real
fonte: src/server/modules/ledger/ (tasks FC2-F1-01 e FC2-F1-09); decisões em ADR-019, ADR-004, ADR-002, ADR-025
ultima-revisao: FC2-F1-09 ciclo 1 2026-10-07
---

# Ledger, saldos e transferências

O ledger é a fonte de verdade do saldo (ADR-019): toda movimentação é uma `Transaction` com valor **assinado** em centavos, e o saldo de uma conta é a soma dos seus lançamentos por status. `AccountBalance` é só um cache, atualizado na mesma transação que grava o lançamento e sempre reconstruível.

Código: `src/server/modules/ledger/{domain,application,infra,http}`. Rotas: `src/app/api/transactions/**` e `src/app/api/transfers/route.ts`.

## Modelo

- `amount`: inteiro assinado, **nunca zero**; `> 0` entra na conta, `< 0` sai; `|amount| <= 2.000.000.000`.
- `kind` e sinal obrigatório:

| kind                         | sinal                         | observação                                      |
| ---------------------------- | ----------------------------- | ----------------------------------------------- |
| `EXPENSE`, `FEE`, `INTEREST` | `< 0`                         | juros recebidos de investimento usam `INCOME`   |
| `INCOME`                     | `> 0`                         |                                                 |
| `ADJUSTMENT`                 | qualquer, `!= 0`              | saldo inicial (F1-02) e ajuste de conciliação   |
| `TRANSFER`, `CARD_PAYMENT`   | par: `-X` na origem, `+X` no destino | mesmo `transferId`, sempre fora de orçamento |

- **A API recebe o valor em módulo e o use-case aplica o sinal pelo `kind`** (decisão da task). Só `ADJUSTMENT` recebe o valor já assinado. Em transferências o valor também é informado em módulo.
- Datas de calendário (`date`, `postedDate`) são sempre meio-dia UTC (ADR-002). A API aceita `YYYY-MM-DD` estrito (`2026-02-30` é rejeitado) e o use-case rejeita `Date` fora do padrão (`LEDGER_INVALID_DATE`).
- Não existe coluna de saldo inicial: ele é um `ADJUSTMENT` "Saldo inicial", `CLEARED`, `excludeFromBudget = true`.

## Status e baldes de saldo

| status       | balde de `AccountBalance` | significado                  |
| ------------ | ------------------------- | ---------------------------- |
| `PLANNED`    | `balancePlanned`          | previsto (futuro)            |
| `PENDING`    | `balancePending`          | lançado, ainda não compensado |
| `CLEARED`    | `balanceCleared`          | compensado                   |
| `RECONCILED` | `balanceCleared`          | conferido com o banco        |

- `current = cleared + pending` (o que existe hoje); `projected = current + planned`.
- Transições: livres entre `PLANNED`/`PENDING`/`CLEARED` (avanço e retrocesso); `RECONCILED` só a partir de `CLEARED`; `RECONCILED -> qualquer` é proibido (`LEDGER_RECONCILED_LOCKED`; desconciliar é caminho explícito da F1-04).
- Lançamento `RECONCILED` só aceita edição de `categoryId`, `notes`, `tags` e `merchantId`; valor, data, conta, kind, descrição e status ficam travados e ele não pode ser apagado.

## Cheque especial e limite

`limitUsage` (puro) devolve `{ kind, limit, used, available, excess }` e nunca bloqueia (RN-04):

- `CHECKING`/`BUSINESS`: `position = cleared + pending`; `used = min(max(0,-position), overdraftLimit)`; `excess = max(0,-position-overdraftLimit)`; `available = max(0,position) + (overdraftLimit - used)`.
- `CREDIT_CARD`: `used = min(max(0,-(cleared+pending+planned)), creditLimit)`; `available = creditLimit - used`.
- Demais tipos: `kind = 'NONE'`; saldo negativo gera `NEGATIVE_BALANCE_UNEXPECTED`.

Avisos devolvidos em `warnings[]`: `OVERDRAFT_USED`, `OVERDRAFT_LIMIT_EXCEEDED`, `CREDIT_LIMIT_EXCEEDED`, `NEGATIVE_BALANCE_UNEXPECTED`. Ambos os lançamentos que estouram o limite são gravados.

## Transferências (ADR-004)

Par de lançamentos ligados por `transferId` (UUID v4), uma perna por conta (`@@unique([transferId, accountId])`), criados, editados, mudados de status e apagados juntos, na mesma transação do banco.

- Editar valor/data/descrição/status de uma perna propaga à outra (valor com sinais opostos). Trocar `accountId` ou `kind` de uma perna é proibido (`LEDGER_TRANSFER_ACCOUNT_IMMUTABLE`, `LEDGER_TRANSFER_KIND_IMMUTABLE`): apague e recrie.
- Conciliar (`RECONCILED`) afeta só a perna informada (a conciliação é por conta); depois disso o par fica travado para valor/data/status/exclusão.
- Cartão de crédito não pode ser origem de `TRANSFER`; pagamento de fatura usa `CARD_PAYMENT` (F1-03).
- Contas arquivadas só aceitam `ADJUSTMENT`.

## Cache `AccountBalance` e concorrência

- Toda mutação roda em uma única transação interativa: grava/atualiza/apaga lançamentos e aplica deltas por **incremento atômico** (`upsert` com `increment`; nunca ler-somar-gravar). `version` incrementa a cada alteração de saldo.
- Deltas por conta são aplicados em ordem de `accountId` para evitar deadlock entre transferências em sentidos opostos.
- **Regra de lock por linha (RN, FC2-F1-01 ciclo 1):** toda mutação que calcula delta sobre um lançamento existente (`updateTransaction`, `changeTransactionStatus`, `deleteTransaction`) lê o lançamento **e a outra perna do par** por `LedgerTx.lockTxns` (Postgres: `SELECT id FROM transactions WHERE user_id = $1 AND id = ANY($2) ORDER BY id FOR UPDATE`, depois relê o estado commitado). Sem isso, em READ COMMITTED duas requisições simultâneas sobre o mesmo id (duplo clique, retry, bot + UI) calculariam o delta sobre a mesma leitura e o aplicariam duas vezes (cache diverge do ledger sem erro). As linhas do par travam juntas, num único comando e na ordem do `ORDER BY id`, então edições simultâneas em pernas opostas não geram deadlock (40P01). A ordem global de locks é: linhas de `transactions` (ordenadas) e depois `account_balances` (ordem de `accountId`). Quem esperou o lock enxerga o estado já commitado: o segundo `DELETE` recebe `LEDGER_TXN_NOT_FOUND` (404); o segundo `PENDING -> CLEARED` é no-op; PATCHs simultâneos aplicam em série (vence o último).
- `deleteTxns` confere `count === ids.length` (senão aborta com `LEDGER_CONCURRENT_UPDATE`); `P2025` em mutação concorrente e deadlock/serialização persistentes (40P01, 40001, P2034) também viram `LEDGER_CONCURRENT_UPDATE` (409) em vez de 500. Deadlock/serialização refaz a transação inteira **uma vez** antes de falhar (`PrismaLedgerRepository.withTransaction`).
- O `InMemoryLedgerRepository` simula essa semântica (leituras sem lock, locks de linha em `lockTxns`/UPDATE/DELETE/incremento até o fim da transação, desfazer por log, detecção de deadlock) para a aplicação cobrir o caso (`application/concurrency.test.ts`).
- `rebuildAccountBalance` trava a linha do cache, soma o ledger por balde (`groupBy`) e substitui os três campos; é idempotente e devolve `drifted`.
- `userLocked` (ADR-024): edições manuais registram os campos; `updateTransaction(..., { actor: 'SYSTEM' })` ignora campos travados e devolve `skippedFields`.
- Escrever em `transactions`/`account_balances` fora de `ledger/infra` é proibido (guard em `tests/guards/ledger-boundaries.test.ts`).

## API para módulos consumidores

Contas, cartões, renda, dívidas, importação e demais módulos **nunca** escrevem em `transactions`/`account_balances`: usam a API pública do ledger (FC2-F1-09). O guard `tests/guards/ledger-boundaries.ts` barra (a) qualquer escrita nessas tabelas fora de `ledger/infra`, inclusive via handle transacional e SQL cru em várias linhas, e (b) imports de `ledger/{application,infra,domain,http}` fora do módulo.

### Pontos de entrada

| import                            | conteúdo                                                                                                                                                                                                         |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@/server/modules/ledger`         | `createLedgerService`, `runInTransaction`, tipos (`LedgerUnitOfWork`, `TransactionHandle`, inputs/resultados), `LedgerError`, `LEDGER_ERROR_CODES`, `prismaClientOf`, `memoryTxOf`, `onRollback`, `mapErrorToHttp` |
| `@/server/modules/ledger/service` | `getLedgerService()`: instância ligada ao Prisma real (separada para não carregar o banco em testes em memória)                                                                                                  |
| `@/server/modules/ledger/testing` | `InMemoryLedgerRepository`, `makeLedgerEnv`, `day`, `expectCacheMatchesLedger`... (só em `*.test.ts`/`test-helpers.ts`)                                                                                          |

Rotas em `src/app/**` ainda podem usar `ledger/http/*` e `ledger/infra/ledger-service` (handlers do próprio ledger).

### Vínculos opcionais

`createTransaction` aceita, além dos campos de sempre, `statementId`, `statementKey` (`AAAA-MM`), `refundOfId`, `seriesId`, `occurrenceKey`, `importBatchId`, `importHash`, `categorySource` (`USER|RULE|MERCHANT|LLM|PARSER|IMPORT`) e `aiConfidence` (0-100). `createTransfer` aceita `outgoing: {...}` e `incoming: {...}` com os mesmos campos, por perna. Todos são nulos por padrão e voltam em `LedgerTxn`.

- Validação: formato (`LEDGER_INVALID_LINK`, 400); fatura/série/lote existem **e são do usuário** e o lançamento original de `refundOfId` existe (`LEDGER_LINK_NOT_FOUND`, 404); `occurrenceKey` e `importHash` são únicos por usuário (`LEDGER_DUPLICATE_KEY`, 409, `details.field`).
- Regras de fatura, série, importação e categorização continuam nos módulos donos; o ledger só grava e valida dono/formato.
- `setTransactionLinks(ctx, id, links, { actor? })` altera só vínculos de um lançamento existente (ex.: mover compra de fatura; `null` limpa). Não muda saldo e vale para `RECONCILED`. Devolve o `LedgerTxn` mais `skippedFields`. O `actor` controla o lock do vínculo de fatura (ADR-024), chave `userLocked.statement`:
  - `actor: 'USER'` (ação manual): se o patch traz `statementId`/`statementKey` (inclusive `null`), grava `userLocked.statement = true`. Mantém os outros locks do lançamento.
  - `actor: 'SYSTEM'` (sync de status/fatura, engines): se `userLocked.statement` estiver ligado, **não** altera `statementId`/`statementKey` e os devolve em `skippedFields`; os demais vínculos do mesmo patch são aplicados. Se nada sobrar para aplicar, não grava nem emite evento.
  - sem `actor`: neutro (compatível com a versão anterior: grava o patch, não trava nem respeita lock).
  Fluxo de cartões (F1-03): mover manualmente = `{ actor: 'USER' }`; `syncCardStatuses` = `{ actor: 'SYSTEM' }`, o lançamento movido pelo usuário permanece na fatura escolhida.
- `listTransactions` ganhou os filtros `statementId`, `seriesId`, `refundOfId`, `kind`, `categoryId`, `status` único **ou array** (`IN`; array vazio não casa com nada) e `occurrenceKeyPrefix` (prefixo de `occurrenceKey`, ex.: `<seriesId>:`; parametrizado, `%`, `_` e a barra invertida valem como texto literal; escopo por `userId`).

### Unit of work: `ledger.runInTransaction(ctx, fn)`

```ts
runInTransaction<T>(ctx: { userId: string }, fn: (uow: LedgerUnitOfWork) => Promise<T>): Promise<T>
```

`fn` roda numa única transação de banco. `uow` expõe as operações do ledger (todas com o lock por linha e a ordem global `transactions` ordenado → `account_balances` por `accountId`) e `uow.tx`, o **handle opaco** da transação, para o repositório do outro módulo escrever as tabelas dele na mesma transação. Se `fn` lançar, desfaz tudo (ledger e módulo consumidor).

`LedgerUnitOfWork`: `createTransaction(input)`, `createTransfer(input)`, `updateTransaction(id, input, opts?)`, `deleteTransaction(id)`, `changeTransactionStatus(id, to)`, `setTransactionLinks(id, links, opts?)`, `lockOccurrenceKeys(keys)`, `upsertPlannedByOccurrenceKey(input)`, `upsertPlannedBatch(inputs)`, `openAccountBalance(accountId)` e leituras que enxergam as escritas da própria transação: `getAccountPosition(id)`, `findTransaction(id)`, `findTransactionByOccurrenceKey(key)`, `findTransferLegs(transferId)`, `listTransactions(filter?)`. As mesmas operações existem fora de unit of work em `LedgerService` (cada uma na sua transação).

Regras da `fn`:

1. **Idempotente e sem efeito externo.** Em deadlock/serialização (40P01, 40001, P2034) o repositório Prisma refaz `fn` **inteira** uma vez, numa transação nova. Nada de HTTP, e-mail, Telegram ou escrita fora de `uow.tx`.
2. **Gere ids antes** (`randomUUID()`/cuid fora da `fn`), para a segunda tentativa reproduzir as mesmas chaves.
3. `uow` e `uow.tx` só valem durante a `fn` (usar depois lança erro).
   **Não aninhe transações:** chamar `ledger.runInTransaction` ou qualquer método do serviço (`ledger.createTransaction`, `upsertPlannedByOccurrenceKey`...) de dentro da `fn` lança na hora `LedgerError` `LEDGER_NESTED_TRANSACTION` (detectado por `AsyncLocalStorage` nos dois repositórios, sem esperar timeout) e a transação externa desfaz. Dentro da `fn` use sempre `uow.*`. O `afterLedgerMutation` roda depois do commit, fora do escopo, e pode chamar o ledger.
4. `afterLedgerMutation` dispara uma vez, depois do commit (nunca em transação desfeita); falha no hook não desfaz nada.
5. Erros do ledger são `LedgerError` (`code` estável); erros do banco do módulo consumidor propagam e desfazem a transação. Chave duplicada (`occurrenceKey`/`importHash`) vira `LEDGER_DUPLICATE_KEY` **no ponto da operação** (`uow.createTransaction`, `uow.setTransactionLinks`...), nos dois repositórios, e não só na saída de `runInTransaction`. No Postgres a transação já está abortada depois desse erro: deixe-o propagar (não continue a `fn` engolindo o erro).
6. **Ordem de locks dentro da `fn`** (a ordem global é advisory de `occurrenceKey` → linhas de `transactions` → `account_balances` por `accountId`):
   - chame `upsertPlanned*` **antes** de outras escritas do ledger na mesma `fn`; ou, se precisar escrever antes, chame `uow.lockOccurrenceKeys([...chaves])` logo no começo da `fn`, que adquire os advisory locks antecipadamente (ordem crescente, idempotente, aceita as chaves que a `fn` vai usar em `upsertPlanned*`). Escrever no ledger e só depois chamar `upsertPlanned*` inverte a ordem (saldo → advisory) e, sob contenção com outro `upsertPlanned*` na mesma chave, pode dar deadlock (o repositório refaz uma vez e depois devolve `LEDGER_CONCURRENT_UPDATE`).
   - trave as linhas do **seu** módulo (ex.: a fatura, `SELECT ... FOR UPDATE` por `prismaClientOf(uow.tx)`) **antes** de chamar o ledger, e sempre na mesma ordem entre use-cases.

### Como o repositório de outro módulo recebe o handle

O use-case do módulo abre a unit of work e passa `uow.tx` aos repositórios como parâmetro opcional (`tx?: TransactionHandle`). Prisma:

```ts
import { prismaClientOf, type TransactionHandle } from '@/server/modules/ledger'

class PrismaCardsRepository {
  constructor(private readonly client: PrismaClient) {}
  async insertPurchase(row: NewCardPurchase, tx?: TransactionHandle) {
    const db = tx ? prismaClientOf(tx) : this.client // mesmo Prisma.TransactionClient do ledger
    return db.cardPurchase.create({ data: row })
  }
}
```

Em memória (testes), o repositório do módulo registra o `undo` das próprias escritas e participa do rollback conjunto (callbacks rodam em ordem inversa, junto com o rollback do ledger):

```ts
import { onRollback, type TransactionHandle } from '@/server/modules/ledger'

class InMemoryCardsRepository {
  readonly purchases = new Map<string, PurchaseRow>()
  async insertPurchase(row: PurchaseRow, tx?: TransactionHandle) {
    this.purchases.set(row.id, row)
    onRollback(tx, () => this.purchases.delete(row.id)) // no-op com handle do Prisma ou sem handle
  }
}
```

`prismaClientOf(handle)` devolve `ConsumerTransactionClient`: o cliente transacional **sem** os delegates `transaction` e `accountBalance` (proteção estática: `client.transaction` não compila; `$queryRaw`/`$executeRaw` seguem no tipo e o guard barra SQL de escrita nessas tabelas; leia lançamentos por `uow.listTransactions`/`findTransaction`). Lança com handle em memória e `memoryTxOf(handle)` lança com handle do Prisma. O exemplo em memória está testado em `application/unit-of-work.test.ts` (cartões e contas) e o do Prisma em `infra/prisma-ledger-repository.uow.integration.test.ts`.

### `upsertPlannedByOccurrenceKey(ctx, input)` (renda, DAS, séries)

`input` = campos de `createTransaction` sem `status`, com `occurrenceKey` obrigatória (única por usuário, ex.: `<seriesId>:AAAA-MM-DD`, `das:AAAA-MM-DD`). Resultado `{ action, skipped, transaction, position, warnings, skippedFields }`:

| situação                                                  | `action`                            | efeito                                                                                          |
| --------------------------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------- |
| chave não existe                                          | `CREATED`                           | cria `PLANNED` (`source` padrão `RECURRING`), soma em `balancePlanned`                          |
| existe `PLANNED`; valor/data/descrição/conta/kind mudaram (ou categoria, estabelecimento, notas, tags ou vínculos informados mudaram) | `UPDATED` | atualiza aplicando o delta; campos em `userLocked` ficam e voltam em `skippedFields` (ADR-024) |
| existe `PLANNED`; nada mudou                              | `UNCHANGED`                         |                                                                                                 |
| existe e já não é `PLANNED`                               | `SKIPPED`, `skipped: 'NOT_PLANNED'` | não altera nada (previsto confirmado/conciliado)                                                |

Concorrência: a chave é travada por `pg_advisory_xact_lock(hash(userId, chave))` antes de ler (serializa chamadas na mesma chave, inclusive quando a linha ainda não existe); depois a linha existente é travada por `lockTxns`. Para vários previstos numa transação use `upsertPlannedBatch(inputs)`: trava **todas** as chaves em ordem crescente antes de escrever (um laço de upserts individuais pode dar deadlock com execuções de chaves cruzadas). O advisory lock vem antes dos locks de linha na ordem global. Confirmar o recebimento (valor/data reais) é `updateTransaction(id, { amount, date, status: 'CLEARED' })`.

Campos opcionais de `input` (`categoryId`, `merchantId`, `notes`, `tags`, `seriesId`, `statementId`, `statementKey`, `refundOfId`, `importBatchId`, `importHash`, `categorySource`, `aiConfidence`): `undefined` não toca o campo existente; `null` limpa; valor diferente do atual atualiza, via `updateTransaction`/`setTransactionLinks` com `actor: 'SYSTEM'`, então `userLocked` vence (inclusive `statement`). Se `categoryId` está travado pelo usuário, `categorySource` e `aiConfidence` também ficam como estão. A `occurrenceKey` é a identidade e nunca muda.

### `openAccountBalance(accountId)`

Cria a linha zerada de `AccountBalance` (idempotente e seguro sob concorrência: `INSERT ... ON CONFLICT DO NOTHING`); não altera linha existente; devolve a `AccountPosition`. A conta precisa existir e ser do usuário (`LEDGER_ACCOUNT_NOT_FOUND`), podendo ter sido criada milissegundos antes, na mesma transação.

### Exemplos

**Contas (F1-02): conta + saldo + saldo inicial atômicos**

```ts
const accountId = randomUUID()
await ledger.runInTransaction(ctx, async (uow) => {
  await accountsRepo.insert({ id: accountId, userId: ctx.userId, ...fields }, uow.tx)
  await uow.openAccountBalance(accountId)
  if (openingBalance !== 0) {
    await uow.createTransaction({
      accountId,
      kind: 'ADJUSTMENT',
      amount: openingBalance, // assinado; só ADJUSTMENT
      date: openingDate,
      description: 'Saldo inicial',
      excludeFromBudget: true,
    })
  }
  return uow.getAccountPosition(accountId)
})
```

Em memória, o repositório de contas deve tornar a conta visível ao ledger (`ledgerRepo.addAccount(...)`/`ledgerRepo.accounts`) e registrar o `undo` com `onRollback`.

**Cartões (F1-03): compra parcelada, pagamento de fatura, estorno**

```ts
// compra em 3x: um lançamento por parcela, cada um na sua fatura, mais as tabelas do módulo
const purchaseId = randomUUID()
await ledger.runInTransaction(ctx, async (uow) => {
  await cardsRepo.insertPurchase({ id: purchaseId /* ... */ }, uow.tx)
  for (const p of installments) {
    const t = await uow.createTransaction({
      accountId: cardId,
      kind: 'EXPENSE',
      amount: p.amount,
      date: p.date,
      description,
      statementId: p.statementId,
      statementKey: p.statementKey,
    })
    await cardsRepo.insertInstallment({ purchaseId, number: p.number, transactionId: t.transaction.id }, uow.tx)
  }
})

// pagamento de fatura: par CARD_PAYMENT, vínculo só na perna do cartão (destino)
await ledger.runInTransaction(ctx, async (uow) => {
  await uow.createTransfer({
    kind: 'CARD_PAYMENT',
    sourceAccountId: checkingId,
    destinationAccountId: cardId,
    amount,
    date,
    description: 'Pagamento da fatura',
    incoming: { statementId, statementKey },
  })
  await cardsRepo.updateStatementPaid(statementId, amount, uow.tx)
})

// estorno: INCOME positivo no cartão com refundOfId = id do original
// mover compra para outra fatura (ação do usuário): trava o vínculo contra o sync automático
// uow.setTransactionLinks(id, { statementId, statementKey }, { actor: 'USER' })
// sync de faturas (engine): respeita o lock; lançamento movido fica onde o usuário o pôs
// uow.setTransactionLinks(id, { statementId, statementKey }, { actor: 'SYSTEM' })
```

**Renda (F1-06): previsto idempotente**

```ts
await ledger.runInTransaction(ctx, (uow) =>
  uow.upsertPlannedBatch(
    events.map((e) => ({
      accountId: rule.destinationAccountId,
      kind: 'INCOME' as const,
      amount: e.totalCents,
      date: e.paymentDate,
      description: 'Renda prevista',
      categoryId,
      occurrenceKey: `${rule.id}:${e.dateKey}`,
    })),
  ),
)
// recebimento: ledger.updateTransaction(ctx, id, { amount: received, date: receivedDate, status: 'CLEARED' })
```

**Dívidas (F1-05): pagar parcela**

```ts
await ledger.runInTransaction(ctx, async (uow) => {
  const parcel = await uow.createTransaction({
    accountId,
    kind: 'EXPENSE',
    amount: installmentCents,
    date,
    description,
    categoryId,
  })
  if (lateFee > 0) {
    await uow.createTransaction({ accountId, kind: 'FEE', amount: lateFee, date, description: 'Multa' })
  }
  if (lateInterest > 0) {
    await uow.createTransaction({ accountId, kind: 'INTEREST', amount: lateInterest, date, description: 'Juros' })
  }
  await debtsRepo.markInstallmentPaid({ loanId, number, transactionId: parcel.transaction.id }, uow.tx)
})
```

## Códigos de erro (contrato público)

| código                                                                                          | HTTP |
| ----------------------------------------------------------------------------------------------- | ---- |
| `LEDGER_INVALID_SIGN`, `LEDGER_ZERO_AMOUNT`, `LEDGER_AMOUNT_OUT_OF_RANGE`, `LEDGER_INVALID_DATE`, `LEDGER_INVALID_KIND`, `LEDGER_SAME_ACCOUNT`, `LEDGER_USE_TRANSFER`, `LEDGER_CARD_TRANSFER_SOURCE`, `LEDGER_EMPTY_PATCH`, `LEDGER_INVALID_INPUT`, `LEDGER_INVALID_LINK` | 400 |
| `LEDGER_ACCOUNT_NOT_FOUND`, `LEDGER_TXN_NOT_FOUND`, `LEDGER_CATEGORY_NOT_FOUND`, `LEDGER_MERCHANT_NOT_FOUND`, `LEDGER_LINK_NOT_FOUND` | 404 |
| `LEDGER_RECONCILED_LOCKED`, `LEDGER_INVALID_STATUS_CHANGE`, `LEDGER_TRANSFER_ACCOUNT_IMMUTABLE`, `LEDGER_TRANSFER_KIND_IMMUTABLE`, `LEDGER_TRANSFER_PAIR_BROKEN`, `LEDGER_ACCOUNT_ARCHIVED`, `LEDGER_CONCURRENT_UPDATE`, `LEDGER_DUPLICATE_KEY`, `LEDGER_NESTED_TRANSACTION` | 409 |

Corpo de erro: `{ error, code }` (validação Zod: `code: 'VALIDATION_FAILED'` com `details`; sessão: 401 `UNAUTHORIZED`).

## Rotas

| rota                                | uso                                                                        |
| ----------------------------------- | -------------------------------------------------------------------------- |
| `POST /api/transactions`            | cria lançamento (`kind` em EXPENSE/INCOME/FEE/INTEREST/ADJUSTMENT)         |
| `GET /api/transactions`             | lista (`from`, `to`, `accountId`, `status`, `q`, `cursor`, `limit` até 100) |
| `PATCH /api/transactions/[id]`      | edita (propaga em pares)                                                   |
| `DELETE /api/transactions/[id]`     | apaga (par inteiro)                                                        |
| `POST /api/transactions/[id]/status` | muda o status `{ status }`                                                 |
| `POST /api/transfers`               | cria transferência atômica                                                 |

Todas chamam `requireAuth()` no handler (além do proxy) e filtram por `userId`; id de outro usuário devolve 404.

## Fora deste módulo

CRUD de contas e regra do saldo inicial (F1-02), faturas/parcelas/pagamento de fatura (F1-03; o ledger só expõe vínculos e unit of work), reconciliação com o banco e desconciliar (F1-04), previstos automáticos e matching (F3/F4).

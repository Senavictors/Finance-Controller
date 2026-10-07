---
estado: real
fonte: src/server/modules/ledger/ (task FC2-F1-01); decisões em ADR-019, ADR-004, ADR-002, ADR-025
ultima-revisao: FC2-F1-01 2026-10-06
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

## Códigos de erro (contrato público)

| código                                                                                          | HTTP |
| ----------------------------------------------------------------------------------------------- | ---- |
| `LEDGER_INVALID_SIGN`, `LEDGER_ZERO_AMOUNT`, `LEDGER_AMOUNT_OUT_OF_RANGE`, `LEDGER_INVALID_DATE`, `LEDGER_INVALID_KIND`, `LEDGER_SAME_ACCOUNT`, `LEDGER_USE_TRANSFER`, `LEDGER_CARD_TRANSFER_SOURCE`, `LEDGER_EMPTY_PATCH`, `LEDGER_INVALID_INPUT` | 400 |
| `LEDGER_ACCOUNT_NOT_FOUND`, `LEDGER_TXN_NOT_FOUND`, `LEDGER_CATEGORY_NOT_FOUND`, `LEDGER_MERCHANT_NOT_FOUND` | 404 |
| `LEDGER_RECONCILED_LOCKED`, `LEDGER_INVALID_STATUS_CHANGE`, `LEDGER_TRANSFER_ACCOUNT_IMMUTABLE`, `LEDGER_TRANSFER_KIND_IMMUTABLE`, `LEDGER_TRANSFER_PAIR_BROKEN`, `LEDGER_ACCOUNT_ARCHIVED`, `LEDGER_CONCURRENT_UPDATE` | 409 |

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

CRUD de contas e saldo inicial (F1-02), faturas/parcelas/pagamento de fatura (F1-03), reconciliação com o banco e desconciliar (F1-04), previstos automáticos e matching (F3/F4).

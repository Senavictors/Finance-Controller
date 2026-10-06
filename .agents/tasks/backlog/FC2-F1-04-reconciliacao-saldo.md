---
id: FC2-F1-04
title: Reconciliação de saldo
status: backlog
type: feature
phase: F1
wave: 3
owner: api-servidor
depends_on: [FC2-F1-02]
created_at: 2026-10-05
updated_at: 2026-10-05
affected_modules: [ledger, accounts, app-mais]
related_use_cases: [reconcileAccount, undoReconciliation, listReconciliations, getBalanceAsOf, findReconciliationSuspects]
related_adrs: [ADR-019, ADR-016, ADR-025]
---

# FC2-F1-04 — Reconciliação de saldo

## Contexto
A métrica de sucesso de confiança do produto é: **diferença R$ 0,00 por conta no fechamento** (§11 da especificação) e o critério de saída da F1 é "saldo do app = saldo do banco". O ADR-019 define o ledger como fonte de verdade do saldo, `AccountBalance` como cache e a **reconciliação** como o ato de conferir o saldo do ledger com o saldo informado pelo banco numa data e travar o que foi conferido (`RECONCILED`). O 1.x não tinha conferência alguma.

Pré-requisitos já entregues: ledger com status e `rebuildAccountBalance` (F1-01) e contas com saldo/uso do limite (F1-02).

## Problema
- Não há como comparar o saldo do app com o do banco numa data, nem localizar a diferença.
- Lançamentos conferidos não ficam protegidos contra edição acidental.
- Quando há diferença, falta ajuda para achar a causa (duplicata, lançamento faltando, pendência que o banco ainda não compensou) e um caminho seguro para registrar um ajuste.

## Objetivo
1. Use-case `reconcileAccount` que compara o saldo do ledger numa data com o saldo do banco informado; se bater, marca como `RECONCILED` os lançamentos compensados até a data; se não bater, devolve a diferença e candidatos de explicação; opcionalmente cria um lançamento `ADJUSTMENT` para fechar a diferença.
2. Histórico de reconciliações (`Reconciliation`) e desfazer a última.
3. Interface mínima em `Mais > Contas > [conta]` para informar o saldo do banco, ver a diferença e confirmar.

## Fora de escopo
- Importação de extrato para conferir automaticamente (F4) e o matching de lançamentos importados.
- Conferência de fatura de cartão linha a linha (F4-02/F4-04); aqui o cartão pode ser conferido pelo saldo da fatura informado, usando o mesmo mecanismo.
- Reconciliação multi-conta em lote e agenda de fechamento (F6-02 ritual).
- Telas finais de relatório.

## Comportamento atual
- Ledger (F1-01): `AccountBalance` com `balanceCleared/Pending/Planned`; status `PLANNED|PENDING|CLEARED|RECONCILED`; `RECONCILED` é imutável em valor/data/conta/kind; `rebuildAccountBalance` recompõe o cache; transições `RECONCILED -> outro` proibidas, salvo pelo caminho de desconciliar desta task.
- Schema 2.0: `Reconciliation { accountId, asOfDate, bankBalance, ledgerBalance, difference, status (MATCHED|ADJUSTED|UNDONE), reconciledCount, adjustmentTransactionId?, note?, createdAt }`.
- Contas (F1-02): tela `/mais/contas` listando contas com saldo e uso do limite.

## Comportamento esperado
### Saldo do ledger numa data
`getBalanceAsOf(accountId, asOfDate)` = `Σ amount` dos lançamentos da conta com `date <= asOfDate` e `status ∈ {CLEARED, RECONCILED}` (compensados). **Pendentes e previstos não entram** no saldo comparável com o banco (o banco só mostra o que foi lançado/compensado); são listados à parte como `pendingUntilDate`.

### Fluxo `reconcileAccount({ accountId, asOfDate, bankBalance, createAdjustment?, note? })`
1. Valida: conta do usuário e não arquivada; `asOfDate` no passado ou hoje (meio-dia UTC) e **posterior** à última reconciliação `MATCHED/ADJUSTED` não desfeita (senão `RECON_DATE_BEFORE_LAST`); `bankBalance` inteiro em centavos (assinado; para cartão, o valor da fatura como número negativo = dívida, convertido pela UI).
2. Calcula `ledgerBalance = getBalanceAsOf` e `difference = bankBalance - ledgerBalance`.
3. Se `difference === 0`: em **uma transação**, marca `RECONCILED` todos os lançamentos `CLEARED` da conta com `date <= asOfDate` (lote por `UPDATE ... WHERE`), grava `Reconciliation(status=MATCHED, reconciledCount)`, e devolve `{ status: 'MATCHED', reconciledCount }`.
4. Se `difference !== 0` e `createAdjustment` não foi pedido: **não altera nada**; devolve `{ status: 'MISMATCH', difference, suspects }` com os candidatos de `findReconciliationSuspects` (abaixo).
5. Se `difference !== 0` e `createAdjustment = true`: em uma transação, cria um lançamento `ADJUSTMENT` (via ledger) com `amount = difference`, `date = asOfDate`, `status = CLEARED`, `source = MANUAL`, `review = NEEDS_REVIEW`, `description = "Ajuste de conciliação"` (+ `note` em `notes`), `excludeFromBudget = true`; em seguida marca como `RECONCILED` todos os `CLEARED` até a data (incluindo o ajuste) e grava `Reconciliation(status=ADJUSTED, adjustmentTransactionId)`. O saldo compensado em `asOfDate` passa a ser exatamente `bankBalance`.
6. Concorrência: pegar lock lógico por conta (`SELECT ... FOR UPDATE` em `account_balances` na transação ou `version` otimista); duas reconciliações simultâneas da mesma conta -> a segunda falha com `RECON_CONFLICT`.

### `findReconciliationSuspects(accountId, asOfDate, difference)`
Heurísticas puras e determinísticas sobre lançamentos da conta, devolvidas em ordem de relevância com um motivo legível:
- `EXACT_MATCH_PENDING`: lançamento `PENDING`/`PLANNED` com `|amount| = |difference|` (provável compensação ainda não refletida).
- `SAME_SIGN_PENDING_SUM`: subconjunto (até 3 itens) de pendentes cuja soma = `difference` (limitar a 40 candidatos para evitar explosão combinatória).
- `POSSIBLE_DUPLICATE`: pares `CLEARED` com mesmo valor e data (ou datas a 1 dia) e descrições normalizadas semelhantes; se `difference = ±amount` de um deles, prioridade alta.
- `FUTURE_DATED`: lançamentos `CLEARED` com `date > asOfDate` que parecem pertencer ao período (diferença = soma deles).
- `MISSING_ENTRY_HINT`: se nada explica, sugere "falta lançamento de R$ X" com o valor da diferença.
Cada suspeito traz `{ kind, transactionIds, amountSum, reason }`.

### `undoReconciliation(reconciliationId)`
Somente a **última** reconciliação ativa da conta: em uma transação volta para `CLEARED` os lançamentos marcados por ela (registrar os ids em `Reconciliation.reconciledIds Json` ou, se o schema não tiver, marcar pelo intervalo `date <= asOfDate` e `status = RECONCILED` posterior à reconciliação anterior), **não apaga** o `ADJUSTMENT` criado (fica como lançamento comum `NEEDS_REVIEW`) e grava `status = UNDONE`. Desconciliar fora de ordem -> `RECON_NOT_LATEST`.

### Rotas finas e tela
- `GET /api/accounts/[id]/balance-as-of?date=YYYY-MM-DD`, `POST /api/accounts/[id]/reconcile` (corpo conforme acima), `GET /api/accounts/[id]/reconciliations`, `POST /api/reconciliations/[id]/undo`.
- Tela mínima: em `/mais/contas/[id]`, botão "Conferir saldo" abre `Sheet`: campo de data (hoje por padrão), `MoneyField` do saldo do banco, linha com "Saldo no app: R$ X" e "Diferença: R$ Y" (tom `--fc-in` se 0, `--fc-pend`/`--fc-out` caso contrário); com diferença mostra a lista de suspeitos (cada item com valor, data, descrição e motivo) e dois botões: "Corrigir lançamentos" (fecha o sheet) e "Registrar ajuste de R$ Y" (confirmação em 2 passos). Mostra também o histórico de conferências da conta (data, resultado) e o botão "Desfazer última".

## Regras de negócio
- RN-01: A comparação usa apenas lançamentos compensados (`CLEARED`/`RECONCILED`) até a data; `PENDING` e `PLANNED` são listados mas não compõem o saldo.
- RN-02: Diferença zero => reconciliar (travar) os lançamentos compensados até a data; diferença diferente de zero => nada muda, a menos que o usuário peça explicitamente o ajuste.
- RN-03: Ajuste é um lançamento `ADJUSTMENT` auditável (`NEEDS_REVIEW`, descrição fixa) e nunca é criado silenciosamente.
- RN-04: Reconciliação é monotônica: a nova data deve ser posterior à última ativa; só a última pode ser desfeita.
- RN-05: `RECONCILED` é imutável (RN-05 da F1-01); a única forma de editar é desfazer a reconciliação.
- RN-06: Após qualquer reconciliação o `AccountBalance` continua igual ao recomputado (nenhuma reconciliação altera saldo; só o `ADJUSTMENT` altera).
- RN-07: Reconciliações usam datas meio-dia UTC e valores em centavos.
- RN-08: Heurísticas de suspeitos nunca alteram dados; são só sugestões.
- RN-09: Toda operação filtra por `userId`; conta de outro usuário => 404.

## Critérios de aceitação
- [ ] CA-01: Conta com lançamentos compensados somando R$ 1.000,00 até 2026-10-01 e `bankBalance = 100000` retorna `MATCHED`, marca todos como `RECONCILED`, grava `Reconciliation(MATCHED, reconciledCount = N)` e `AccountBalance.balanceCleared` não muda.
- [ ] CA-02: Com `bankBalance = 98500` (diferença -1500) e sem `createAdjustment`, retorna `MISMATCH` com `difference = -1500`, **nenhum** lançamento muda de status, nenhum `Reconciliation` é criado, e a lista de suspeitos é devolvida.
- [ ] CA-03: Com `createAdjustment = true` na situação do CA-02, cria exatamente um `ADJUSTMENT` de -1500 (`CLEARED`, `NEEDS_REVIEW`, `excludeFromBudget`), todos os compensados até a data (incluindo o ajuste) ficam `RECONCILED`, `Reconciliation(ADJUSTED)` referencia o ajuste e `getBalanceAsOf(asOfDate)` passa a ser 98500.
- [ ] CA-04: Lançamentos `PENDING` e `PLANNED` até a data **não** entram em `ledgerBalance` e permanecem com seus status após reconciliar.
- [ ] CA-05: Tentar editar valor/data/conta de um lançamento recém-`RECONCILED` retorna `LEDGER_RECONCILED_LOCKED`; editar `notes` funciona.
- [ ] CA-06: Reconciliar com `asOfDate` igual ou anterior à última reconciliação ativa retorna `RECON_DATE_BEFORE_LAST`; `asOfDate` no futuro retorna `RECON_DATE_IN_FUTURE`; conta arquivada retorna erro.
- [ ] CA-07: `undoReconciliation` da última volta os lançamentos para `CLEARED` e marca `UNDONE`; do ajuste criado, o `ADJUSTMENT` permanece; desfazer uma reconciliação que não é a última retorna `RECON_NOT_LATEST`; após desfazer, editar um lançamento volta a ser possível.
- [ ] CA-08: `findReconciliationSuspects` com um `PENDING` de -1500 e diferença -1500 retorna `EXACT_MATCH_PENDING` primeiro; com dois lançamentos `CLEARED` idênticos (mesmo valor/data/descrição) e diferença igual ao valor, retorna `POSSIBLE_DUPLICATE`; sem explicação retorna `MISSING_ENTRY_HINT` com o valor da diferença; com 60 pendentes o cálculo de subconjuntos respeita o limite (tempo < 200 ms no teste).
- [ ] CA-09: Duas chamadas simultâneas de `reconcileAccount` na mesma conta resultam em uma `MATCHED/ADJUSTED` e uma `RECON_CONFLICT` (teste de integração com `DATABASE_URL_TEST`).
- [ ] CA-10: Conta de cartão: `bankBalance` negativo (valor da fatura como dívida) é aceito e reconcilia da mesma forma.
- [ ] CA-11: Em 390x844, o sheet "Conferir saldo" mostra saldo do app, diferença colorida, suspeitos e histórico; alvos >= 44px; sem cor literal (guard verde).
- [ ] CA-12: Critério de saída da F1: seguindo o roteiro manual (abaixo) com contas fictícias, o saldo no app, após reconciliar, é igual ao saldo informado "do banco" em todas as contas e a diferença exibida é R$ 0,00.
- [ ] CA-13: `npm run lint`, `npm test`, `npx next build`, `npm run format:check` passam.

## Impacto técnico
### Backend
Novos use-cases em `src/server/modules/ledger/application/` (`reconcile-account.ts`, `undo-reconciliation.ts`, `get-balance-as-of.ts`, `list-reconciliations.ts`) e domínio puro `ledger/domain/reconciliation.ts` (`computeDifference`, `findSuspects`, regras de datas) com testes; extensão da porta `LedgerRepository` (`sumClearedUntil`, `markReconciled(accountId, untilDate)`, `revertReconciled(ids)`, `lockAccountBalance`). Rotas em `src/app/api/accounts/[id]/**` e `src/app/api/reconciliations/**`.
### Frontend
`src/app/(app)/mais/contas/[id]/page.tsx` e `reconcile-sheet.tsx` com primitivos `fc/*`.
### Banco de dados
Usa `reconciliations` e `transactions.status`. Se faltar a coluna `reconciledIds Json` para o desfazer, usar o critério por intervalo descrito e registrar em Pendências (migration incremental só com aprovação do dados-prisma).
### Integrações
Nenhuma.
### Segurança
Operação destrutiva leve (trava lançamentos): exige sessão, `userId`, confirmação em 2 passos para ajuste na UI; nada de dados reais nos testes (valores redondos fictícios).

## Plano de implementação
- [ ] Etapa 1 — Ler ADR-019, §11 da especificação, F1-01 (status/regras de `RECONCILED`) e F1-02 (contas).
- [ ] Etapa 2 — Domínio `reconciliation.ts` + testes (diferença, validação de datas, suspeitos).
- [ ] Etapa 3 — Estender repositório (em memória e Prisma); `getBalanceAsOf`.
- [ ] Etapa 4 — `reconcileAccount` (3 caminhos) e `undoReconciliation`; testes de aplicação.
- [ ] Etapa 5 — Rotas finas + Zod; teste de integração de concorrência.
- [ ] Etapa 6 — Tela `mais/contas/[id]` e `reconcile-sheet`.
- [ ] Etapa 7 — Roteiro manual do critério de saída (CA-12) e registro dos resultados.
- [ ] Etapa 8 — Docs `docs/domain/reconciliacao.md`, `.agents/context/CONTEXT.md`, `PLANS.md`, `README.md` (fechar a F1 quando as demais tasks estiverem concluídas); commit `feat(f1-reconciliacao): conferência de saldo e ajuste auditável`.

## Estratégia de testes
- [ ] Unitários: `computeDifference` (positivo, negativo, zero); validação de datas (anterior à última, futura, igual); `findSuspects` (um pendente exato; soma de 2 e 3 pendentes; limite de 40 candidatos; duplicata exata e quase-duplicata a 1 dia; nada encontrado; lista vazia; diferença zero retorna vazio).
- [ ] Integração (repositório em memória): MATCHED, MISMATCH, ADJUSTED, desfazer a última, desfazer fora de ordem, reconciliar duas vezes em datas crescentes, `PENDING` intocado, edição bloqueada em `RECONCILED`, cartão com saldo negativo, `AccountBalance` igual ao recomputado em todos os passos.
- [ ] Integração (banco de teste): atomicidade (falha ao criar o ajuste desfaz tudo); concorrência (CA-09).
- [ ] E2E: não aplicável.
- [ ] Manual (roteiro do critério de saída): (1) criar duas contas fictícias com saldo inicial; (2) lançar 5 movimentações incluindo uma transferência entre elas; (3) informar "saldo do banco" igual ao do app e reconciliar (MATCHED); (4) lançar mais uma movimentação, informar saldo divergente em R$ 15,00, ver suspeitos e registrar ajuste; (5) desfazer e refazer.

## Riscos e rollback
- **Travar lançamentos por engano**: mitigado por desfazer a última e por confirmação em 2 passos do ajuste.
- **Saldo "do banco" informado errado** cria ajuste indevido: o ajuste fica `NEEDS_REVIEW` e visível; desfazer a reconciliação mantém o ajuste como lançamento comum, que o usuário pode editar/apagar.
- **Heurística de suspeitos** com explosão combinatória: limite de 40 candidatos e 3 itens por subconjunto, com teste de desempenho.
- **Fuso e data de corte**: o banco pode lançar na madrugada do dia seguinte; a UI permite escolher a data de corte e mostra lançamentos do dia seguinte como `FUTURE_DATED`.
- Rollback: `git revert`; reconciliações gravadas permanecem, mas lançamentos `RECONCILED` precisariam voltar a `CLEARED` por SQL de reparo (script documentado em `docs/domain/reconciliacao.md`).

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

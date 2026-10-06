---
id: FC2-F2-03
title: Use-case createFromDraft (preview, criação e desfazer)
status: backlog
type: feature
phase: F2
wave: 2
owner: api-servidor
depends_on: [FC2-F2-01, FC2-F1-03]
created_at: 2026-10-05
updated_at: 2026-10-05
affected_modules: [capture, ledger, cards, budget]
related_use_cases: []
related_adrs: [ADR-002, ADR-004, ADR-008, ADR-019, ADR-024, ADR-025]
---

# FC2-F2-03 — Use-case createFromDraft (preview, criação e desfazer)

## Contexto
O Draft do parser (FC2-F2-01) precisa virar dados reais do ledger. A mesma função tem de servir sheet, bot Telegram, MCP e agentes (ADR-025), então a lógica vive em `application/` e as rotas HTTP são finas. O 1.x já tem as peças certas, espalhadas em Route Handlers e em um módulo único `finance/`: criação de compra no cartão com parcelas, ciclo de fatura e transferência atômica.

## Problema
- No 1.x a transferência está dentro do Route Handler `src/app/api/transactions/transfer/route.ts` (usa `crypto` e `prisma` direto). Não é reutilizável por bot/MCP.
- A compra no cartão é criada por `createCreditCardPurchase` em `src/server/modules/finance/application/credit-card-purchases/use-cases.ts`, acoplada ao schema 1.x (`CreditCardPurchase`, `CreditCardPurchaseInstallment`, `source: 'WISHLIST'`).
- Não há como pré-visualizar "em qual fatura isso cai e se pesa no caixa deste ciclo" sem gravar.
- Não há desfazer.

## Objetivo
Entregar, em `src/server/modules/capture/application/`:
1. `previewDraft(userId, draft, now)`: sem escrever, devolve a conta/cartão resolvidos, a fatura de destino (chave e vencimento), o cronograma de parcelas e o flag `impactsCycleCash`.
2. `createFromDraft(userId, input)`: persiste o Draft de forma atômica e idempotente (`clientRequestId`), cobrindo despesa em conta, despesa em cartão (à vista e parcelada), entrada, estorno, transferência (par ligado) e lançamento futuro (PLANNED).
3. `undoCapture(userId, undoToken)`: desfaz o lançamento recém-criado, se ainda não editado, conciliado nem pago.
4. Rotas finas: `POST /api/capture`, `POST /api/capture/preview`, `POST /api/capture/undo`.

## Fora de escopo
- Parser (F2-01), memória de merchant (F2-02, só o gancho), UI (F2-04, F2-05).
- Matching com recorrência PLANNED (FC2-F3-01 se pluga no gancho `afterCreate`).
- Importação (F4).
- Cálculo completo do "Disponível" (F3-02); aqui só o helper de limites de ciclo necessário ao flag `impactsCycleCash`.

## Comportamento atual
- `src/app/api/transactions/transfer/route.ts` (1.x): valida com `createTransferSchema` (`src/server/modules/finance/http/schemas.ts`), cria o par de transações com `crypto.randomUUID`-style id compartilhado e invalida snapshots de analytics.
- `createCreditCardPurchase` (`.../credit-card-purchases/use-cases.ts`): exporta `splitAmountIntoInstallments(total, n)` (resto distribuído nas primeiras parcelas, soma exata) e `buildInstallmentSchedule(total, n, date)` (usa `addMonthsPreservingDay`, ao meio-dia local). Ambos são reaproveitáveis como lógica pura.
- `getCreditCardStatementCycle({ transactionDate, closingDay, dueDay })` em `src/server/modules/finance/application/credit-card/statement-cycle.ts`: núcleo do ADR-008; usa `new Date(...).setHours(12...)` e `buildMonthDate` com clamp de dia. Reaproveitar, mas converter para aceitar/retornar datas ao meio-dia UTC (sem `getDate()` local).
- `syncCreditCardTransactionStatement` em `.../credit-card/billing.ts` associa transação à fatura e recalcula.

## Comportamento esperado

### Entrada
```ts
// src/server/modules/capture/http/schemas.ts (Zod)
export const createFromDraftSchema = z.object({
  clientRequestId: z.string().min(8).max(64),        // idempotência (UUID gerado pela sheet)
  kind: z.enum(['EXPENSE', 'INCOME', 'TRANSFER']),
  isRefund: z.boolean().default(false),
  amountCents: z.number().int().positive(),
  installments: z.object({ count: z.number().int().min(2).max(48) }).nullable().default(null),
  description: z.string().trim().min(1).max(120),
  accountId: z.string().min(1),
  toAccountId: z.string().min(1).nullable().default(null),
  categoryId: z.string().nullable().default(null),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),     // convertida para meio-dia UTC
  tags: z.array(z.string().max(32)).max(10).default([]),
  source: z.enum(['QUICKADD', 'BOT', 'MANUAL']).default('QUICKADD'),
  rawText: z.string().max(500).optional(),
  userLockedFields: z.array(z.enum(['categoryId', 'accountId', 'amount', 'date'])).default([]),
})
```
O Zod rejeita `TRANSFER` sem `toAccountId`, com origem igual ao destino, ou `installments` fora de cartão.

### Resultado
```ts
export type CaptureResult = {
  transactionIds: string[]               // 1 (simples), 2 (transferência) ou N (parcelas, uma por fatura)
  purchaseId: string | null              // compra no cartão
  statement: null | { key: string; dueDate: string; closingDate: string; isCurrent: boolean }
  impactsCycleCash: boolean              // true quando o vencimento da fatura cai no ciclo atual
  status: 'CLEARED' | 'PLANNED'
  undoToken: string                      // válido por 10 min
  duplicate: boolean                     // true quando o clientRequestId já existia (resposta idempotente)
}
```

### Regras por tipo
- EXPENSE/INCOME em conta de caixa: 1 `Transaction`, `source` = QUICKADD|BOT|MANUAL, `status` CLEARED se `date <= hoje`, PLANNED se futura, `review: REVIEWED` (o usuário acabou de confirmar).
- EXPENSE em CREDIT_CARD à vista: 1 compra + 1 lançamento na fatura calculada por `getCreditCardStatementCycle`; `statementKey` = mês de vencimento (ADR-008).
- EXPENSE em CREDIT_CARD parcelada: `buildInstallmentSchedule`/`splitAmountIntoInstallments` (a soma das parcelas é exatamente `amountCents`); cada parcela cai na fatura do mês correspondente; só a parcela 1 pode entrar no ciclo atual.
- Estorno (`isRefund`) em cartão: lançamento INCOME ligado à fatura aberta mais próxima, abatendo o total da fatura (nunca saldo de conta corrente). Em conta corrente: INCOME comum.
- TRANSFER: par ligado (ADR-004), duas pernas com o mesmo `transferGroupId`, criado numa única `prisma.$transaction`; destino em cartão é pagamento de fatura e fica fora de escopo (rejeitar com erro `TRANSFER_TO_CARD_USE_PAYMENT`, a F1-03 tem o pagamento).
- `impactsCycleCash` = `statement.dueDate <= cycle.end` (cartão) ou `true` (conta de caixa). Para o flag: `getCycleBounds(today, settings)` em `src/server/modules/budget/domain/cycle.ts` (criado aqui, suporta `CALENDAR_MONTH` e `INCOME_CYCLE` com `payDay`; a FC2-F3-02 reutiliza e estende).

### Gancho `afterCreate`
`src/server/modules/capture/application/after-create-hooks.ts` exporta `registerAfterCreate(fn)` e `runAfterCreate(result, ctx)`; F2-02 registra `learnFromTransaction`; F3-01 registrará o matching com PLANNED. Falha em um gancho é registrada e não desfaz a criação.

### Desfazer
`undoCapture` apaga (ou marca `deletedAt`, se o schema da F0-02 tiver soft delete) os lançamentos do `undoToken` somente se: criado há no máximo 10 min, `status` ainda CLEARED/PLANNED (nunca RECONCILED), nenhuma edição posterior (`updatedAt == createdAt`) e fatura sem pagamento. Reverte também parcelas e compra do cartão e o aprendizado do merchant daquela transação (RN-09 da F2-02).

## Regras de negócio
- RN-01: valores em centavos inteiros (ADR-002); `amountCents` é sempre o total.
- RN-02: datas de calendário ao meio-dia UTC: `new Date(date + 'T12:00:00.000Z')`, mesmo padrão de `finance/http/schemas.ts` (1.x). Nenhum `getDate()`/`setHours()` local no código novo.
- RN-03: idempotência por `(userId, clientRequestId)`: a segunda chamada devolve o mesmo resultado com `duplicate: true` e não escreve. Implementar com coluna única ou tabela `CaptureRequest` (ver Banco de dados).
- RN-04: `categoryId`, quando informada, deve pertencer ao usuário e ter `type` compatível; senão `400`.
- RN-05: conta arquivada (`isArchived`) é rejeitada.
- RN-06: todo acesso filtra por `userId` (multi-tenant mantido por segurança).
- RN-07: soma das parcelas == total, sempre; diferença de centavos vai para as primeiras parcelas (comportamento de `splitAmountIntoInstallments`).
- RN-08: lançamento futuro nasce PLANNED e não altera `AccountBalance.cleared`; só entra em `planned` (ADR-019).
- RN-09: após a criação, atualizar o cache `AccountBalance` na mesma transação (use-case do ledger da FC2-F1-01), nunca fora dela.
- RN-10: tags são normalizadas (minúsculas) e gravadas como relação/array conforme o schema da F0-02.

## Critérios de aceitação
- [ ] CA-01: `previewDraft` não escreve no banco (teste com repositório espião) e devolve `statement.dueDate` correto para compra antes e depois do fechamento.
- [ ] CA-02: despesa em conta corrente `CLEARED` altera `AccountBalance` em exatamente o valor da despesa; a mesma despesa com data futura nasce `PLANNED` e não altera `cleared`.
- [ ] CA-03: compra em cartão de R$ 2.400,00 em 10x gera 10 parcelas de R$ 240,00 em 10 faturas consecutivas, soma exata; R$ 100,00 em 3x gera 3.334 + 3.333 + 3.333 centavos.
- [ ] CA-04: transferência cria duas pernas com o mesmo `transferGroupId`, saldos origem e destino variam em sentidos opostos, ou nada é criado se uma perna falhar (teste de rollback).
- [ ] CA-05: estorno em cartão reduz o total da fatura aberta e não cria saída de caixa.
- [ ] CA-06: `impactsCycleCash` é `true` para fatura que vence dentro do ciclo e `false` para a que vence depois do fim (casos com `payDay = 5`, ver testes).
- [ ] CA-07: chamar `createFromDraft` duas vezes com o mesmo `clientRequestId` cria um único lançamento.
- [ ] CA-08: `undoCapture` desfaz dentro de 10 min e recusa (`409`) após edição, conciliação ou pagamento de fatura.
- [ ] CA-09: rotas só aceitam usuário autenticado (401) e nunca leem dados de outro `userId`.
- [ ] CA-10: `npm run lint`, `npm test`, `npx next build` passam; nenhum Prisma em `domain/`.

## Impacto técnico
### Backend
- `src/server/modules/capture/application/preview-draft.ts`, `create-from-draft.ts`, `undo-capture.ts`, `after-create-hooks.ts`.
- `src/server/modules/capture/http/schemas.ts` (acima).
- `src/server/modules/ledger/application/create-transfer.ts` (extraído de `src/app/api/transactions/transfer/route.ts` do 1.x).
- `src/server/modules/cards/domain/statement-cycle.ts` (portado de `finance/application/credit-card/statement-cycle.ts` + teste `statement-cycle.test.ts`, agora em UTC) e `cards/domain/installments.ts` (portado de `splitAmountIntoInstallments`/`buildInstallmentSchedule`).
- `src/server/modules/cards/application/create-card-purchase.ts` adaptado ao schema 2.0 (se a FC2-F1-03 já entregou, apenas reutilizar).
- `src/server/modules/budget/domain/cycle.ts` (`getCycleBounds`) + teste.
- Rotas: `src/app/api/capture/route.ts`, `src/app/api/capture/preview/route.ts`, `src/app/api/capture/undo/route.ts` (finas: auth, parse Zod, chama use-case, mapeia erro).
### Frontend
Nenhum (consumo na F2-04).
### Banco de dados
Preferir reutilizar colunas do schema 2.0 da F0-02. Pode ser necessária migration aditiva: `Transaction.clientRequestId String?` com `@@unique([userId, clientRequestId])` e `Transaction.undoToken`/tabela `CaptureRequest { id, userId, clientRequestId, resultJson, createdAt, undoneAt }` com `@@unique([userId, clientRequestId])`. Escolher a tabela `CaptureRequest` (mais simples para idempotência com múltiplas pernas) e registrar a decisão. Conferir se existem `transferGroupId` e `statementKey` (spec §6); se faltarem, migration aditiva.
### Integrações
Nenhuma externa.
### Segurança
`requireAuth` em todas as rotas (padrão `src/server/auth`); erros de domínio mapeados para status HTTP sem vazar stack; `undoToken` é opaco, aleatório (32 bytes) e amarrado ao `userId`; nenhum log de `rawText` em produção.

## Plano de implementação
- [ ] Etapa 1: portar `statement-cycle.ts` e `installments.ts` para `cards/domain/` em UTC, mantendo os testes do 1.x (`statement-cycle.test.ts`) e adicionando casos de virada de ano e de dia de fechamento 31.
- [ ] Etapa 2: `budget/domain/cycle.ts` (`getCycleBounds`) com testes (mês calendário e ciclo de renda).
- [ ] Etapa 3: extrair `create-transfer.ts` do Route Handler do 1.x para use-case com `$transaction`.
- [ ] Etapa 4: `schemas.ts` Zod e mapeamento de erros de domínio.
- [ ] Etapa 5: `preview-draft.ts`.
- [ ] Etapa 6: `create-from-draft.ts` (todos os tipos, idempotência, atualização de `AccountBalance`, ganchos).
- [ ] Etapa 7: `undo-capture.ts`.
- [ ] Etapa 8: rotas finas e testes de integração.
- [ ] Etapa 9: atualizar `docs/api/` (contratos), `docs/domain/` e `.agents/context/CONTEXT.md`.

## Estratégia de testes
- [ ] Unitários (puros): `getCreditCardStatementCycle` com `closingDay = 25`, `dueDay = 5`: compra em 2026-10-25 cai na fatura que vence em 2026-11-05; compra em 2026-10-26 cai na que vence em 2026-12-05; `closingDay = 31` em fevereiro (clamp para 28/29); virada de ano (compra 2026-12-30). `splitAmountIntoInstallments(10000, 3)` = [3334, 3333, 3333]; `(240000, 10)` = dez parcelas de 24000. `getCycleBounds('2026-10-20', { mode: 'INCOME_CYCLE', payDay: 5 })` = 2026-10-05 a 2026-11-04; `('2026-10-04', ...)` = 2026-09-05 a 2026-10-04; `payDay = 31` com `today = 2026-02-10` termina em 2026-02-27 e inicia em 2026-01-31.
- [ ] Unitários (casos de `impactsCycleCash`): `payDay = 5`, hoje 2026-10-20, cartão fecha dia 25 e vence dia 5: compra hoje vence 2026-11-05, que é posterior a 2026-11-04, então `false`. Mesmo cartão com vencimento dia 1: compra hoje (fecha 25) vence 2026-11-01, então `true`.
- [ ] Integração: (a) despesa em conta; (b) despesa futura PLANNED; (c) cartão à vista; (d) cartão 10x; (e) estorno em cartão; (f) transferência com falha injetada na segunda perna (nada gravado); (g) idempotência; (h) undo feliz; (i) undo após pagamento de fatura (409); (j) usuário B não enxerga/desfaz dados de A; (k) conta arquivada rejeitada; (l) categoria de tipo errado rejeitada.
- [ ] E2E: via F2-04 (sheet) quando a task chegar.
- [ ] Manual: `curl` com sessão em `POST /api/capture/preview` para uma compra 10x e conferir cronograma.

Edge cases: valor com 1 centavo em 12x (parcelas 1,0,0...: rejeitar com `INSTALLMENT_TOO_SMALL` quando alguma parcela ficar zero); data de compra igual ao dia do fechamento (entra na fatura que fecha naquele dia); retry de rede com o mesmo `clientRequestId`; estorno maior que o total da fatura (fatura fica negativa e o excedente vira crédito, registrar warning).

## Riscos e rollback
- Risco: portar o ciclo de fatura de local para UTC e quebrar casos do 1.x. Mitigação: manter os testes existentes do 1.x e rodá-los antes e depois da portagem.
- Risco: atualização de `AccountBalance` divergir do ledger. Mitigação: mesma `$transaction`; teste de recomputação (`recomputeBalance`) da F1-01 após cada integração.
- Rollback: rotas e use-cases novos; migration aditiva (colunas/tabela novas). Reverter commit e `prisma migrate` da tabela `CaptureRequest` se necessário; dados de teste apenas.

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

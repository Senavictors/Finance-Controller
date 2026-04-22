# Task: Phase 36 - Credit Card Installment Ecosystem And Installment Advance

## Status

- [x] Todo
- [ ] In Progress
- [x] Done

## Context

O projeto ja possui billing de cartao com limite, fechamento, vencimento, faturas e pagamento, mas ainda trata cada compra no cartao como uma unica `Transaction`. Isso impede modelar corretamente:

- compras parceladas;
- leitura de parcela por fatura;
- comprometimento futuro real;
- adiantamento/antecipacao de parcelas;
- integracao coerente entre parcelamento e wishlist.

Como analytics, goals, forecast, score e insights ja dependem fortemente de `Transaction` e `CreditCardStatement`, esta fase precisa introduzir o dominio de parcelamento sem quebrar o ledger como fonte de verdade.

Referencias principais:

- `.docs/future-features/22-credit-card-installment-ecosystem-and-installment-advance.md`
- `.docs/decisions/ADR-008-credit-card-billing-cycle.md`
- `prisma/schema.prisma`
- `src/server/modules/finance/application/credit-card/billing.ts`
- `src/app/api/transactions/route.ts`
- `src/app/api/transactions/[id]/route.ts`
- `src/app/(app)/transactions/transaction-form.tsx`
- `src/server/modules/finance/application/wishlist/use-cases.ts`

## Objective

Entregar o ecossistema completo de parcelamento do cartao de credito, com suporte a compras `1x..24x`, detalhe de parcela por fatura, integracao com wishlist e fluxo de adiantamento manual de parcelas futuras.

## Scope

- Novo dominio `credit-card-purchases`
- Novos models de compra, parcela e adiantamento
- Geracao de uma `Transaction` real por parcela
- Reuso do billing atual para associacao de parcela/fatura
- Evolucao do cadastro manual de transacao para suportar `a vista` ou `parcelado`
- Nova superficie de detalhe da compra parcelada
- Adiantamento de uma ou mais parcelas futuras com valor manual informado pelo usuario
- Integracao do parcelamento com wishlist
- Ajustes de leitura em transacoes, faturas e modulos analiticos
- Seed/reset demo mostrando cenarios reais da feature
- Documentacao da feature, task e ADR da modelagem (quando implementada)

## Out of Scope

- Integracao com API de banco/cartao
- Calculo automatico de desconto/juros com base em taxa do emissor
- Importacao automatica de compras parceladas por OFX/CSV
- Refinanciamento, renegociacao ou fusao de compras parceladas
- Compatibilidade com banco legado ou backfill complexo de dados antigos

## Decisions

- Toda compra `EXPENSE` em conta `CREDIT_CARD` passa a usar o novo dominio, inclusive `1x`
- `Transaction` permanece como ledger central do sistema
- Cada parcela possui exatamente uma `Transaction`
- Parcelamento suportado entre `1` e `24`
- O usuario informa o valor efetivo pago no adiantamento; o sistema nao calcula taxa do banco
- Wishlist deve apontar para `Transaction` simples ou para `CreditCardPurchase`, conforme a conta usada na compra
- Como nao ha requisito de compatibilidade historica, a migration pode privilegiar clareza de modelo e reset de dados

## Contracts

Rotas impactadas/criadas:

- `POST /api/transactions`
- `PATCH /api/transactions/[id]`
- `DELETE /api/transactions/[id]`
- `GET /api/credit-card-purchases/[id]`
- `POST /api/credit-card-purchases/[id]/advances`
- `POST /api/wishlist/items/[id]/purchase`

Payload adicional esperado no cadastro manual de compra no cartao:

- `paymentMode: "SINGLE" | "INSTALLMENT"`
- `installmentCount?: number`

Payload de adiantamento:

- `advancedAt: Date`
- `notes?: string`
- `installments: Array<{ installmentId: string; paidAmount: number }>`

## Migrations

Mudancas esperadas no schema:

- novos models:
  - `CreditCardPurchase`
  - `CreditCardPurchaseInstallment`
  - `CreditCardInstallmentAdvance`
- nova relacao opcional de `Transaction` para parcela
- evolucao de `WishlistItem` para suportar vinculo com compra parcelada
- possivel ajuste destrutivo/simplificado em dados existentes, ja que reset de banco e aceitavel neste ciclo

## UI

Superficies que devem ser cobertas:

- `src/app/(app)/transactions/transaction-form.tsx`
- `src/app/(app)/transactions/transaction-table.tsx`
- `src/app/(app)/credit-cards/[id]/page.tsx`
- `src/app/(app)/credit-cards/[id]/statement-transactions-list.tsx`
- nova pagina de detalhe da compra parcelada
- `src/app/(app)/wishlist/wishlist-purchase-dialog.tsx`
- cards/listagens que precisem exibir badge de parcela e estado de adiantamento

## Tests

Cobertura esperada:

- schema Zod do novo fluxo
- use cases de criacao de compra `1x` e `Nx`
- arredondamento de parcelas
- sync correto das parcelas com faturas
- adiantamento de uma parcela e de multiplas parcelas
- invalidacao analitica para compra parcelada e adiantamento
- wishlist comprando a vista e parcelado no cartao
- leitura consistente em forecast, goals, score e insights

Checks esperados ao concluir:

- `npx prisma generate`
- `npm run format`
- `npm test`
- `npm run lint`
- `npm run build`

## Checklist

- [x] Code implemented
- [x] Tests passing
- [x] `.docs/CONTEXT.md` updated
- [x] `README.md` updated (roadmap/backlog/phases/proximo passo when applicable)
- [x] ADR created/updated (if applicable)
- [x] Manual validation done

## Notes for AI (next step)

Entrega concluida com:

1. novo agregado `credit-card-purchases` com `CreditCardPurchase`, `CreditCardPurchaseInstallment` e `CreditCardInstallmentAdvance`;
2. `POST /api/transactions` e wishlist criando compras `1x..24x` no cartao com uma `Transaction` real por parcela;
3. nova tela `/credit-card-purchases/[id]` para detalhe do plano e adiantamento manual;
4. bloqueio de edicao direta da parcela e exclusao estruturada da compra inteira;
5. ajustes em monthly summary, goals, forecast, score e insights para limitar realizado a janela observada;
6. seed/reset demo reaproveitando o dominio novo, incluindo compra parcelada vinda da wishlist e adiantamento;
7. ADR `ADR-015-credit-card-installment-purchases.md` criada.

Validacoes executadas no estado final:

- `npx prisma migrate deploy`
- `npx prisma generate`
- `npm run format`
- `npm test`
- `npm run lint`
- `npm run build`
- `npx prisma db seed`

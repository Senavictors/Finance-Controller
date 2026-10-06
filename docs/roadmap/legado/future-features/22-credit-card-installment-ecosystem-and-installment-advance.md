# Credit Card Installment Ecosystem And Installment Advance

## Objetivo

Adicionar ao produto um dominio completo para compras no cartao de credito, cobrindo:

- compra a vista (`1x`) e parcelada (`2x` a `24x`);
- geracao real das parcelas no ledger financeiro;
- vinculacao correta de cada parcela a sua fatura;
- leitura consistente em transacoes, cartoes, analytics, metas, forecast, score e insights;
- integracao total com a wishlist;
- adiantamento manual de parcelas futuras com valor efetivamente pago informado pelo usuario.

O objetivo deste ciclo nao e um MVP. A entrega deve nascer como ecossistema funcional completo para o contexto atual do produto.

## Premissas deste ciclo

- Nao ha requisito de compatibilidade com bases antigas.
- O banco atual pode ser limpo/resetado se isso simplificar a modelagem.
- Toda compra `EXPENSE` em conta `CREDIT_CARD` deve passar pelo novo dominio, inclusive compras `1x`.
- O limite de parcelas suportado deve ser `24`.
- O adiantamento nao depende de formula do banco: o usuario informa o valor efetivamente pago, substituindo o valor original da parcela.

## Leitura do sistema atual

- O sistema hoje representa compra no cartao como uma unica `Transaction`.
- O billing de cartao em `application/credit-card/billing.ts` associa essa transacao a uma unica `CreditCardStatement`.
- A UI de transacoes permite escolher conta, categoria e tipo, mas nao possui semantica de parcelamento.
- A wishlist converte compra em uma unica `Transaction` e hoje guarda apenas `purchaseTransactionId`.
- Analytics, goals, forecast, score e insights leem `Transaction` e `CreditCardStatement` como fontes de verdade.

Esse desenho funciona para compras simples, mas nao representa:

- parcelamento real por fatura;
- leitura de compromisso futuro;
- auditoria de parcela individual;
- antecipacao/adiantamento de parcelas;
- vinculo coerente entre wishlist e compra parcelada.

## Recomendacao arquitetural

O produto deve ganhar um concern proprio para compras de cartao, por exemplo `credit-card-purchases`, separado do billing de fatura e reutilizado por transacoes e wishlist.

Recomendacao principal:

- `Transaction` continua sendo o ledger financeiro do sistema.
- Compra no cartao vira um agregado proprio (`CreditCardPurchase`).
- Cada parcela vira uma entidade propria (`CreditCardPurchaseInstallment`).
- Cada parcela possui exatamente uma `Transaction` real associada.
- O billing atual continua decidindo a qual fatura cada `Transaction` pertence, reaproveitando `date` e `creditCardStatementId`.

Esse desenho preserva a arquitetura atual do produto:

- o dominio de parcelamento fica explicito;
- as faturas continuam sendo compostas por transacoes reais;
- os modulos analiticos continuam lendo ledger/fatura, sem precisar interpretar um campo magico de parcelamento em uma unica linha.

## Modelo recomendado

```prisma
enum CreditCardPurchaseSource {
  MANUAL
  WISHLIST
}

model CreditCardPurchase {
  id               String   @id @default(cuid())
  userId           String   @map("user_id")
  accountId        String   @map("account_id")
  categoryId       String?  @map("category_id")
  wishlistItemId   String?  @unique @map("wishlist_item_id")
  description      String
  notes            String?
  purchaseDate     DateTime @map("purchase_date")
  totalAmount      Int      @map("total_amount")
  installmentCount Int      @map("installment_count")
  source           CreditCardPurchaseSource @default(MANUAL)
  createdAt        DateTime @default(now()) @map("created_at")
  updatedAt        DateTime @updatedAt @map("updated_at")
}

model CreditCardPurchaseInstallment {
  id                    String   @id @default(cuid())
  purchaseId            String   @map("purchase_id")
  installmentNumber     Int      @map("installment_number")
  originalAmount        Int      @map("original_amount")
  originalDueDate       DateTime @map("original_due_date")
  advanceId             String?  @map("advance_id")
  ledgerTransactionId   String   @unique @map("ledger_transaction_id")
  createdAt             DateTime @default(now()) @map("created_at")
  updatedAt             DateTime @updatedAt @map("updated_at")
}

model CreditCardInstallmentAdvance {
  id                  String   @id @default(cuid())
  purchaseId          String   @map("purchase_id")
  userId              String   @map("user_id")
  accountId           String   @map("account_id")
  advancedAt          DateTime @map("advanced_at")
  totalOriginalAmount Int      @map("total_original_amount")
  totalPaidAmount     Int      @map("total_paid_amount")
  totalDiscountAmount Int      @map("total_discount_amount")
  notes               String?
  createdAt           DateTime @default(now()) @map("created_at")
  updatedAt           DateTime @updatedAt @map("updated_at")
}

model Transaction {
  // campos atuais...
  creditCardPurchaseInstallmentId String? @unique @map("credit_card_purchase_installment_id")
}

model WishlistItem {
  // campos atuais...
  purchaseTransactionId String? @unique @map("purchase_transaction_id")
  creditCardPurchaseId  String? @unique @map("credit_card_purchase_id")
}
```

### Observacoes de modelagem

- `Transaction` continua registrando `amount`, `date`, `description`, `accountId`, `categoryId` e `creditCardStatementId`.
- `CreditCardPurchaseInstallment` guarda o plano original da parcela.
- O valor/data efetivos cobrados ficam na `Transaction` associada a parcela.
- Uma parcela adiantada continua com o mesmo `installmentNumber`, mas passa a apontar para um `advanceId`.
- `WishlistItem` deve apontar para:
  - `purchaseTransactionId` quando a compra final nao for cartao de credito;
  - `creditCardPurchaseId` quando a compra final for feita em cartao.

## Regras de negocio sugeridas

- Compra `1x` em cartao tambem gera `CreditCardPurchase`, mas com uma unica parcela.
- `installmentCount` deve ser validado entre `1` e `24`.
- O valor total deve ser repartido de forma deterministica entre as parcelas, com ajuste de centavos na ultima parcela quando necessario.
- Cada parcela gera uma `Transaction` do tipo `EXPENSE`.
- Cada `Transaction` deve ser sincronizada com a fatura correta usando o billing atual.
- O usuario nao edita parcelas futuras pela tabela generica de transacoes; operacoes estruturais devem acontecer no dominio da compra parcelada.
- Se o usuario excluir uma compra parcelada, a exclusao deve agir sobre o plano inteiro, nao sobre uma parcela isolada.
- O sistema deve impedir adiantamento de parcelas:
  - ja adiantadas;
  - ja vencidas/cobradas em contexto invalido para o fluxo;
  - pertencentes a outra compra;
  - acima do numero ainda aberto do plano.

### Adiantamento de parcela

O adiantamento deve funcionar como evento explicito de dominio.

Fluxo esperado:

1. o usuario abre o detalhe de uma compra parcelada;
2. seleciona uma ou mais parcelas futuras;
3. informa a data do adiantamento;
4. informa o valor efetivamente pago por cada parcela selecionada;
5. o sistema atualiza as `Transaction`s dessas parcelas para refletir o valor/data efetivos;
6. o sistema registra um `CreditCardInstallmentAdvance` consolidando:
   - soma original das parcelas;
   - soma paga;
   - desconto total.

Regras:

- o sistema nao calcula taxa de desconto do banco;
- o desconto e derivado da diferenca entre valor original e valor efetivamente pago;
- o valor pago informado substitui o valor original daquela parcela no ledger;
- a parcela antecipada passa a impactar a fatura da nova data, e nao mais a fatura originalmente prevista.

## API recomendada

Superficies minimas recomendadas:

- `POST /api/transactions`
  - continua sendo o ponto de entrada do cadastro manual;
  - se a conta for comum, cria `Transaction` normal;
  - se a conta for `CREDIT_CARD`, delega para o dominio `credit-card-purchases`.
- `PATCH /api/transactions/[id]`
  - deve bloquear edicao direta de transacao vinculada a parcela.
- `DELETE /api/transactions/[id]`
  - deve bloquear exclusao isolada de parcela ou redirecionar para exclusao do plano inteiro.
- `GET /api/credit-card-purchases/[id]`
  - retorna compra, parcelas, faturas derivadas e eventos de adiantamento.
- `POST /api/credit-card-purchases/[id]/advances`
  - cria um adiantamento para parcelas futuras selecionadas.
- `POST /api/wishlist/items/[id]/purchase`
  - quando a conta for cartao, deve aceitar parcelamento e criar `CreditCardPurchase`.

### Payload recomendado para compra manual no cartao

```json
{
  "amount": 120000,
  "date": "2026-04-22",
  "description": "Notebook",
  "accountId": "acc_card_1",
  "categoryId": "cat_tech_1",
  "type": "EXPENSE",
  "notes": "Compra no e-commerce",
  "paymentMode": "INSTALLMENT",
  "installmentCount": 12
}
```

### Payload recomendado para adiantamento

```json
{
  "advancedAt": "2026-07-10",
  "notes": "Antecipacao pelo app do banco",
  "installments": [
    {
      "installmentId": "inst_7",
      "paidAmount": 9400
    },
    {
      "installmentId": "inst_8",
      "paidAmount": 9300
    }
  ]
}
```

## UI recomendada

Superficies afetadas:

- `TransactionForm`
  - ao selecionar conta `CREDIT_CARD` e `EXPENSE`, exibir:
    - `Forma de pagamento`: a vista / parcelado
    - `Quantidade de parcelas`: `1..24`
- `TransactionTable`
  - exibir badge `1/12`, `2/12`, etc.;
  - exibir indicador visual quando uma parcela tiver sido adiantada;
  - oferecer link para o detalhe da compra parcelada.
- `Credit card statement detail`
  - cada compra exibida na fatura deve mostrar a parcela correspondente.
- Nova tela de detalhe da compra parcelada
  - resumo da compra;
  - grade/lista de parcelas;
  - estado original vs efetivo;
  - historico de adiantamentos;
  - CTA para adiantar parcelas.
- `WishlistPurchaseDialog`
  - ao selecionar conta `CREDIT_CARD`, deve expor os mesmos controles de parcelamento da tela de transacao.

## Modulos impactados

### Dados

- `prisma/schema.prisma`
- migrations
- seed/reset demo

### Application

- novo modulo `src/server/modules/finance/application/credit-card-purchases/`
- reaproveitamento de `application/credit-card/billing.ts`
- ajuste em invalidacao analitica quando um plano inteiro ou adiantamento alterar varias transacoes/faturas

### HTTP

- `src/server/modules/finance/http/schemas.ts`
- rotas de transacoes
- novas rotas de detalhe/adiantamento da compra parcelada
- rota de purchase da wishlist

### UI

- `src/app/(app)/transactions/*`
- `src/app/(app)/credit-cards/*`
- nova superficie de detalhe da compra parcelada
- `src/app/(app)/wishlist/*`

### Analytics e leitura

- `monthly-summary`
- `forecast`
- `goals`
- `score`
- `insights`

Especialmente importante:

- listas de transacoes recentes nao devem vazar parcelas futuras como se ja fossem realizadas;
- modulos de projecao precisam considerar parcelas futuras conhecidas como compromisso real, sem depender apenas de extrapolacao heuristica;
- score e insights devem continuar ancorados no ledger/faturas para evitar dupla contagem.

## Ordem recomendada de implementacao

1. Modelar `CreditCardPurchase`, `CreditCardPurchaseInstallment` e `CreditCardInstallmentAdvance`
2. Criar use cases server-side para:
   - criar compra no cartao;
   - detalhar compra parcelada;
   - adiantar parcelas;
   - excluir/ajustar compra inteira
3. Adaptar `POST /api/transactions` para delegar compras em cartao ao novo dominio
4. Integrar wishlist ao novo fluxo
5. Ajustar billing, invalidation e leitura de faturas
6. Adaptar analytics, goals, forecast, score e insights
7. Construir superficies de UI e detalhe da compra parcelada
8. Atualizar docs, seed/reset demo e testes automatizados

## Riscos e cuidados

- evitar dupla contagem entre parcelas futuras, faturas em aberto e projecoes;
- evitar regressao nas compras `1x`, que devem continuar simples na UX;
- manter ownership multi-tenant em compra, parcela, adiantamento e wishlist;
- garantir que o adiantamento altere a fatura correta apos a troca de data;
- impedir edicoes parciais inconsistentes fora do dominio da compra;
- tratar corretamente arredondamento de centavos e meses curtos;
- manter a demo forte o suficiente para mostrar:
  - compra `1x`;
  - compra `12x`;
  - compra advinda da wishlist;
  - adiantamento de parcelas com desconto perceptivel.

## Valor para o produto

Essa feature eleva o suporte a cartao de credito para um nivel realmente aderente ao uso real:

- cadastro fiel da compra;
- leitura clara do comprometimento futuro;
- faturas mais criveis;
- wishlist integrada ao fluxo financeiro real;
- possibilidade de registrar estrategia ativa de reducao de divida futura via adiantamento.

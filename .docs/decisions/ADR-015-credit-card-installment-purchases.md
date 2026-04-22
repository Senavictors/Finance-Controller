# ADR-015: Credit Card Purchases Modeled As An Aggregate Over Ledger Transactions

## Status

Accepted

## Context

O produto ja possuia billing de cartao com limite, fechamento, vencimento, faturas e pagamento, mas toda compra no cartao ainda era tratada como uma unica `Transaction`.

Esse desenho impedia o sistema de representar corretamente:

- compra `1x` e compra parcelada com semantica explicita;
- uma parcela real por fatura;
- compromisso futuro coerente em analytics, goals, forecast, score e insights;
- adiantamento manual de parcelas futuras;
- integracao consistente entre wishlist e compra parcelada.

Ao mesmo tempo, a base financeira do produto ja dependia fortemente de dois pilares que precisavam ser preservados:

- `Transaction` continua sendo o ledger central do sistema;
- `CreditCardStatement` continua sendo a leitura oficial de cobranca do cartao.

## Decision

### Modelagem

- Introduzir `CreditCardPurchase` como agregado principal da compra no cartao.
- Introduzir `CreditCardPurchaseInstallment` para cada parcela original do plano.
- Introduzir `CreditCardInstallmentAdvance` como evento explicito de adiantamento.
- Toda compra `EXPENSE` em conta `CREDIT_CARD`, inclusive `1x`, passa a usar esse agregado.

### Ledger

- `Transaction` permanece como fonte de verdade financeira do produto.
- Cada parcela possui exatamente uma `Transaction` real associada.
- O billing atual continua vinculando cada `Transaction` a sua `CreditCardStatement`.
- O plano original da compra fica no agregado; valor/data efetivos continuam no ledger.

### Wishlist

- Compras de wishlist em conta comum continuam apontando para `purchaseTransactionId`.
- Compras de wishlist no cartao passam a criar `CreditCardPurchase` com `source = WISHLIST`.
- O vinculo entre wishlist e compra parcelada fica em `CreditCardPurchase.wishlistItemId`.

### Adiantamento

- O usuario informa manualmente o valor efetivamente pago por parcela.
- O sistema nao calcula desconto do banco.
- O adiantamento atualiza a `Transaction` da parcela com novo valor/data e registra o consolidado em `CreditCardInstallmentAdvance`.

### Leitura analitica

- Modulos de leitura mensal passam a considerar a janela observada do periodo para nao contar parcelas futuras como realizado antes da data.
- Forecast continua projetando compromissos futuros, mas sem misturar parcelas ainda nao observadas com o realizado do mes.

## Consequences

- O produto ganha um dominio explicito para compras parceladas sem abandonar o ledger atual.
- Faturas continuam sendo compostas por transacoes reais, o que evita regras paralelas de reconciliacao.
- Edicao e exclusao de parcelas deixam de acontecer pela tabela generica de transacoes e passam a ser operacoes estruturadas do agregado.
- Wishlist, transacoes, faturas, analytics e seed/reset passam a compartilhar a mesma modelagem de parcelamento.
- Scripts como `prisma/seed.ts` conseguem reutilizar o dominio novo, desde que a invalidacao analitica tolere ausencia de contexto HTTP do Next.

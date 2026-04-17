# ADR-008: Cartao de Credito com Ciclo de Fatura, Fechamento e Vencimento

## Status

Accepted

## Context

O projeto atualmente trata `CREDIT_CARD` apenas como um tipo de conta dentro de `Account`. Isso funciona para registrar gastos no cartao, mas nao representa o comportamento real de fatura:

- limite disponivel
- ciclo de compras
- data de fechamento
- data de vencimento
- valor pago e valor em aberto

As proximas features planejadas, como metas, forecast, score e insights, precisam dessa modelagem para produzir resultados criveis.

## Decision

O sistema continuara tratando cartao de credito como um `Account`, mas passara a ter um dominio proprio de faturamento.

- `Account` do tipo `CREDIT_CARD` recebera configuracao de:
  - `creditLimit`
  - `statementClosingDay`
  - `statementDueDay`

- Sera introduzido o modelo `CreditCardStatement` para representar cada fatura de um cartao.

- Cada compra registrada em uma conta `CREDIT_CARD` sera associada a uma fatura por meio de `creditCardStatementId` na tabela `transactions`.

- Pagamento de fatura continuara usando a estrategia atual de transferencia entre contas, preservando o ledger unificado. Quando o destino for uma conta `CREDIT_CARD`, a transacao de entrada no cartao podera ser associada a uma fatura especifica.

- A data de vencimento da fatura sera calculada como a proxima ocorrencia valida de `statementDueDay` apos a data de fechamento daquela fatura.

- Features futuras que dependem de cartao devem preferir:
  - valor da fatura aberta
  - utilizacao do limite
  - vencimento proximo

em vez de usar apenas totais mensais simplificados.

## Consequences

- O modelo fica mais fiel ao comportamento real de cartao de credito
- O projeto preserva uma fonte unica de verdade para movimentacoes financeiras usando `transactions`
- Consultas e regras ficam mais complexas, porque passam a existir conceitos de compra, fatura e pagamento
- Sera necessario backfill para contas `CREDIT_CARD` ja existentes quando a implementacao ocorrer
- Dashboard, metas, forecast, score e insights poderao usar semantica real de limite e fatura

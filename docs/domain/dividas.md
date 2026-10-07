---
estado: real
fonte: src/server/modules/debts/ (task FC2-F1-05); decisões em ADR-028, ADR-019, ADR-002, ADR-025
ultima-revisao: FC2-F1-05 2026-10-07
---

# Dívidas e juros

Módulo `src/server/modules/debts/{domain,application,infra,http}`. Rotas: `src/app/api/debts/**`. Alimenta a tela Planejar (F3-05, dívidas ordenadas por taxa com custo mensal em R$ e data de quitação) e o engine Disponível (F3-02, parcelas pendentes e atrasadas como compromissos).

## Convenções

- Dinheiro em centavos inteiros; arredondamento `Math.round` (meio para cima) por passo, e a **última parcela fecha o saldo a zero**.
- Taxas como **fração mensal** (`0.02` = 2% a.m.) em todo o domínio, nos use-cases e na API. O banco guarda `monthlyRate` como `Decimal(9,6)` (fração) e `lateFeePct`/`lateInterestMonthlyPct` como percentual `Decimal(5,2)` (`2` = 2%); a conversão (`.toNumber()` e x100 ou /100) acontece só em `infra/prisma-loan-repository.ts`.
- Datas de calendário ao meio-dia UTC (ADR-002); "hoje" é o dia de São Paulo derivado do `now` recebido por parâmetro (`domain/calendar.ts`: `businessCalendarDay`, `addMonthsClamped`, `diffCalendarDays`). Nenhuma função de domínio lê o relógio.
- Exemplos e testes usam só valores redondos fictícios (R$ 10.000,00 a 2% a.m. em 12 parcelas).

## Fórmulas

| Peça                     | Fórmula                                                                                                                      |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Parcela Price            | `PMT = P·i / (1 − (1+i)^−n)`; `i = 0` => `round(P/n)`. 1.000.000, 2%, 12x => 94.560                                          |
| Cronograma               | juros = `round(saldo·i)`; amortização = `PMT − juros`; a última parcela amortiza o saldo restante (resíduo)                   |
| Parcela real do contrato | Se informada, prevalece sobre o PMT calculado (CET, IOF e seguros mudam a parcela); a taxa é inferida (taxa "efetiva")       |
| Taxa implícita           | Bissecção em `[0, 1]`, tolerância 1e-9, até 200 iterações; `0` se `parcela × n <= principal`                                  |
| Atraso                   | multa única `round(valor·lateFee)` (default 2%) + mora `round(valor·lateInterest·dias/30)` (default 1% a.m., mês de 30 dias)  |
| Cheque especial (mensal) | `round(uso·(taxa + iof))`; o uso vem do ledger (`usage.used`)                                                                 |
| Cheque especial (série)  | Σ diária de `max(0, min(−saldo, limite))·(taxa/30)`; o excedente além do limite é reportado à parte                           |
| Rotativo                 | `round(não pago·taxa)`, limitado a `originalPrincipal·capMultiple − juros já cobrados` (teto legal, `capMultiple = 1`)        |
| Prazo de quitação        | `n = ceil(−ln(1 − i·B/P) / ln(1+i))`; `Infinity` se `P <= round(B·i)`; `i = 0` => `ceil(B/P)`                                 |
| Taxa anual equivalente   | `(1+i)^12 − 1` (2% a.m. => 26,82% a.a.)                                                                                      |
| Ordenação                | taxa mensal desc; desempate por custo mensal desc, saldo desc e `id`. A ordem vem **sempre da taxa**, nunca do tipo           |

## Limites das estimativas

- **Cheque especial e rotativo são estimativas.** O banco pode usar dias corridos, base 360/365, IOF diário e capitalização própria. O que o banco realmente cobrar entra no ledger como `INTEREST`/`FEE` e prevalece. Toda saída traz `assumptions` para a UI exibir.
- A taxa inferida de um contrato cuja parcela inclui seguro/tarifas é uma taxa **efetiva** (maior que a nominal); a UI deve rotular assim.
- Fora de escopo: renegociação, portabilidade, CET/IOF detalhado do contrato, amortização extraordinária parcial (a simulação cobre apenas valor extra mensal e quitação antecipada simples).
- Cheque especial/rotativo **sem uso** não aparecem em `listDebts` (decisão da F1-05); `includeIdle: true` os inclui com custo 0.

## Tipos de dívida

| `kind`                                                   | Natureza                               | Saldo                                                                    | Custo mensal                                |
| -------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------- |
| `CONSIGNADO`, `PERSONAL`, `PIX_CREDIT`, `CARD_REFINANCE` | Parcelado (Price), `LoanInstallment[]` | Σ principal das parcelas em aberto                                       | `round(saldo·i)` (juros da próxima parcela) |
| `OVERDRAFT`                                              | Conta com limite, sem parcelas         | `usage.used` da posição do ledger                                        | `overdraftMonthlyCost`                      |
| `CARD_REVOLVING`                                         | Cartão, sem parcelas                   | Σ faturas vencidas e não quitadas (leitura-somente do módulo de cartões) | `revolvingMonthlyCost` com teto de 100%     |

Pix no crédito e limite do cartão convertido em saldo são `PIX_CREDIT`: empréstimo parcelado com a taxa informada pelo usuário.

## Pagamento de parcela (`registerInstallmentPayment`)

Tudo em **uma transação** (`ledger.runInTransaction`, ADR-025), com `LoanInstallment` escrita via `prismaClientOf(uow.tx)`:

1. Trava a linha do contrato (`FOR UPDATE`) antes de qualquer chamada ao ledger (ordem de locks).
2. `EXPENSE` da parcela (categoria `parcelas-emprestimos`) e, se houver atraso, `FEE` (`multas-atrasos`) e `INTEREST` (`juros-encargos`) em lançamentos próprios, para alimentar o relatório de juros pagos (F6-03).
3. `LoanInstallment` => `PAID`, `paidAt`, `paidAmountCents` (parcela + encargos), `lateChargesCents`, `transactionId` (lançamento da parcela). A marcação é condicional a `status = PENDING`: de dois pagamentos simultâneos, só um vence; o outro recebe `INSTALLMENT_ALREADY_PAID` e os lançamentos dele são desfeitos.
4. `outstandingCents` recalculado; pagar a última parcela => `Loan.status = PAID_OFF`.

`amountPaid` (opcional) informa o total realmente debitado: a parte acima da parcela vira multa (até o valor calculado) e o restante, juros. Pagamento menor que a parcela é recusado (`DEBT_PARTIAL_PAYMENT_UNSUPPORTED`). Pagamento fora de ordem é permitido e sinalizado (`outOfOrder`). A falha de qualquer lançamento desfaz parcela, multa, juros e a atualização da parcela.

## Compromissos do ciclo (`listPendingDebtObligations`)

Parcelas `PENDING` ou atrasadas de contratos `ACTIVE`/`DEFAULTED` com vencimento `<= until`, com `amountDueNow` = parcela + encargos de atraso até `now` (RN-09). Parcelas pagas ou ignoradas ficam de fora. Ordenado por vencimento, contrato e número. É o contrato que o engine Disponível consome.

## Erros estáveis

`DEBT_INVALID_INPUT`, `DEBT_INCONSISTENT_CONTRACT`, `DEBT_PARTIAL_PAYMENT_UNSUPPORTED`, `DEBT_NOT_INSTALLMENT_LOAN` (400); `DEBT_LOAN_NOT_FOUND`, `DEBT_INSTALLMENT_NOT_FOUND`, `DEBT_ACCOUNT_NOT_FOUND` (404); `INSTALLMENT_ALREADY_PAID`, `DEBT_INSTALLMENT_NOT_PAYABLE`, `DEBT_LOAN_HAS_PAID_INSTALLMENTS` (409). Erros do ledger propagam com os códigos `LEDGER_*`.

## API HTTP

| Rota                                             | Uso                                                                        |
| ------------------------------------------------ | -------------------------------------------------------------------------- |
| `GET/POST /api/debts`                            | listar (ordenado por taxa, com totais) / cadastrar                         |
| `GET/PATCH/DELETE /api/debts/[id]`               | detalhe com cronograma / editar ou arquivar / apagar (só sem parcela paga) |
| `POST /api/debts/[id]/installments/[number]/pay` | pagar parcela                                                              |
| `GET /api/debts/[id]/simulate`                   | simulação de quitação (`extraMonthlyPayment`, `lumpSum`)                   |
| `GET /api/debts/summary`                         | totais e resumo por dívida                                                 |
| `GET /api/debts/overdraft-cost?accountId&month`  | custo estimado do cheque especial no mês                                   |

## API para outros módulos

`src/server/modules/debts/index.ts` (sem importar `@/server/db`); a instância ligada ao Prisma vem de `getDebtsDeps()` em `infra/default-deps.ts`. Principais: `listDebts`, `getDebtSummary`, `getDebtDetail`, `listPendingDebtObligations`, `simulatePayoff`, `estimateOverdraftCost`, `createLoan`, `registerInstallmentPayment`, e o domínio puro (`priceInstallment`, `buildAmortizationSchedule`, `impliedMonthlyRate`, `lateCharges`, `monthsToPayoff`, `annualEquivalent`, `rankDebtsByRate`).

## Segurança e privacidade

Nome do credor e do contrato são texto livre e **rejeitam sequências de 11 ou mais dígitos** (ignorando `.`, `-`, `/` e espaço) para evitar CPF, CNPJ ou conta digitados por engano. Todas as consultas filtram por `userId`.

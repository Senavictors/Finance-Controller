---
id: ADR-028
title: Dívidas e juros como módulo de primeira classe
status: accepted
date: 2026-10-05
deciders: [Victor (dono do produto), orquestrador]
related_tasks: [FC2-F1-05, FC2-F3-02, FC2-F3-05, FC2-F3-07, FC2-F0-02]
supersedes: []
---

# ADR-028 — Dívidas e juros como módulo de primeira classe

## Contexto
O perfil financeiro do dono inclui cheque especial frequente, vários cartões com limites baixos, uso de Pix no crédito e limite convertido em saldo (crédito caro), empréstimos consignados (parcela fixa, débito em conta) às vezes com parcelas em atraso, e possível rotativo. O 1.x só tinha transações e metas; juros viravam despesa genérica e a dívida sumia dos números. Sem enxergar o custo, não há decisão de quitação.

## Decisão
1. **Módulo `debts`** em `src/server/modules/debts/{domain,application,infra,http}` com entidades:
   - `Loan`: `id`, `userId`, `kind` (CONSIGNADO | PERSONAL | OVERDRAFT | CARD_REFINANCE | PIX_CREDIT), `name`, `principalCents`, `monthlyRateBp` (taxa mensal em pontos-base inteiros: 1,89% = `189`), `installmentsTotal`, `installmentsPaid`, `outstandingCents` (saldo devedor), `system` (PRICE), `firstDueDate`, `accountId` (débito), `status` (ACTIVE | LATE | PAID_OFF).
   - `LoanInstallment`: `loanId`, `number`, `dueDate`, `amountCents`, `interestCents`, `principalCents`, `status` (PLANNED | PAID | LATE), gerada pela tabela Price e ligada a uma série `LOAN_INSTALLMENT` (ADR-020).
2. **Sistema Price** (parcela fixa), funções puras em `debts/domain/price.ts`:

```text
i   = monthlyRateBp / 10000
PMT = PV × i ÷ (1 − (1 + i)^−n)            // arredondado ao centavo
juros_k    = round(saldo_(k−1) × i)
amort_k    = PMT − juros_k
saldo_k    = saldo_(k−1) − amort_k          // última parcela ajusta resíduo de arredondamento
```
   Se o contrato real informar a parcela, ela vence; o sistema recalcula a taxa implícita (busca bissecção, tolerância R$ 0,01) para exibir o custo.
3. **Cheque especial** (`OVERDRAFT`): sem parcelas. `custoMensal ≈ usoMedioLimite × taxaMensal`; os juros reais lançados pelo banco entram como `kind = INTEREST` e IOF como `FEE`. Saldo devedor = `max(0, −saldoAtual)` da conta (ADR-019).
4. **Rotativo do cartão**: se a fatura vence sem pagamento total, o saldo remanescente vira `Loan` kind `CARD_REFINANCE`/rotativo com a taxa informada; juros e multa entram como lançamentos `INTEREST` na fatura seguinte.
5. **Pix no crédito e limite convertido em saldo**: tratados como `Loan` (`PIX_CREDIT`) com taxa efetiva do emissor (valor + tarifa/IOF). Registrados no momento em que o valor entra na conta como entrada, com parcela futura na fatura (se parcelado) e custo calculado: `custoTotal = Σ parcelas − principal`.
6. **Custo mensal da dívida**: `custoMensalCents = round(saldoDevedor × i)` por contrato (para cheque especial usa o saldo médio). O total em Planejar é `Σ custoMensal` e vira a linha "juros que você paga por mês".
7. **Ordenação por taxa** (avalanche): decrescente por `monthlyRateBp`, com desempate por saldo devedor; ordem esperada típica (rotativo > cheque especial > Pix no crédito/limite convertido > consignado) é consequência das taxas, não regra fixa. A UI exibe "quitar este primeiro economiza R$ X por mês".
8. **Data prevista de quitação**: simulação com pagamento extra mensal configurável (`extraPerMonthCents`): iterar `saldo × (1+i) − pagamento` até <= 0; resultado em meses e data. Atrasadas entram no caixa (ADR-021) e geram `OUTSTANDING` (ADR-020).
9. **Metas**: `Goal.kind = DEBT_PAYOFF` referencia um `Loan` (F3-07) e mostra progresso `1 − saldoDevedor ÷ principal`.

## Alternativas consideradas
### Alternativa A — Dívida como categoria de despesa
- Vantagens: zero modelagem nova.
- Desvantagens: não mostra saldo devedor, taxa nem custo; impossível ordenar por taxa ou simular quitação.

### Alternativa B — Importar contrato e usar apenas a parcela informada
- Vantagens: simples e sempre igual ao banco.
- Desvantagens: não calcula juros por parcela nem cenários de antecipação; sem o custo mensal.

### Alternativa C — Integrar simulador de terceiros
- Vantagens: cálculos prontos.
- Desvantagens: dependência externa e dados de contrato fora do sistema; Price é fórmula fechada simples.

## Consequências
### Positivas
- Custo da dívida visível e acionável; "para sair do vermelho" vira meta concreta.
- Parcelas alimentam caixa e recorrências automaticamente.

### Negativas
- Cálculos de juros diferem em centavos do banco (IOF, dias corridos); mitigado com campo de ajuste manual e `LoanInstallment.amountCents` editável.
- Mais um módulo para manter.

### Riscos
- Taxa digitada errada distorce custos: validar faixa (0 < taxa <= 30% a.m.) e exibir taxa implícita.
- Cheque especial com juros diários vs mensal: usar mensal para estimativa e deixar o lançamento real do banco prevalecer.

## Plano de adoção
1. FC2-F0-02: `Loan`, `LoanInstallment`.
2. FC2-F1-05: `price.ts` com testes (casos conhecidos: PV 1.000,00, i 2%, n 12 e comparação a planilha), use-cases e rotas.
3. FC2-F3-02/F3-05/F3-07: consumo na engine Disponível, Planejar e metas.

## Validação
- Soma de amortizações = principal (diferença 0 centavos) em 100% dos testes.
- Teste de propriedade: `saldo_n = 0` e parcelas somam `PMT × n ± 1 centavo`.
- Conferir com o contrato do dono fora do Git (dados em `private/`).

## Revisão
Quando surgir novo tipo de dívida (financiamento SAC) ou mudança regulatória de juros.

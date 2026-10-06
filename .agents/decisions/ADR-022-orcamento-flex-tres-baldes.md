---
id: ADR-022
title: Orçamento Flex em 3 baldes
status: accepted
date: 2026-10-05
deciders: [Victor (dono do produto), orquestrador]
related_tasks: [FC2-F3-03, FC2-F3-05, FC2-F3-02, FC2-F1-07]
supersedes: []
---

# ADR-022 — Orçamento Flex em 3 baldes

## Contexto
O dono não quer manter orçamento por categoria detalhado (planejamento leve, princípio 6). Ao mesmo tempo precisa saber quanto pode gastar com despesas variáveis sem estourar o ciclo. Parte dos gastos é inevitável e fixa (telefonia, DAS, parcelas), parte acontece raramente mas pesa (IPVA, seguro, presentes, manutenção) e parte é o dia a dia (mercado, delivery, transporte, lazer). Misturar tudo distorce o ritmo.

## Decisão
1. **Três baldes** (`BudgetLine.bucket`) por ciclo (`BudgetCycle`):
   - **FIXED**: valores previsíveis do ciclo (contas, assinaturas, parcelas, DAS). Vêm de `RecurringSeries` e `Loan`; não consomem o flex.
   - **NON_MONTHLY**: gastos não mensais provisionados: `provisaoMensal = totalAnualEstimado ÷ 12`, onde o total é a soma dos últimos 12 meses da categoria (ou valor informado). A provisão aparece como linha do ciclo, e o gasto real é abatido da reserva acumulada.
   - **FLEX**: tudo o que sobra e é variável. `flexAmountCents` do ciclo.
2. **Sugestão do Flex**: média dos **3 últimos ciclos fechados** do gasto variável (`gastoFlex`) por categoria, somada na categoria `FLEX`, limitada ao que cabe:

```text
sugestaoFlex = min( média3ciclos(gastoFlex),
                    rendaPrevista − Σ FIXED − Σ provisão NON_MONTHLY − colchão )
```

   Se houver menos de 3 ciclos, usar o que existir; sem histórico, sugerir 30% da `rendaPrevista`. O usuário pode aceitar, ajustar ou fixar (`flexAmountCents`).
3. **Por categoria**: cada categoria FLEX pode ter um alvo opcional (`BudgetLine.targetCents`); sem alvo, só soma. Watchlists: até 5 categorias vigiadas com alerta em 80% e 100%.
4. **Gastos que contam**: transações com `kind = EXPENSE`, `excludeFromBudget = false`, categoria em balde FLEX, `status != PLANNED`. Compras no crédito contam na data da compra (não na do pagamento da fatura). `CARD_PAYMENT`, transferências, juros e ajustes não contam como flex (juros têm relatório próprio).
5. **Ritmo** usa a fórmula do ADR-021: `ritmo = gastoFlex ÷ (flex × diaAtual ÷ diasNoCiclo)`, mostrado como linha ideal vs real.
6. **Classificação Must/Need/Want** (`Merchant.nature`) é só análise (F6-03); não define baldes.

## Alternativas consideradas
### Alternativa A — Orçamento por envelopes (YNAB)
- Vantagens: controle fino e metodologia conhecida.
- Desvantagens: curva de aprendizado alta (atribuir cada real, regras de rollover), incompatível com cheque especial recorrente e com o objetivo de "planejamento leve"; abandono provável no uso pessoal.

### Alternativa B — Orçamento por categoria (limite mensal em cada uma)
- Vantagens: familiar; já existia no 1.x.
- Desvantagens: dezenas de números para manter; estoura em uma categoria e o usuário desiste; não separa gastos não mensais.

### Alternativa C — Regra 50/30/20
- Vantagens: zero configuração.
- Desvantagens: ignora dívidas e renda variável (base + presencial); não dá "R$/dia".

## Consequências
### Positivas
- Um único número flex a vigiar; gastos pesados anuais deixam de "estourar" o mês.
- Sugestão automática reduz configuração a um toque.

### Negativas
- Média de 3 ciclos é ruidosa para quem tem poucos dados; sazonalidade só é capturada nas provisões.
- Exige classificar categorias em baldes (categorias padrão BR vêm pré-classificadas na F1-07).

### Riscos
- Provisão NON_MONTHLY superestimada reduz o flex; revisão trimestral no relatório.
- Mudança de ciclo (calendário ↔ renda) altera a série histórica: recalcular médias por ciclo atual.

## Plano de adoção
1. FC2-F1-07: categorias padrão com `bucketDefault` (FIXED, NON_MONTHLY, FLEX).
2. FC2-F3-03: `budget/domain/flex.ts` (sugestão, ritmo, provisões) e `application/` para `BudgetCycle`/`BudgetLine`.
3. FC2-F3-05: UI em Planejar (barra de alocação e Flex por categoria).

## Validação
- Testes de tabela para sugestão com 0, 1, 2 e 3+ ciclos.
- Após 2 ciclos: estouro do flex em <= 1 dos 2.

## Revisão
Após 3 ciclos reais ou se o dono pedir envelopes.

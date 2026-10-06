---
id: ADR-021
title: Engine Disponível — ciclo de renda, caixa × flex e modo Aperto
status: accepted
date: 2026-10-05
deciders: [Victor (dono do produto), orquestrador]
related_tasks: [FC2-F3-02, FC2-F3-04, FC2-F3-05, FC2-F5-05]
supersedes: []
---

# ADR-021 — Engine Disponível: ciclo de renda, caixa × flex e modo Aperto

## Contexto
O forecast do 1.x era receita − despesa do mês, com dupla contagem de itens e ignorando saldos, faturas e limite. A pergunta central do produto é "quanto posso gastar?". O dono recebe a renda em dia fixo do mês (não no dia 1), tem saldo frequentemente negativo com cheque especial e faturas de cartão a vencer; antes do pagamento, o problema não é "quanto sobra", e sim "o que falta até o salário".

## Decisão
Uma engine **pura** (`src/server/modules/budget/domain/available.ts`, sem Prisma) calcula, a partir de saldos, limites, previstos e gasto flex, o estado de Hoje. Fórmulas normativas (spec §5.1):

```text
caixaFimCiclo = Σ saldo(contas)                       // pode ser negativo
              + Σ entradas previstas (renda, reembolsos)
              − Σ faturas que vencem no ciclo
              − Σ fixas/DAS/parcelas pendentes (inclui atrasadas)

livre  = min(flex − gastoFlex, caixaFimCiclo − colchão)
porDia = livre ÷ dias restantes
ritmo  = gastoFlex ÷ (flex × diaAtual ÷ diasNoCiclo)

// Modo Aperto (antes da próxima renda)
devidoAntes     = Σ itens com vencimento < dataRenda
disponivelAgora = Σ saldo(contas) + Σ limite(cheque especial)
falta  = max(0, devidoAntes − max(0, disponivelAgora)) + max(0, −disponivelAgora)
aperto = rendaPendente ∧ falta > 0

rendaPrevista(ciclo) = base + adicionalPorDia × diasPresenciais(calendário, diasDaSemana, feriados)
```

Regras adicionais:
1. **Ciclo configurável**: `calendar` (mês civil) ou `income` (do dia do pagamento até a véspera do próximo pagamento). Default do dono: **ciclo de renda**. `diasNoCiclo` e `diasRestantes` (inclusive hoje, mínimo 1) saem das datas do ciclo; ciclos são determinísticos a partir de `IncomeRule.diaPagamento` (ADR-029), com ajuste para dia útil.
2. **Caixa × flex**: `flex − gastoFlex` limita o gasto discricionário planejado; `caixaFimCiclo − colchão` limita o que o caixa realmente suporta. `livre` é o menor dos dois, e a UI mostra qual limitou ("limite: flex" ou "limite: caixa"). `colchão` vem de `BudgetCycle.cushionCents` (default 0).
3. **Saldo de cartões**: compras no crédito entram no `gastoFlex` na data da compra; só impactam o **caixa** do ciclo se a fatura de destino vence dentro dele (chave de fatura do ADR-008). Faturas já fechadas e a vencer entram em "faturas que vencem no ciclo".
4. **Sem dupla contagem**: um item previsto casado com um lançamento real (ADR-020) deixa de ser previsto. Parcelas de cartão contam na fatura, não de novo como fixas. Transferências entre contas próprias têm efeito zero no caixa total.
5. **Modo Aperto** ativa quando `aperto = true`; a tela mostra `falta`, a lista de itens `devidoAntes` ordenada por vencimento e a série de **saldo projetado dia a dia** com faixa `[−overdraftLimit, 0]`. Se `rendaPendente = false` (a renda do ciclo já entrou) a tela fica em modo Normal mesmo com saldo baixo.
6. **Saída**: `{ modo, livre, porDia, ritmo, limitadoPor, falta, devidoAntes[], serieCaixa[], aura }`, onde `aura` ∈ calm (ritmo <= 1,0 e livre > 0), tense (1,0 < ritmo <= 1,15 ou falta > 0 pequena) e hot (ritmo > 1,15, livre <= 0 ou falta > 0 após uso do limite).
7. Todos os valores em centavos; arredondamento de `porDia` para baixo (`floor`) para nunca prometer mais do que existe.

## Alternativas consideradas
### Alternativa A — Receita − despesa do mês (modelo 1.x)
- Vantagens: simples e conhecida.
- Desvantagens: ignora saldo atual, limite, faturas e dia de pagamento; conta dupla; não funciona com renda fora do dia 1.

### Alternativa B — Orçamento por envelopes com "dinheiro a atribuir" (YNAB)
- Vantagens: resposta exata por categoria.
- Desvantagens: exige atribuir todo o dinheiro e manutenção diária; incompatível com saldo negativo e cheque especial como rotina (ver ADR-022).

### Alternativa C — Projeção probabilística (Monte Carlo) de gastos variáveis
- Vantagens: intervalos de confiança.
- Desvantagens: opaco para o usuário, difícil de explicar em uma tela; o princípio é "número que não mente" e engines explicáveis.

## Consequências
### Positivas
- "Quanto posso gastar" e "quanto falta até o salário" em um número cada, com explicação.
- Engine pura, testável com tabelas de casos.

### Negativas
- Depende de dados completos (recorrências, faturas, renda); dados faltando geram números otimistas.
- Duas lógicas (Normal e Aperto) para comunicar.

### Riscos
- Renda atrasada: `rendaPendente` fica verdadeiro após o dia previsto; mostrar aviso e permitir "confirmar recebimento".
- Erro de fórmula em borda (ciclo de 28–31 dias, último dia do ciclo): cobertura por testes de tabela.

## Plano de adoção
1. FC2-F3-02: `available.ts`, `cycle.ts` e testes (mínimo 25 casos: Aperto, Normal, renda atrasada, fatura no ciclo, parcelas, saldo negativo, limite estourado).
2. FC2-F3-04: tela Hoje consome o resultado via use-case `getAvailable`.
3. FC2-F5-05: agente Resumo/Vigia usa a mesma saída.

## Validação
- Casos de teste sintéticos em `tests/fixtures/available/*.json` com resultado esperado em centavos.
- Conferência manual por 2 ciclos: livre previsto vs gasto real, desvio médio <= 10%.

## Revisão
Após 2 ciclos de uso real ou se a mudança da regra de renda (ADR-029) alterar o ciclo.

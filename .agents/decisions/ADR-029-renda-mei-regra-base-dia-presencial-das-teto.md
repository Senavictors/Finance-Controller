---
id: ADR-029
title: Renda MEI com regra base + dia presencial, DAS e teto anual
status: accepted
date: 2026-10-05
deciders: [Victor (dono do produto), orquestrador]
related_tasks: [FC2-F1-06, FC2-F3-02, FC2-F3-05, FC2-F5-05, FC2-F0-02]
supersedes: []
---

# ADR-029 — Renda MEI com regra base + dia presencial, DAS e teto anual

## Contexto
A renda do dono vem de MEI/PJ: pagamento mensal em dia fixo, composto por **valor base + adicional por dia presencial trabalhado** (dias da semana configuráveis). O recebimento cai em uma conta PJ separada e é transferido para a PF. O MEI paga **DAS** mensal e tem **teto anual de faturamento**, cuja ultrapassagem muda o enquadramento tributário. O valor do ciclo é a base da engine Disponível (ADR-021) e do Flex (ADR-022), então precisa ser previsto com precisão e o teto precisa ser acompanhado antes de estourar.

Os valores abaixo são exemplos; os reais são configuração do usuário e ficam fora do Git.

## Decisão
1. **`IncomeRule`**: `userId`, `name`, `baseCents`, `perPresentialDayCents`, `weekdays` (conjunto de 0–6, dias presenciais padrão), `payDay` (1–31, com ajuste para o último dia/dia útil), `payAdjust` (NONE | NEXT_BUSINESS_DAY | PREV_BUSINESS_DAY), `destinationAccountId` (conta PJ), `transferToAccountId?` (PF), `validFrom`, `validTo?`, `isActive`. Mudanças geram nova regra (histórico preservado).
2. **Cálculo** (`income/domain/income-rule.ts`, puro):

```text
diasPresenciais(ciclo) = nº de datas d no período de apuração tal que
                         d.weekday ∈ weekdays  ∧  d ∉ feriados  ∧  d ∉ exceções(ausências)
rendaPrevista(ciclo)   = baseCents + perPresentialDayCents × diasPresenciais(ciclo)
```
   O **período de apuração** (qual mês de trabalho paga em qual data) é configurável em `IncomeRule.workPeriod` (ex.: mês anterior ao pagamento). Feriados: nacionais (tabela `Holiday`, preenchida por seed anual calculada, incl. móveis como Carnaval e Corpus Christi) mais feriados municipais/pontes manuais. Exceções por data (`IncomeException`: falta, home office, dia extra) ajustam `diasPresenciais`. Valor realizado (quando o dinheiro cai) substitui a previsão: `status` PLANNED > CLEARED via matching (ADR-020).
3. **Recorrência**: a regra gera série `INCOME` (RRULE mensal em `payDay`) cuja ocorrência PLANNED tem `amountCents = rendaPrevista`, recalculada na materialização. Ao cair o recebimento, o usuário confirma ("Recebi") e a diferença entre previsto e real é registrada para calibrar. Transferência PJ→PF é série `TRANSFER` ligada (ADR-004).
4. **DAS MEI**: série `TAX` mensal (`dasDueDay`, normalmente dia 20), valor configurável em `Settings.dasMonthlyCents` (exemplo fictício: R$ 80,00, atualizado quando o salário mínimo muda); conta pagadora configurável; entra como "fixas/DAS" do caixa (ADR-021) e como lançamento previsto atrasável.
5. **`MeiLedger`** (um registro por usuário e ano): `year`, `grossRevenueCents` (Σ recebimentos tagueados como receita MEI na conta PJ no ano, regime de caixa por padrão; configurável para competência), `ceilingCents`, `projectedCents`, `monthsActive`, `openedAt?`. Recalculado no job diário (ADR-030).
6. **Teto anual**:

```text
ceilingCents(ano) = 81_000_00                                  // R$ 81.000,00, ano completo
ceilingCents(ano de abertura) = 6_750_00 × mesesAtivos         // R$ 6.750,00 × meses, contando o mês de abertura
projectedCents = grossRevenueCents ÷ mesesDecorridos × 12      // projeção linear; ou real + previstos restantes
usoTeto = grossRevenueCents ÷ ceilingCents
```
   Alertas: **80%** (atenção), **95%** (crítico) e quando `projectedCents > ceilingCents`.
7. **Regras de excesso** (exibidas como orientação, com aviso de confirmar com contador):
   - Excesso **até 20%** do teto (até R$ 97.200,00 no ano completo): permanece MEI no ano corrente, paga **DAS complementar** sobre o excesso (alíquotas do Simples sobre a parcela excedente, apurado até o mês seguinte) e é **desenquadrado a partir de 1º de janeiro do ano seguinte**.
   - Excesso **acima de 20%**: **desenquadramento retroativo a 1º de janeiro** do ano (ou data de abertura) com tributação como ME sobre todo o excedente do ano.
   - No ano de abertura, os limites de 20% se aplicam sobre o teto proporcional.
8. **Alerta de migração para ME**: quando `projectedCents > ceilingCents × 1,0` ou `usoTeto >= 0,95`, o sistema mostra "migração para ME recomendada" com o mês estimado de estouro e o excesso projetado. Envia aviso pelo Telegram (agente Vigia). Nada é calculado como obrigação fiscal; é apoio à decisão.
9. Valores de teto e alíquotas ficam em `Settings`/constantes versionadas (`income/domain/mei-limits.ts`), com data de vigência, para atualizar sem alterar código de cálculo.

## Alternativas consideradas
### Alternativa A — Renda como lançamento manual mensal
- Vantagens: sem modelagem.
- Desvantagens: a previsão do ciclo (que é o coração do ADR-021) depende de digitar o valor com antecedência; não reflete a variação por dias presenciais.

### Alternativa B — Planilha ou contador externo para teto e DAS
- Vantagens: precisão contábil.
- Desvantagens: informação fora do app e tardia; o objetivo é alerta antecipado, não apuração fiscal.

### Alternativa C — Modelo genérico de "renda variável" sem calendário
- Vantagens: serve para qualquer perfil.
- Desvantagens: não calcula pelo calendário de dias da semana e feriados, que é como o valor realmente varia.

## Consequências
### Positivas
- Renda do ciclo previsível ao centavo; DAS nunca esquecido; teto monitorado com antecedência.
- Base única para Disponível, Flex e Planejar.

### Negativas
- Regras fiscais mudam (teto, DAS): exige manutenção das constantes.
- Calendário de feriados exige seed anual.

### Riscos
- Interpretação fiscal incorreta: o app é informativo; textos com "confirme com seu contador".
- Misturar receitas não MEI na conta PJ: exigir tag "receita MEI" no recebimento, com padrão para entradas da conta PJ marcada como `BUSINESS`.

## Plano de adoção
1. FC2-F0-02: `IncomeRule`, `IncomeException`, `Holiday`, `MeiLedger`.
2. FC2-F1-06: `income-rule.ts` e `mei-limits.ts` com testes (mês com feriado, mudança de dias da semana, ano de abertura em outubro = 3 meses = R$ 20.250,00, excesso de 10% e de 25%).
3. FC2-F3-02: integração com a engine; FC2-F3-05: Planejar mostra renda do ciclo, DAS e barra do teto; FC2-F5-05: alertas.

## Validação
- Testes de tabela com calendários sintéticos; ano de abertura proporcional correto.
- Previsto vs realizado: desvio da renda <= 1 dia presencial por ciclo após calibragem.
- Alerta dispara em 80% e 95% em teste.

## Revisão
Anualmente (janeiro) para atualizar teto e DAS, ou ao migrar para ME.

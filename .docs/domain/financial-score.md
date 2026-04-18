# Financial Score

## Status

- [ ] Draft
- [ ] In Review
- [x] Approved

## Purpose

Formalizar o dominio do score financeiro do Finance Controller, explicando o significado da nota, dos status, dos fatores explicaveis e do papel dos snapshots e do comparativo historico.

## Scope

Este documento cobre:

- o agregado `FinancialScoreSnapshot`
- o resultado derivado `FinancialScoreResult`
- os fatores que compoem a nota em nivel de negocio
- os pesos-base e a normalizacao do score final
- a diferenca entre fatores `weightless` e `neutral`
- a janela historica de 3 meses usada pelo motor atual
- as regras detalhadas de cada fator e dos insights derivados
- o calculo de `previousScore` e `delta`
- os status `CRITICAL`, `ATTENTION`, `GOOD` e `EXCELLENT`
- o papel de `previousScore`, `delta`, `factors` e `insights`
- limites e edge cases conhecidos da implementacao atual

Este documento nao cobre alteracoes de formula, troca de fatores ou propostas de evolucao alem do algoritmo que ja esta implementado.

## Sources of Truth

- Spec:
  - [Docs - Domain Financial Score](../future-features/08-docs-domain-financial-score.md)
  - [Docs - Logic Financial Score Calculation](../future-features/11-docs-logic-financial-score-calculation.md)
- Task:
  - [Phase 16 - Domain Docs: Financial Score](../tasks/phase-16-domain-financial-score.md)
  - [Phase 19 - Logic Docs: Financial Score Calculation](../tasks/phase-19-logic-financial-score-calculation.md)
- ADRs: [ADR-012 Financial Score](../decisions/ADR-012-financial-score.md)
- Code:
  - `prisma/schema.prisma`
  - `src/server/modules/finance/application/score/calculate-score.ts`
  - `src/server/modules/finance/application/score/types.ts`
- APIs:
  - `src/app/api/analytics/score/route.ts`
  - `src/app/api/analytics/score/history/route.ts`

## Business Context

O score existe para sintetizar a saude financeira do usuario em um indicador unico de 0 a 100, sem transformar o produto em caixa preta. Em vez de apenas mostrar varios numeros desconectados, o sistema passa a responder:

- qual e minha situacao financeira geral neste periodo?
- o que mais esta puxando minha nota para baixo?
- estou melhorando ou piorando em relacao ao periodo anterior?

O modulo foi desenhado para ser explicavel. A nota nunca vem sozinha: ela vem acompanhada de fatores, razoes textuais, insights curtos e comparativo historico.

## Core Concepts

| Concept | Description | Notes |
| ------- | ----------- | ----- |
| Financial score | Nota sintetica de saude financeira | Sempre clampada entre `0` e `100` |
| Score factor | Dimensao explicavel que contribui para a nota | Hoje sao 5 fatores principais |
| Weightless factor | Fator que nao participa da nota por ausencia legitima de dominio configurado | Exemplo: nenhum cartao ou nenhuma meta |
| Neutral factor | Fator que participa de forma parcial e conservadora quando nao ha historico suficiente | Evita punicao total ou premio cheio |
| Score insight | Mensagem curta derivada dos fatores | Serve para orientar interpretacao e proxima acao |
| Previous score | Ultima nota persistida anterior ao periodo atual | Base para comparativo temporal |
| Delta | Variacao entre a nota atual e a nota anterior | Pode ser positiva, negativa ou nula |
| Score history | Serie de snapshots persistidos do usuario | Alimenta comparacao historica e futuras leituras temporais |

## Types and Entities

| Item | Kind | Description | Notes |
| ---- | ---- | ----------- | ----- |
| `FinancialScoreSnapshot` | Prisma model | Snapshot persistido da nota por usuario e periodo | `@@unique([userId, periodStart])` |
| `FinancialScoreStatus` | Enum | Faixa qualitativa do score | `CRITICAL`, `ATTENTION`, `GOOD`, `EXCELLENT` |
| `FinancialScoreResult` | Application DTO | Resultado calculado do score | Inclui score, status, fatores, insights, nota anterior e delta |
| `ScoreFactor` | Application type | Componente explicavel da nota | Guarda `key`, `label`, `weight`, `points`, `reason` e opcionalmente `neutral` |
| `ScoreInsight` | Application type | Insight textual curto derivado do score | `tone = positive | warning | negative | info` |
| `ScoreFactorKey` | Union type | Identificador canonico de fator | `savings_rate`, `spend_stability`, `income_consistency`, `credit_card`, `goals` |

## States

| State | Meaning | Entry Condition | Exit Condition |
| ----- | ------- | --------------- | -------------- |
| `CRITICAL` | Saude financeira fragil no periodo | Score abaixo de `40` | Pode subir para `ATTENTION`, `GOOD` ou `EXCELLENT` conforme recalculo |
| `ATTENTION` | Situacao intermediaria com riscos relevantes | Score entre `40` e `59` | Pode cair para `CRITICAL` ou subir para `GOOD`/`EXCELLENT` |
| `GOOD` | Situacao saudavel, mas ainda nao excelente | Score entre `60` e `79` | Pode cair para `ATTENTION` ou subir para `EXCELLENT` |
| `EXCELLENT` | Saude financeira muito forte no periodo | Score `>= 80` | Pode cair nos recalculos seguintes se os fatores piorarem |

## Business Rules

1. O score e calculado sempre no contexto de um unico `userId`.
2. O resultado final e sempre uma nota inteira entre `0` e `100`.
3. O status do score e derivado exclusivamente da faixa numérica final.
4. Transferencias nao participam de nenhum fator do score.
5. O score atual e composto por cinco fatores de negocio:
   - taxa de economia
   - estabilidade de gastos
   - consistencia de renda
   - uso de cartao de credito
   - cumprimento de metas
6. Fatores podem ser `weightless` quando o dominio nao existe para o usuario, em vez de puni-lo artificialmente.
7. Fatores podem ser `neutral` quando existe pouco historico e o produto prefere atribuir um resultado conservador parcial.
8. O fator de cartao de credito considera cartoes ativos, limite agregado, saldo devedor relevante no periodo e presenca de faturas em atraso.
9. O fator de metas reutiliza o progresso das metas ativas, em vez de recalcular outro conceito paralelo.
10. O score sempre devolve fatores e insights explicativos junto da nota.
11. O comparativo com periodo anterior depende da existencia de snapshot anterior persistido.
12. O historico retornado pela superficie de history vem de snapshots persistidos, e nao de recalculo retroativo on-demand.

## Formulas and Calculations

| Name | Formula or Logic | Inputs | Output | Notes |
| ---- | ---------------- | ------ | ------ | ----- |
| Final score | Normalizacao dos pontos obtidos sobre o peso total ativo | `factors.points` e `factors.weight` | `score` | Clampado para `0..100` |
| Status mapping | Faixas numericas do score | Nota final | `FinancialScoreStatus` | `<40`, `40-59`, `60-79`, `>=80` |
| Savings factor | Normaliza a taxa de economia contra meta implicita de 20% | Receita e despesa do periodo | Fator `savings_rate` | Vai de `0/30` a `30/30` |
| Spend stability factor | Compara gasto atual com media dos 3 meses anteriores | Despesa atual e buckets historicos de despesa | Fator `spend_stability` | Full score ate 5% de desvio; zera a partir de 50% |
| Income consistency factor | Usa coeficiente de variacao da renda recente | Buckets historicos de receita com meses ativos | Fator `income_consistency` | Full score ate 10% de CV; zera a partir de 50% |
| Credit card factor | Soma pontos de utilizacao e pagamento | Cartoes ativos, limite, saldo em aberto e overdue | Fator `credit_card` | `10` pts de utilizacao + `5` pts de pagamento |
| Goals factor | Converte progresso medio das metas em pontos de 0 a 20 | Resultado do Goal Engine | Fator `goals` | Pode ser `weightless` se nao houver metas validas |
| Delta | Diferenca entre score atual e ultimo snapshot anterior persistido | `score`, `previousScore` | `delta` | Nao exige que exista snapshot do mes imediatamente anterior |

## Weight Model and Redistribution

| Factor | Base Weight | No-data behavior | Max Points |
| ------ | ----------- | ---------------- | ---------- |
| `savings_rate` | `30` | Continua ativo mesmo sem receita; pontua `0` | `30` |
| `spend_stability` | `20` | Mantem peso e recebe nota `neutral` de 60% sem historico util | `20` |
| `income_consistency` | `15` | Mantem peso e recebe nota `neutral` de 60% com menos de 2 meses ativos | `15` |
| `credit_card` | `15` | Vira `weightless` com `weight = 0` se nao houver cartoes | `15` |
| `goals` | `20` | Vira `weightless` com `weight = 0` se nao houver metas validas | `20` |

O score final e calculado assim:

- `totalWeight = sum(factor.weight)`
- `totalPoints = sum(factor.points)`
- `score = round((totalPoints / totalWeight) * 100)` quando `totalWeight > 0`
- `score = 0` quando todos os fatores ficam weightless
- o valor final ainda passa por `clamp(0, 100)`

Interpretacao operacional:

- fator `weightless` sai do denominador e redistribui o peso automaticamente entre os fatores restantes
- fator `neutral` continua no denominador; ele nao redistribui peso, apenas evita extremos injustos ao atribuir 60% da nota daquele fator
- hoje apenas `credit_card` e `goals` podem ficar weightless; `spend_stability` e `income_consistency` usam neutralidade, nao redistribuicao

## Calculation Inputs

| Input | Source | Filter | Used For | Notes |
| ----- | ------ | ------ | -------- | ----- |
| Period anchors | `resolveMonthPeriod(monthParam, now)` | `monthParam` valido ou fallback para o mes de `now` | `periodStart`, `periodEnd` | O score nao usa `referenceDate` |
| Current transactions | `prisma.transaction.findMany` | `userId`, `type in (INCOME, EXPENSE)`, `date` dentro do periodo inteiro | `currentIncome`, `currentExpense` | Inclui transacoes futuras ja lancadas no mes consultado |
| Historical transactions | `prisma.transaction.findMany` | `userId`, `type in (INCOME, EXPENSE)`, 3 meses completos antes do periodo | Buckets historicos de renda e gasto | Meses sem movimento continuam existindo como bucket `0` |
| Credit cards | `prisma.account.findMany` | `userId`, `type = CREDIT_CARD`, `isArchived = false` | Limite, saldo em aberto, atraso | Statements do periodo e overdue sao carregados juntos |
| Goals progress | `listGoalsWithProgress(userId, monthParam)` | Goals ativos do usuario | `goalSummary` | Falha no Goal Engine faz fallback para lista vazia |
| Previous snapshot | `prisma.financialScoreSnapshot.findFirst` | `userId`, `periodStart < atual`, ordenado desc | `previousScore`, `delta` | Usa o ultimo snapshot anterior persistido |

## Calculation Sequence

1. O sistema resolve o periodo mensal e busca em paralelo transacoes do periodo, historico de 3 meses, cartoes ativos com statements relevantes, progresso de metas e o ultimo snapshot anterior persistido.
2. As transacoes do periodo sao agregadas em `currentIncome` e `currentExpense`.
3. O historico e bucketizado em exatamente 3 meses calendario anteriores, preservando meses vazios com valor zero para renda e despesa.
4. Os cartoes consolidam `totalLimit`, `totalOutstanding` e `overdueCount`.
5. As metas sao resumidas em `count`, `avgPercent` e `atRisk`, considerando apenas metas com `targetAmount > 0`.
6. Os 5 fatores sao montados em ordem fixa: `savings_rate`, `spend_stability`, `income_consistency`, `credit_card`, `goals`.
7. O score final e normalizado pelos pesos ativos, convertido em status, recebe insights derivados e calcula `delta` contra o ultimo snapshot anterior disponivel.

### Fixed Factor Order

O array `factors` sempre sai nesta ordem:

1. `savings_rate`
2. `spend_stability`
3. `income_consistency`
4. `credit_card`
5. `goals`

Mesmo quando um fator fica weightless ou neutral, ele continua presente na colecao para manter explicabilidade e previsibilidade na UI.

## Factor Logic

### `savings_rate`

- Base: `saved = income - expenses`
- Taxa: `rate = saved / income`
- Pontos: `round(clamp(rate / 0.2, 0, 1) * 30)`

Comportamento atual:

- `income <= 0` produz `0/30`
- poupar `20%` ou mais da renda gera nota cheia
- poupar `10%` da renda gera aproximadamente `15/30`
- gasto acima da renda derruba o fator para `0`

### `spend_stability`

- Historico usado: despesas dos 3 meses completos anteriores ao periodo consultado
- Media: `avg = mean(history)`
- Desvio: `deviation = abs(currentExpense - avg) / avg`
- Normalizacao: `1 - clamp((deviation - 0.05) / 0.45, 0, 1)`
- Pontos: `round(20 * normalized)`

Thresholds operacionais:

- desvio de ate `5%` recebe nota cheia
- desvio de `50%` ou mais recebe `0`
- sem historico util (`mean(history) === 0`) o fator retorna `12/20` e `neutral: true`

### `income_consistency`

- Historico usado: receitas dos 3 meses anteriores
- Meses ativos: apenas buckets com `income > 0`
- Precisa de pelo menos 2 meses ativos para medir consistencia
- Coeficiente de variacao: `cv = stddev(activeMonths) / mean(activeMonths)`
- Normalizacao: `1 - clamp((cv - 0.1) / 0.4, 0, 1)`
- Pontos: `round(15 * normalized)`

Thresholds operacionais:

- `cv <= 10%` recebe nota cheia
- `cv >= 50%` recebe `0`
- com menos de 2 meses ativos, o fator retorna `9/15` e `neutral: true`

### `credit_card`

O fator combina duas partes:

- utilizacao do limite: ate `10` pontos
- pagamento em dia: ate `5` pontos

Regras atuais de utilizacao:

| Condition | Utilization Points |
| --------- | ------------------ |
| Nenhum limite configurado (`limit = 0`) | `5` |
| Utilizacao `<= 30%` | `10` |
| Utilizacao `<= 50%` | `7` |
| Utilizacao `<= 80%` | `3` |
| Utilizacao `> 80%` | `0` |

Regras de pagamento:

- `overdueCount > 0` zera os `5` pontos de pagamento
- sem overdue, o usuario recebe `5` pontos

Nuances importantes:

- `cardsCount = 0` produz fator weightless com `weight = 0`, `points = 0` e `neutral: true`
- `totalOutstanding` soma apenas statements nao pagos com `dueDate` dentro do periodo consultado
- `overdueCount` conta qualquer statement `OVERDUE`, mesmo fora da janela do mes atual

### `goals`

- O fator considera apenas metas com `targetAmount > 0`
- `avgPercent` e a media de um percentual derivado por meta, nao o `progressPercent` bruto do Goal Engine
- Pontos finais: `round(20 * clamp(avgPercent / 100, 0, 1))`

Conversao por tipo de meta:

- `SAVING` e `INCOME_TARGET`: usa `actual / target`, clampado em `0..100`
- `EXPENSE_LIMIT` e `ACCOUNT_LIMIT`:
  - `usage >= 100%` vira `0`
  - `usage <= 50%` vira `100`
  - entre `50%` e `100%`, a nota cai linearmente

Nuances importantes:

- `atRisk` conta metas com status `AT_RISK` ou `EXCEEDED`
- o progresso que vira pontos usa `actualAmount`, nao `projectedAmount`
- ao mesmo tempo, o texto do fator reaproveita os status do Goal Engine, que podem considerar projecao no periodo atual
- se `listGoalsWithProgress` falhar, o score trata metas como ausentes e o fator vira weightless

## Status Mapping Logic

| Score | Status |
| ----- | ------ |
| `0..39` | `CRITICAL` |
| `40..59` | `ATTENTION` |
| `60..79` | `GOOD` |
| `80..100` | `EXCELLENT` |

## Insight Generation

Os insights sao derivados apos o calculo dos fatores e seguem esta ordem:

1. Se nao houver nenhum fator ativo (`weight > 0`), o resultado vira uma unica mensagem `info`: `Cadastre transacoes para comecar a pontuar`.
2. Entre os fatores ativos, o motor ordena por `points / weight` para achar o pior e o melhor fator.
3. Se o pior fator estiver abaixo de `50%` da propria nota maxima, entra um insight `negative` com `Fator mais fraco: ...`.
4. Se o melhor fator estiver em `80%` ou mais da propria nota maxima, entra um insight `positive`.
5. Se `savings_rate` ficar abaixo de `50%` do peso, entra um insight `warning` sobre aumentar taxa de economia.
6. Se `credit_card` ficar abaixo de `50%` do peso, entra um insight `warning` sobre reduzir utilizacao ou quitar atrasos.
7. Se `goals` estiver weightless, entra um insight `info` sobre configurar metas.

O array final e truncado para no maximo 4 itens. Quando ha fatores ativos, mas nenhuma regra acima dispara, `insights` pode retornar vazio.

## Delta and Historical Comparison

- `previousScore` vem do snapshot persistido mais recente com `periodStart` anterior ao periodo atual
- o motor nao exige que esse snapshot seja do mes imediatamente anterior; pode existir um gap temporal
- `delta = currentScore - previousScore`
- sem snapshot anterior persistido, `previousScore` e `delta` retornam `null`
- `GET /api/analytics/score` calcula on-demand e nao persiste snapshot
- `GET /api/analytics/score/history` le apenas snapshots persistidos e devolve, por padrao, ate 12 entradas em ordem cronologica crescente

## Invariants

- Todo `FinancialScoreSnapshot` pertence a um unico usuario.
- So pode existir um snapshot por `userId` e `periodStart`.
- O score final nunca sai da faixa `0..100`.
- O status sempre pertence ao enum `CRITICAL`, `ATTENTION`, `GOOD` ou `EXCELLENT`.
- O resultado calculado sempre inclui `factors` em ordem fixa, mesmo que alguns fatores estejam weightless ou neutral.
- O resultado sempre inclui `insights` como colecao; ela pode ser vazia quando nenhuma regra de insight dispara.
- `previousScore` e `delta` podem ser `null` legitimamente quando nao ha historico anterior.
- `factors` e `insights` persistidos em snapshot existem como trilha auditavel do calculo daquele periodo.
- `staleAt` existe como hint de invalidação futura, sem ser obrigatorio na leitura atual.

## Edge Cases

- `monthParam` invalido faz fallback silencioso para o mes atual via `resolveMonthPeriod`.
- Usuario sem cartao de credito nao e punido pelo fator `credit_card`; o fator fica weightless.
- Usuario sem metas ativas nao e punido pelo fator `goals`; o fator fica weightless.
- Usuario sem historico suficiente para estabilidade ou consistencia recebe tratamento `neutral`, nao nota zero.
- Usuario sem receita no periodo pode ter fator de economia com pontuacao zero.
- Se o usuario registrar transacoes futuras dentro do mes consultado, elas entram no score porque o motor usa o periodo inteiro, nao uma `referenceDate`.
- Meses historicos sem movimento contam como buckets `0`, o que pode influenciar estabilidade e consistencia.
- `income_consistency` ignora meses com renda zero ao medir variacao, mas esses meses ainda existem no bucket historico bruto.
- Cartao com limite `0` nao fica weightless; ele recebe metade da subnota de utilizacao (`5`) e ainda pode ganhar ou perder os pontos de pagamento.
- Overdue antigo fora do periodo ainda prejudica o fator de cartao porque entra em `overdueCount`.
- Metas com `targetAmount <= 0` sao descartadas do fator, mesmo que existam no modulo de metas.
- Se nao houver snapshot anterior, `previousScore` e `delta` retornam `null`.
- Como o score usa apenas dados internos do produto, ele nao reflete informacoes externas como Open Finance, salario futuro ou score de bureau.
- O modulo nao usa forecast diretamente como fator; previsao e score sao modulos distintos no estado atual do produto.

## Examples

### Example 1 - Score excelente com fatores consistentes

- Input:
  - boa taxa de economia
  - gastos estaveis
  - renda consistente
  - cartao sob controle
  - metas avancando bem
- Expected result:
  - score alto
  - status `EXCELLENT`
  - insights destacando fatores fortes
- Notes:
  - o usuario ve nao apenas a nota, mas quais fatores sustentam esse resultado

### Example 2 - Score bom sem cartao configurado

- Input:
  - nenhum cartao de credito ativo
  - metas e economia em bom estado
- Expected result:
  - fator `credit_card` weightless
  - usuario nao e punido por nao usar esse modulo
  - nota final depende apenas dos fatores ativos
- Notes:
  - isso evita gamificacao injusta por “falta de configuracao”

### Example 3 - Score em atencao por metas e cartao

- Input:
  - varias metas em risco
  - utilizacao elevada do cartao
  - renda razoavel, mas economia baixa
- Expected result:
  - status `ATTENTION` ou `CRITICAL` dependendo da combinacao final
  - insights com foco em economia e cartao
- Notes:
  - o score serve como sintese, mas continua explicavel pelos fatores

## Operational Notes

- Multi-tenant considerations:
  - toda leitura e persistencia filtram por `userId`
  - snapshots, fatores e insights pertencem ao contexto de um unico usuario
- Snapshot or cache implications:
  - `calculateFinancialScore` calcula on-demand sem persistir
  - `refreshFinancialScoreSnapshot` persiste o resultado do periodo
  - `getFinancialScoreHistory` le snapshots persistidos em ordem temporal
  - `GET /api/analytics/score` nao le de `FinancialScoreSnapshot`; ele sempre recalcula
  - nao existe hoje uma rota publica de recalculate para score, apesar do helper interno `refreshFinancialScoreSnapshot`
  - invalidacoes do modulo `score` ja existem na camada analitica compartilhada para mutacoes de `transaction`, `transfer`, `recurringRule`, `account`, `category`, `creditCardPayment` e `fullRebuild`
- Failure or fallback behavior:
  - se `listGoalsWithProgress` falhar, o modulo trata metas como ausentes e segue o calculo
  - ausencia de cartao ou metas nao gera erro; apenas muda o comportamento dos fatores
  - falta de historico recente nao quebra o modulo; ativa tratamento `neutral`

## Trade-offs and Known Limits

- O motor privilegia explicabilidade e custo baixo: usa heuristicas simples e pesos fixos, nao modelos probabilisticos ou sinais externos.
- O score do mes corrente nao distingue passado de futuro dentro do mesmo periodo; transacoes futuras ja cadastradas influenciam a nota imediatamente.
- A redistribuicao por peso resolve ausencia de dominios opcionais, mas torna comparacoes entre usuarios menos “padronizadas”, porque nem todos estao sendo avaliados sobre o mesmo denominador.
- Os fatores `spend_stability` e `income_consistency` usam apenas 3 meses de historico, o que simplifica a leitura, mas pode amplificar outliers recentes.
- O fator de metas mistura dois sinais: pontos calculados sobre `actualAmount` e contexto textual derivado de status que pode considerar `projectedAmount`.
- `delta` depende de snapshots persistidos; como a rota principal nao persiste, comparativos historicos podem ficar ausentes mesmo quando o calculo on-demand foi consultado antes.

## Related Decisions

- ADR: [ADR-012 Financial Score](../decisions/ADR-012-financial-score.md)

## Open Questions

- Os thresholds e pesos do score devem virar configuracao de produto ou permanecer hardcoded no MVP?
- O produto deve expor historico visual de score na UI alem do delta simples atual?
- Forecast deve ou nao entrar como fator do score em uma fase futura, ou isso tornaria o modelo redundante/menos explicavel?

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
- os status `CRITICAL`, `ATTENTION`, `GOOD` e `EXCELLENT`
- o papel de `previousScore`, `delta`, `factors` e `insights`
- limites e edge cases conhecidos da implementacao atual

Este documento nao cobre a formula detalhada de pesos, thresholds finos e redistribuicao numerica; isso pertence a `phase-19-logic-financial-score-calculation.md`.

## Sources of Truth

- Spec: [Docs - Domain Financial Score](../future-features/08-docs-domain-financial-score.md)
- Task: [Phase 16 - Domain Docs: Financial Score](../tasks/phase-16-domain-financial-score.md)
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
| Savings factor | Avalia quanta renda efetivamente vira economia | Receita e despesa do periodo | Fator `savings_rate` | Fator central do dominio |
| Spend stability factor | Avalia o quanto o gasto atual foge do historico recente | Despesa atual e historico recente | Fator `spend_stability` | Pode ser `neutral` sem historico suficiente |
| Income consistency factor | Avalia regularidade da renda recente | Historico recente de receitas | Fator `income_consistency` | Pode ser `neutral` sem historico suficiente |
| Credit card factor | Avalia utilizacao de limite e situacao de pagamento | Cartoes ativos, limite, saldo em aberto e overdue | Fator `credit_card` | Pode ser `weightless` se nao houver cartao |
| Goals factor | Avalia o progresso medio das metas ativas | Resultado do Goal Engine | Fator `goals` | Pode ser `weightless` se nao houver metas |
| Delta | Diferenca entre score atual e score anterior persistido | `score`, `previousScore` | `delta` | `null` quando nao ha historico |

## Invariants

- Todo `FinancialScoreSnapshot` pertence a um unico usuario.
- So pode existir um snapshot por `userId` e `periodStart`.
- O score final nunca sai da faixa `0..100`.
- O status sempre pertence ao enum `CRITICAL`, `ATTENTION`, `GOOD` ou `EXCELLENT`.
- O resultado calculado sempre inclui `factors` e `insights`, mesmo que alguns fatores estejam weightless.
- `previousScore` e `delta` podem ser `null` legitimamente quando nao ha historico anterior.
- `factors` e `insights` persistidos em snapshot existem como trilha auditavel do calculo daquele periodo.
- `staleAt` existe como hint de invalidação futura, sem ser obrigatorio na leitura atual.

## Edge Cases

- Usuario sem cartao de credito nao e punido pelo fator `credit_card`; o fator fica weightless.
- Usuario sem metas ativas nao e punido pelo fator `goals`; o fator fica weightless.
- Usuario sem historico suficiente para estabilidade ou consistencia recebe tratamento `neutral`, nao nota zero.
- Usuario sem receita no periodo pode ter fator de economia com pontuacao zero.
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
  - invalidacoes do modulo `score` ja existem na camada analitica compartilhada
- Failure or fallback behavior:
  - se `listGoalsWithProgress` falhar, o modulo trata metas como ausentes e segue o calculo
  - ausencia de cartao ou metas nao gera erro; apenas muda o comportamento dos fatores
  - falta de historico recente nao quebra o modulo; ativa tratamento `neutral`

## Related Decisions

- ADR: [ADR-012 Financial Score](../decisions/ADR-012-financial-score.md)

## Open Questions

- Os thresholds e pesos do score devem virar configuracao de produto ou permanecer hardcoded no MVP?
- O produto deve expor historico visual de score na UI alem do delta simples atual?
- Forecast deve ou nao entrar como fator do score em uma fase futura, ou isso tornaria o modelo redundante/menos explicavel?

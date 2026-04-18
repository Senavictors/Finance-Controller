# Insights

## Status

- [ ] Draft
- [ ] In Review
- [x] Approved

## Purpose

Formalizar o dominio de insights automaticos do Finance Controller, explicando o que e um insight, quais severidades e tipos o produto reconhece, como funcionam `fingerprint`, `dismiss` e persistencia, e quais sao os limites operacionais do feed.

## Scope

Este documento cobre:

- o agregado `InsightSnapshot`
- os tipos `InsightCandidate` e `InsightRecord`
- severidades, escopos e CTA dos insights
- regras de dedupe e limite por periodo
- diferenca entre leitura on-demand e snapshot persistido
- comportamento de `dismiss` e de remocao de insights obsoletos

Este documento nao detalha heuristicas linha a linha nem thresholds finos de cada regra; isso pertence a `phase-20-logic-insights-engine.md`.

## Sources of Truth

- Spec: [Docs - Domain Insights](../future-features/09-docs-domain-insights.md)
- Task: [Phase 17 - Domain Docs: Insights](../tasks/phase-17-domain-insights.md)
- ADRs: [ADR-013 Automatic Insights](../decisions/ADR-013-automatic-insights.md)
- Code:
  - `prisma/schema.prisma`
  - `src/server/modules/finance/application/insights/types.ts`
  - `src/server/modules/finance/application/insights/build-metrics.ts`
  - `src/server/modules/finance/application/insights/rules.ts`
  - `src/server/modules/finance/application/insights/use-cases.ts`
- APIs:
  - `src/app/api/analytics/insights/route.ts`
  - `src/app/api/analytics/insights/recalculate/route.ts`
  - `src/app/api/analytics/insights/[id]/dismiss/route.ts`

## Business Context

O modulo de insights existe para transformar sinais dispersos do sistema em observacoes acionaveis e priorizadas. Em vez de obrigar o usuario a interpretar sozinho categorias, forecast, metas e cartoes, o produto passa a responder:

- existe algum comportamento anormal no mes?
- qual problema merece atencao primeiro?
- que acao imediata faz sentido tomar?

O valor do dominio vem de tres caracteristicas:

- determinismo: os insights nascem de regras explicitas, nao de texto gerado sem rastreabilidade
- priorizacao: o feed e limitado e ordenado para evitar ruido
- persistencia: dismiss e identidade do insight sobrevivem a recalculos quando o insight continua valido

## Core Concepts

| Concept | Description | Notes |
| ------- | ----------- | ----- |
| Insight | Observacao automatica sobre um sinal relevante do periodo | Sempre nasce de regra deterministica |
| Insight candidate | Insight ainda em nivel de calculo antes da persistencia | Nao carrega necessariamente `id` persistido |
| Insight record | Insight com identidade persistida e metadados de ciclo de vida | Inclui `id`, `isDismissed`, datas e `createdAt` |
| Fingerprint | Identidade logica do insight dentro do periodo | Base do dedupe e do upsert |
| Severity | Nivel qualitativo de urgencia | `INFO`, `WARNING`, `CRITICAL` |
| Scope | Recorte de contexto que o insight representa | Ex.: categoria, meta, forecast, statement |
| CTA | Acao sugerida pelo insight | Opcional, mas faz parte do valor acionavel do feed |
| Dismiss | Decisao do usuario de dispensar um insight persistido | Precisa de snapshot com `id` |

## Types and Entities

| Item | Kind | Description | Notes |
| ---- | ---- | ----------- | ----- |
| `InsightSnapshot` | Prisma model | Snapshot persistido de insight por usuario/periodo/fingerprint | `@@unique([userId, periodStart, fingerprint])` |
| `InsightSeverity` | Enum | Severidade do insight | `INFO`, `WARNING`, `CRITICAL` |
| `InsightCandidate` | Application type | Insight calculado pelo engine antes da persistencia | Contem `key`, `body`, `payload`, `cta`, `fingerprint`, `priority` |
| `InsightRecord` | Application type | Insight retornado com estado persistido | Estende candidato com `id`, `isDismissed`, `periodStart`, `periodEnd`, `createdAt` |
| `InsightScopeType` | Union type | Tipo de escopo do insight | `global`, `category`, `account`, `goal`, `forecast`, `statement` |
| `InsightCta` | Application type | Acao sugerida pelo insight | `label`, `action`, `href?` |
| `InsightCtaAction` | Union type | Acao canonica do CTA | `open-category`, `open-goals`, `open-forecast`, `open-credit-card` |

## States

| State | Meaning | Entry Condition | Exit Condition |
| ----- | ------- | --------------- | -------------- |
| `INFO` | Insight informativo, com baixa urgencia | Regra relevante sem criticidade alta | Pode subir para `WARNING`/`CRITICAL` se o sinal piorar em recalculos futuros |
| `WARNING` | Insight que requer atencao do usuario | Regra ativa com risco moderado | Pode cair para `INFO`, subir para `CRITICAL` ou desaparecer se o sinal deixar de existir |
| `CRITICAL` | Insight que representa risco forte ou problema imediato | Regra ativa com impacto alto | Pode reduzir de severidade, desaparecer ou permanecer dismissado se o sinal continuar |
| `isDismissed = false` | Insight visivel no feed | Insight persistido ainda nao dispensado | Pode virar `true` por acao do usuario |
| `isDismissed = true` | Insight dispensado pelo usuario | `PATCH dismiss` em snapshot persistido | Pode continuar persistido enquanto o fingerprint existir; deixa de aparecer em leituras que filtram dismiss |

## Business Rules

1. Insights sao deterministas e nascem de regras explicitas do engine, nunca de texto gerado livremente.
2. O modulo opera sempre no contexto de um unico `userId`.
3. O feed atual trabalha com um conjunto MVP de regras sobre categorias, metas, forecast e cartoes.
4. Cada insight precisa ter `key`, `severity`, `scopeType`, `payload`, `fingerprint` e `priority`.
5. O `fingerprint` define a identidade logica do insight no periodo e e a base para dedupe e persistencia.
6. O mesmo fingerprint nao deve gerar dois insights distintos no mesmo periodo; em conflito, prevalece o de maior prioridade.
7. O feed e rigidamente limitado a no maximo `8` insights por periodo apos dedupe e ordenacao.
8. `dismiss` so faz sentido para insights persistidos; por isso o dashboard usa snapshots persistidos no carregamento.
9. Leituras on-demand podem identificar insights validos mesmo sem snapshot; nesses casos o insight pode nao ter `id` persistido.
10. Ao recalcular snapshots, insights obsoletos nao dispensados sao removidos do banco; insights obsoletos ja dispensados nao entram nesse delete.
11. Quando um insight recalculado ja existia, o modulo preserva o estado de `isDismissed` e reutiliza o mesmo snapshot via upsert.
12. O feed exposto ao usuario final filtra insights dismissados antes de renderizar.

## Formulas and Calculations

| Name | Formula or Logic | Inputs | Output | Notes |
| ---- | ---------------- | ------ | ------ | ----- |
| Fingerprint | Composicao deterministica de partes relevantes (`key`, `scopeId`, etc.) | Identidade logica do insight | `fingerprint` | Permite dedupe e upsert consistente |
| Dedupe | Mantem o insight de maior prioridade por fingerprint | Lista de candidatos | Lista unica por fingerprint | Ordenado por prioridade descendente |
| Feed cap | Corte rigido apos dedupe | Lista ordenada | Maximo de `8` insights | Controle anti-ruido do dominio |
| Persisted refresh | Upsert de candidatos do periodo + limpeza seletiva de obsoletos | Candidatos, snapshots existentes | `InsightRecord[]` | Preserva `isDismissed` existente |
| Visible feed | Filtragem de insights dismissados | Insights calculados ou persistidos | Lista mostrada ao usuario | A API `GET` remove dismissados da resposta |

## Invariants

- Todo `InsightSnapshot` pertence a um unico usuario.
- So pode existir um snapshot por `userId`, `periodStart` e `fingerprint`.
- Todo insight do dominio tem severidade valida do enum `INFO`, `WARNING` ou `CRITICAL`.
- Todo insight persistido carrega `payload` estruturado; CTA e opcional.
- `priority` existe para ordenar o feed e resolver conflitos de dedupe.
- O feed final do periodo nunca deve ultrapassar 8 itens.
- Um insight dismissado nao deve reaparecer como “novo” se o mesmo fingerprint continuar valido no mesmo periodo.

## Edge Cases

- Leituras on-demand via `listInsights` podem devolver insights sem `id` persistido; nesses casos o widget nao consegue enviar dismiss ao backend.
- Como o dashboard chama `refreshInsightSnapshots` no carregamento, ele normaliza essa situacao e garante IDs persistidos para o fluxo principal de dismiss.
- Insights com mesmo fingerprint mas textos/prioridades diferentes no mesmo recalculo colapsam em um unico item.
- Insights obsoletos ja dismissados nao entram no delete seletivo atual; isso preserva historico de dismiss no periodo.
- Um insight pode mudar de severidade entre recalculos e continuar sendo o “mesmo” insight se o fingerprint permanecer igual.
- O modulo pode ficar silencioso mesmo com dados existentes, se nenhuma regra atingir os thresholds necessarios.

## Examples

### Example 1 - Insight de meta em risco

- Input:
  - uma meta com status `AT_RISK`
  - `goalId` conhecido
- Expected result:
  - insight com `key = goal_at_risk`
  - `scopeType = goal`
  - fingerprint estavel baseado na meta
  - CTA para abrir `/goals`
- Notes:
  - se a mesma meta continuar em risco no proximo recalculo do mesmo periodo, o insight deve ser atualizado, nao duplicado

### Example 2 - Insight dismissado e recalculado

- Input:
  - insight persistido com `isDismissed = true`
  - regra continua emitindo o mesmo fingerprint
- Expected result:
  - insight continua reconhecido como o mesmo item
  - dismiss permanece preservado
- Notes:
  - isso evita que o feed “ressuscite” o mesmo insight toda vez

### Example 3 - Feed com muitos candidatos

- Input:
  - varias categorias disparando regras
  - metas em risco
  - forecast negativo
  - faturas vencendo
- Expected result:
  - candidatos passam por dedupe
  - ordenacao por prioridade
  - corte final em no maximo 8 insights
- Notes:
  - o dominio privilegia relevancia sobre exaustividade

## Operational Notes

- Multi-tenant considerations:
  - todas as leituras e mutacoes filtram por `userId`
  - dismiss falha se o `insightId` nao pertencer ao usuario
- Snapshot or cache implications:
  - `refreshInsightSnapshots` persiste insights e e o fluxo usado pelo dashboard
  - `listInsights` calcula on-demand e reconcilia, quando possivel, com snapshots existentes do periodo
  - o modulo `insights` ja participa da estrategia de invalidacao da camada analitica
- Failure or fallback behavior:
  - falha em `dismiss` para insight inexistente retorna erro de dominio `Insight nao encontrado`
  - se metas falharem na coleta, o engine trata esse trecho como lista vazia e continua o pipeline
  - ausencia de sinais relevantes nao e erro; apenas resulta em feed vazio

## Related Decisions

- ADR: [ADR-013 Automatic Insights](../decisions/ADR-013-automatic-insights.md)

## Open Questions

- Insights dismissados e obsoletos devem continuar persistidos indefinidamente no periodo, ou o produto deve limpar esse historico em algum momento?
- O cap de 8 insights por periodo deve virar configuracao por usuario ou permanecer fixo no produto?
- O produto deve expor historico de insights dismissados/obsoletos no futuro, ou manter apenas o feed visivel do periodo?

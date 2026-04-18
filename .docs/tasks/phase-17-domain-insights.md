# Task: Phase 17 - Domain Docs: Insights

## Status

- [x] Todo
- [ ] In Progress
- [ ] Done

## Context

Executa a spec [Docs - Domain Insights](../future-features/09-docs-domain-insights.md), fechando a primeira etapa de documentacao de dominio do backlog atual.

Depende da foundation da fase 13, do [Automatic Insights](../future-features/04-automatic-insights.md) e do [ADR-013](../decisions/ADR-013-automatic-insights.md).

## Objective

Criar `.docs/domain/insights.md` para formalizar tipos de insight, severidade, fingerprint, dismiss e persistencia em nivel de negocio.

## Scope

- Definir o conceito de insight automatico
- Documentar severidade e tipos em alto nivel
- Registrar regras de dedupe e dismiss
- Explicar o papel do periodo e do fingerprint
- Cobrir limites operacionais e edge cases

## Out of Scope

- Descrever heuristicas linha a linha
- Contrato HTTP da API de insights
- Alteracoes no motor atual

## Decisions

- O documento deve diferenciar claramente regra de negocio e heuristica tecnica
- Mudanca em severidade, cap ou comportamento de dedupe pode exigir ADR

## Contracts

- Output: `.docs/domain/insights.md`
- Template: `.docs/domain/_TEMPLATE.md`
- Referencias minimas: `ADR-013`, `prisma/schema.prisma`, `src/server/modules/finance/application/insights/`, `src/app/api/analytics/insights/`

## Migrations

- Nenhuma

## UI

- Nenhuma

## Tests

- Revisao manual contra enums, snapshots e engine atual
- Validacao de terminologia de severidade e dismiss

## Checklist

- [ ] Documento criado em `.docs/domain/insights.md`
- [ ] Conteudo validado contra codigo real
- [ ] `.docs/CONTEXT.md` updated
- [ ] `.docs/CHANGELOG.md` updated
- [ ] ADR created/updated (if applicable)
- [ ] Manual validation done

## Notes for AI (next step)

Depois da fase 17, iniciar os deep dives de logica nas fases 18, 19 e 20.

# Task: Phase 14 - Domain Docs: Goals

## Status

- [x] Todo
- [ ] In Progress
- [ ] Done

## Context

Executa a spec [Docs - Domain Goals](../future-features/06-docs-domain-goals.md) e inaugura a fase de documentacao de dominio do sistema.

Depende da [Phase 13 - Docs Foundation](phase-13-docs-foundation.md), do [Goal Engine](../future-features/01-goal-engine.md) e do [ADR-010](../decisions/ADR-010-goal-engine.md).

## Objective

Criar `.docs/domain/goals.md` com a definicao de negocio do modulo de metas, usando o template de dominio e refletindo o comportamento implementado hoje no codigo.

## Scope

- Documentar conceitos centrais de metas e snapshots
- Formalizar metricas, escopos, periodos e status
- Registrar regras de ownership, multi-tenant e invariantes
- Explicar como metas se relacionam com categorias, contas e cartao de credito
- Incluir exemplos e edge cases

## Out of Scope

- Deep dive da formula de projecao
- Contrato HTTP detalhado
- Mudanca de algoritmo ou de schema

## Decisions

- Se houver divergencia entre spec antiga e implementacao real, a documentacao deve refletir primeiro o comportamento atual
- Se a divergencia revelar uma nova regra de negocio, abrir ADR antes de “corrigir na doc”

## Contracts

- Output: `.docs/domain/goals.md`
- Template: `.docs/domain/_TEMPLATE.md`
- Referencias minimas: `ADR-010`, `prisma/schema.prisma`, `src/server/modules/finance/application/goals/`, `src/app/api/goals/`

## Migrations

- Nenhuma

## UI

- Nenhuma

## Tests

- Revisao manual contra o schema, ADR e use cases atuais
- Verificacao de que os termos usados em doc batem com enums e estados do produto

## Checklist

- [ ] Documento criado em `.docs/domain/goals.md`
- [ ] Conteudo validado contra codigo real
- [ ] `.docs/CONTEXT.md` updated
- [ ] `.docs/CHANGELOG.md` updated
- [ ] ADR created/updated (if applicable)
- [ ] Manual validation done

## Notes for AI (next step)

Use `.docs/domain/_TEMPLATE.md` sem pular secoes. Ao terminar, a proxima task recomendada e `phase-15-domain-forecast.md`.

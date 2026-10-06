---
id: LEGACY-phase-24-data-dictionary
title: "Phase 24 - Data Docs: Data Dictionary"
status: completed
type: legacy
phase: fc-1.x
owner: fc-1.x
created_at: 2026-04-17
updated_at: 2026-10-05
affected_modules: []
related_use_cases: []
related_adrs: []
---

# Task: Phase 24 - Data Docs: Data Dictionary

## Status

- [ ] Todo
- [ ] In Progress
- [x] Done

## Context

Executa a spec [Docs - Data Dictionary](../../../docs/roadmap/legado/future-features/16-docs-data-dictionary.md) para criar o primeiro dicionario de dados oficial do sistema.

Esta task deve consolidar o significado dos models atuais sem redesenhar o banco.

## Objective

Criar `.docs/data/data-dictionary.md` documentando modelos, campos, relacionamentos, ownership, snapshots e regras de integridade do schema Prisma.

## Scope

- Todos os models atuais do Prisma
- Campos e semantica de negocio
- Relacionamentos e ownership
- Multi-tenant por `userId`
- Modelos de snapshot e ciclo de vida

## Out of Scope

- Refactor de schema
- Normalizacao adicional
- Diagramas arquiteturais profundos

## Decisions

- O documento deve representar o schema atual, mesmo quando houver divida tecnica conhecida
- Ambiguidades entre nome tecnico e nome de negocio devem ser resolvidas com nota explicativa, nao com rebatismo informal

## Contracts

- Output: `.docs/data/data-dictionary.md`
- Template: `.docs/data/_TEMPLATE.md`
- Referencias minimas: `prisma/schema.prisma`, `src/server/modules/finance/infra/`

## Migrations

- Nenhuma

## UI

- Nenhuma

## Tests

- Revisao manual model a model
- Validacao de campos, nullability, defaults e relacoes

## Checklist

- [x] Documento criado em `.docs/data/data-dictionary.md`
- [x] Schema revisado integralmente
- [x] `.docs/CONTEXT.md` updated
- [x] `.docs/CHANGELOG.md` updated
- [ ] ADR created/updated (if applicable)
- [x] Manual validation done

## Notes for AI (next step)

Se o documento ficar grande demais, manter uma versao unica inicialmente e so depois considerar split por modulos.

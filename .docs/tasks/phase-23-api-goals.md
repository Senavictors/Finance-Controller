# Task: Phase 23 - API Docs: Goals

## Status

- [ ] Todo
- [ ] In Progress
- [x] Done

## Context

Executa a spec [Docs - API Goals](../future-features/15-docs-api-goals.md), cobrindo a superficie HTTP real do modulo de metas.

Hoje o projeto expoe `GET/POST /api/goals` e `PATCH/DELETE /api/goals/[id]`.

## Objective

Criar `.docs/api/goals.md` com os contratos da API de metas, incluindo payloads, respostas, validacoes e ownership.

## Scope

- Listagem de metas
- Criacao de meta
- Atualizacao de meta
- Remocao de meta
- Regras de validacao e ownership

## Out of Scope

- Endpoints nao implementados
- Documentacao de calculo interno de progresso
- Mudanca de contrato atual

## Decisions

- A documentacao deve se limitar aos endpoints existentes hoje
- Se houver endpoints planejados mas nao implementados, registrar em observacoes, nao como contrato oficial

## Contracts

- Output: `.docs/api/goals.md`
- Template: `.docs/api/_TEMPLATE.md`
- Referencias minimas: `src/app/api/goals/route.ts`, `src/app/api/goals/[id]/route.ts`

## Migrations

- Nenhuma

## UI

- Nenhuma

## Tests

- Revisao manual de handlers, schemas e respostas
- Validacao das regras de erro e ownership

## Checklist

- [x] Documento criado em `.docs/api/goals.md`
- [x] Endpoints validados contra codigo real
- [x] `.docs/CONTEXT.md` updated
- [x] `.docs/CHANGELOG.md` updated
- [ ] ADR created/updated (if applicable)
- [x] Manual validation done

## Notes for AI (next step)

Deixe explicito quando alguma regra de negocio vem do dominio de metas e nao da camada HTTP.

# Task: Phase 25 - Architecture Docs: Flows

## Status

- [x] Todo
- [ ] In Progress
- [ ] Done

## Context

Executa a spec [Docs - Architecture Flows](../future-features/17-docs-architecture-flows.md) quando dominio, API e dados ja estiverem minimamente documentados.

Esta task inaugura os deep dives dentro de `.docs/architecture/`.

## Objective

Criar `.docs/architecture/flows.md` documentando os fluxos criticos do sistema de ponta a ponta entre UI, API, application, domain e infra.

## Scope

- Criacao de transacao
- Transferencia entre contas
- Aplicacao de recorrencias
- Calculo analitico e snapshots
- Billing de cartao e pagamento de fatura

## Out of Scope

- Diagramas de sequencia detalhados
- Runbooks operacionais de deploy
- Refactor de arquitetura

## Decisions

- O foco deve ser o fluxo real implementado, e nao a arquitetura idealizada
- Sempre sinalizar trechos onde a implementacao atual ainda concentra logica em `route.ts` ou pages

## Contracts

- Output: `.docs/architecture/flows.md`
- Template: `.docs/architecture/_TEMPLATE.md`
- Referencias minimas: `.docs/architecture/README.md`, `src/app/api/**/route.ts`, `src/server/modules/finance/**`

## Migrations

- Nenhuma

## UI

- Nenhuma

## Tests

- Revisao manual de cada fluxo escolhido
- Conferencia das camadas e componentes citados

## Checklist

- [ ] Documento criado em `.docs/architecture/flows.md`
- [ ] Fluxos validados contra codigo real
- [ ] `.docs/CONTEXT.md` updated
- [ ] `.docs/CHANGELOG.md` updated
- [ ] ADR created/updated (if applicable)
- [ ] Manual validation done

## Notes for AI (next step)

Nao transformar isso em README repetido. Este documento precisa mostrar traversal real entre camadas e gargalos atuais.

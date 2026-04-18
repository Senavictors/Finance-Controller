# Task: Phase 21 - API Docs: Transactions

## Status

- [x] Todo
- [ ] In Progress
- [ ] Done

## Context

Executa a spec [Docs - API Transactions](../future-features/13-docs-api-transactions.md) para formalizar a superficie HTTP de transacoes.

Deve cobrir apenas rotas reais do projeto: `transactions`, `transactions/[id]` e `transactions/transfer`.

## Objective

Criar `.docs/api/transactions.md` com endpoints, payloads, filtros, respostas, erros e efeitos colaterais do modulo de transacoes.

## Scope

- `GET /api/transactions`
- `POST /api/transactions`
- `PATCH /api/transactions/[id]`
- `DELETE /api/transactions/[id]`
- `POST /api/transactions/transfer`
- Filtros, busca, paginacao e ownership

## Out of Scope

- Outros modulos de API
- Criacao de novos endpoints
- Refactor de comportamento

## Decisions

- A documentacao deve refletir rotas existentes e payloads reais
- Campos legados ou nao usados devem ser explicitamente evitados

## Contracts

- Output: `.docs/api/transactions.md`
- Template: `.docs/api/_TEMPLATE.md`
- Referencias minimas: `src/app/api/transactions/route.ts`, `src/app/api/transactions/[id]/route.ts`, `src/app/api/transactions/transfer/route.ts`

## Migrations

- Nenhuma

## UI

- Nenhuma

## Tests

- Revisao manual de request/response no codigo
- Validacao de erros e filtros documentados

## Checklist

- [ ] Documento criado em `.docs/api/transactions.md`
- [ ] Endpoints validados contra codigo real
- [ ] `.docs/CONTEXT.md` updated
- [ ] `.docs/CHANGELOG.md` updated
- [ ] ADR created/updated (if applicable)
- [ ] Manual validation done

## Notes for AI (next step)

Cobrir transferencia como contrato proprio dentro do mesmo documento, destacando o efeito atomico do par de transacoes.

# Task: Phase 16 - Domain Docs: Financial Score

## Status

- [x] Todo
- [ ] In Progress
- [ ] Done

## Context

Executa a spec [Docs - Domain Financial Score](../future-features/08-docs-domain-financial-score.md), consolidando o entendimento de negocio do score financeiro.

Depende da foundation da fase 13, do [Financial Score](../future-features/03-financial-score.md) e do [ADR-012](../decisions/ADR-012-financial-score.md).

## Objective

Criar `.docs/domain/financial-score.md` documentando significado, fatores, status e papel do score dentro do produto.

## Scope

- Definir o conceito de score financeiro no sistema
- Registrar fatores explicaveis em nivel de dominio
- Formalizar status e interpretacao para negocio
- Explicar snapshots e comparacao temporal
- Incluir exemplos e limites conhecidos

## Out of Scope

- Pesos detalhados e redistribuicao numerica
- Contrato HTTP do modulo
- Refactor do motor de score

## Decisions

- A doc de dominio deve explicar “o que o score significa” e nao “como cada ponto e calculado”
- Caso haja ambiguidade de status ou faixas, validar no codigo antes de registrar

## Contracts

- Output: `.docs/domain/financial-score.md`
- Template: `.docs/domain/_TEMPLATE.md`
- Referencias minimas: `ADR-012`, `prisma/schema.prisma`, `src/server/modules/finance/application/score/`, `src/app/api/analytics/score/`

## Migrations

- Nenhuma

## UI

- Nenhuma

## Tests

- Revisao manual contra snapshot e use cases do score
- Verificacao dos nomes de fatores e status contra implementacao real

## Checklist

- [ ] Documento criado em `.docs/domain/financial-score.md`
- [ ] Conteudo validado contra codigo real
- [ ] `.docs/CONTEXT.md` updated
- [ ] `.docs/CHANGELOG.md` updated
- [ ] ADR created/updated (if applicable)
- [ ] Manual validation done

## Notes for AI (next step)

O detalhamento de fatores, pesos e redistribuicao fica para `phase-19-logic-financial-score-calculation.md`.

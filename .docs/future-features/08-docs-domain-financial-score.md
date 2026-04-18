# Docs - Domain Financial Score

## Objetivo

Formalizar o dominio do score financeiro, explicando o significado do score, seus status, fatores e invariantes de negocio.

## Dependencia

- [Documentation Foundation](05-docs-foundation.md)
- [Financial Score](03-financial-score.md)
- [ADR-012 Financial Score](../decisions/ADR-012-financial-score.md)

## Fontes relevantes

- `prisma/schema.prisma`
- `src/server/modules/finance/application/score/`
- `src/app/api/analytics/score/`

## Output esperado

- `.docs/domain/financial-score.md`

## Conteudo minimo

- Conceito e objetivo do score
- Fatores que compoem o score
- Status possiveis e significado
- Relacao com snapshots e comparacao historica
- Limites e interpretacao para o usuario

## Fora de escopo

- Formula detalhada de pesos e redistribuicao
- Contrato HTTP detalhado

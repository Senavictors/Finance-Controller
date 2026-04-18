# [API Surface]

> Use este template para qualquer documento em `.docs/api/`.
> Regra: nenhum arquivo desta camada deve ser criado fora deste padrao.
> Naming: use `kebab-case` por superficie de contrato, por exemplo `transactions.md` ou `analytics.md`.

## Status

- [ ] Draft
- [ ] In Review
- [ ] Approved

## Purpose

[Qual modulo, recurso ou conjunto de endpoints este documento cobre.]

## Scope

[Quais rotas, contratos, validacoes e efeitos colaterais entram neste documento.]

## Sources of Truth

- Spec:
- Task:
- ADRs:
- Code:

## Module Summary

| Endpoint | Method | Purpose | Auth | Notes |
| -------- | ------ | ------- | ---- | ----- |
|          |        |         |      |       |

## Authentication and Authorization

- Session requirement:
- Roles or ownership rules:
- Multi-tenant filters:

## Common Rules

- Validation:
- Idempotency:
- Pagination or filtering:
- Cache or invalidation:

## Endpoints

### [METHOD] /api/[resource]

#### Purpose

[O que a rota faz.]

#### Request

| Field | Type | Required | Description | Validation |
| ----- | ---- | -------- | ----------- | ---------- |
|       |      |          |             |            |

#### Response

```json
{
  "example": true
}
```

#### Errors

| Status | Condition | Body Shape |
| ------ | --------- | ---------- |
|        |           |            |

#### Side Effects

- 

#### Notes

- 

## Observability and Debugging

- Relevant logs:
- Metrics or traces:
- Failure signatures:

## Related Decisions

- ADR:

## Open Questions

- 

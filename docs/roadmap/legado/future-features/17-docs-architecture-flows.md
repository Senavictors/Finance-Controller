# Docs - Architecture Flows

## Objetivo

Documentar os fluxos criticos da arquitetura do sistema, conectando UI, API, application, domain e infra.

## Dependencia

- [Documentation Foundation](05-docs-foundation.md)
- Domain, logic, API e data docs em estado minimamente estavel

## Fontes relevantes

- `.docs/architecture/README.md`
- `src/app/api/**/route.ts`
- `src/server/modules/finance/**`

## Output esperado

- `.docs/architecture/flows.md`

## Conteudo minimo

- Fluxo de criacao de transacao
- Fluxo de transferencia
- Fluxo de recorrencias
- Fluxo de analytics e snapshots
- Fluxo de billing/cartao e pagamentos

## Fora de escopo

- Diagramas de sequencia detalhados
- Runbooks operacionais

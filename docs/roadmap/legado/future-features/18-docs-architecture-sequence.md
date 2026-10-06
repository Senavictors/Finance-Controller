# Docs - Architecture Sequence

## Objetivo

Criar diagramas e narrativas de sequencia para os principais cenarios do sistema, com foco em rastreabilidade entre camadas.

## Dependencia

- [Docs - Architecture Flows](17-docs-architecture-flows.md)
- Camadas de dominio, API e dados documentadas

## Fontes relevantes

- `.docs/architecture/README.md`
- `.docs/architecture/flows.md`
- `src/app/api/**/route.ts`
- `src/server/modules/finance/**`

## Output esperado

- `.docs/architecture/sequence.md`

## Conteudo minimo

- Diagramas Mermaid de fluxos criticos
- Sequencias com atores, use cases e repositorios
- Tratamento de erro e pontos de invalidacao

## Fora de escopo

- Diagramas visuais decorativos
- Mudancas na implementacao

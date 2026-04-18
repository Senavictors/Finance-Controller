# Docs - Data Dictionary

## Objetivo

Criar o dicionario de dados inicial do sistema, explicando a semantica dos modelos atuais, seus campos, relacoes e regras de integridade.

## Dependencia

- [Documentation Foundation](05-docs-foundation.md)
- Consistencia previa das docs de dominio e API

## Fontes relevantes

- `prisma/schema.prisma`
- Repositorios Prisma em `src/server/modules/finance/infra/`

## Output esperado

- `.docs/data/data-dictionary.md`

## Conteudo minimo

- Todos os models atuais do Prisma
- Campos e significados
- Relacionamentos e ownership
- Regras de multi-tenant
- Modelos de snapshot e ciclo de vida

## Fora de escopo

- Redesenho do schema
- Diagramas de arquitetura

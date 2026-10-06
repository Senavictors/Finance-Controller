# Módulos

Responsabilidade, localização, dependências e invariantes por módulo de `src/server/modules/<modulo>/`. Visão geral e tabela de módulos em [`../architecture/components.md`](../architecture/components.md); regras de dependência em [`../architecture/dependencies.md`](../architecture/dependencies.md).

## Módulos do 2.0

`ledger`, `accounts`, `cards`, `recurring`, `budget`, `debts`, `income`, `capture`, `merchants`, `rules`, `imports`, `ai`, `telegram`, `tools`, `goals`, `reports`, `auth`.

## Planejados do 2.0 (nascem sob demanda)

Um arquivo por módulo (`ledger.md`, `cards.md`, ...), criado pela primeira task que o implementa, usando o template abaixo.

## Template por módulo

```markdown
---
estado: planejado | real | divergente
fonte: caminho do código do módulo
ultima-revisao: task ou data
---

# Módulo Nome

## Responsabilidade
## Localização
- Backend: src/server/modules/nome
- Frontend: src/app/(app)/... e src/components/fc/...

## Conceitos principais
## Dependências
### Depende de
### É usado por

## Interfaces públicas
## Invariantes
## Modos de falha
## Testes
## Decisões relacionadas
```

## Legado 1.x (referência)

No 1.x existe um único módulo, `src/server/modules/finance/`, cuja documentação é o conjunto de docs legados listados em [`../domain/README.md`](../domain/README.md) e [`../api/README.md`](../api/README.md).

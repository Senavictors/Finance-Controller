# Task: Phase 13 - Docs Foundation

## Status

- [ ] Todo
- [ ] In Progress
- [x] Done

## Context

O projeto chegou a um ponto em que a documentacao precisa evoluir para nivel de SaaS real, sem abandonar o fluxo atual baseado em:

- criacao de task: `future-features -> tasks -> CONTEXT -> README`
- conclusao de task: `execucao -> CONTEXT -> README -> CHANGELOG`

Esta task executa a spec [Documentation Foundation](../future-features/05-docs-foundation.md) e prepara a base para as proximas fases de domain docs, business logic deep dive, API docs, data docs e architecture deep dive.

## Objective

Criar a estrutura inicial da nova camada de documentacao e os templates obrigatorios que servirao como ponto de partida para todos os proximos documentos dessas categorias.

## Scope

- Criar as pastas `.docs/domain`, `.docs/api`, `.docs/data` e `.docs/architecture`
- Criar `_TEMPLATE.md` em cada uma dessas camadas
- Migrar o overview arquitetural existente para `.docs/architecture/README.md`
- Atualizar referencias internas e documentacao viva do projeto
- Registrar a fundacao da fase em `CONTEXT`, `CHANGELOG` e `README`

## Out of Scope

- Preencher `goals.md`, `forecast.md`, `financial-score.md` ou `insights.md`
- Documentar endpoints existentes
- Produzir o dicionario de dados completo
- Criar novos ADRs apenas para existir a fundacao documental

## Decisions

- A pasta `.docs/architecture/` substitui o namespace anteriormente ocupado por `.docs/architecture.md`
- O arquivo antigo passa a viver como `.docs/architecture/README.md`, preservando o papel de overview
- Novas camadas documentais passam a exigir uso de templates obrigatorios

## Contracts

- `domain/`: conceitos, regras, estados, formulas e invariantes do negocio
- `api/`: contratos HTTP, requests, responses, erros e efeitos colaterais
- `data/`: semantica de modelos, campos, relacoes, integridade e ciclo de vida
- `architecture/`: fluxos, sequencias, integracoes entre camadas e pontos operacionais

## Migrations

- Nenhuma migracao de banco

## UI

- Sem mudancas de interface

## Tests

- Validacao manual da estrutura criada em `.docs/`
- Revisao de consistencia dos links internos atualizados

## Checklist

- [x] Code implemented
- [x] Tests passing (not applicable for docs-only scope)
- [x] `.docs/CONTEXT.md` updated
- [x] `README.md` updated
- [x] ADR created/updated (not applicable for this task)
- [x] Manual validation done

## Notes for AI (next step)

A proxima fase deve comecar por `domain/`, priorizando `goals`, `forecast`, `financial-score` e `insights`.

Antes de criar cada documento:

1. abrir uma spec em `future-features/`
2. converter em task
3. usar o template correto da camada
4. atualizar `CONTEXT` e `README` ao colocar a task no backlog
5. ao concluir, atualizar `CONTEXT`, `README` e `CHANGELOG`

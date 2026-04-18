# Documentation Foundation

## Objetivo

Criar a fundacao da nova camada de documentacao do Finance Controller, preparando o projeto para evoluir docs em nivel de SaaS real sem quebrar o fluxo ja adotado em `.docs/`.

## Dependencia

Depende do fluxo atual do projeto:

- `future-features -> tasks -> execucao -> CONTEXT -> CHANGELOG`
- [CONTEXT](../CONTEXT.md)
- [Task Template](../tasks/_TEMPLATE.md)

## Leitura do sistema atual

- O projeto ja possui uma base documental forte em `.docs/`, com `CONTEXT`, `CHANGELOG`, ADRs e tasks.
- As features mais importantes do produto ja estao descritas em `future-features/` e convertidas em tasks por fase.
- O repositorio ja possui um overview arquitetural em `.docs/architecture.md`, mas ainda nao existe uma estrutura separada para documentar dominio, contratos de API, semantica de dados e fluxos arquiteturais profundos.
- O plano registrado em `.docs/docs-arquitetura.md` propoe essa evolucao, mas a implementacao precisa respeitar a realidade atual do repositorio.

## Recomendacao arquitetural

A fundacao da documentacao deve nascer como uma fase formal do projeto, e nao como criacao ad-hoc de arquivos soltos.

Ordem recomendada:

1. Criar a spec da foundation.
2. Converter a spec em task.
3. Criar a estrutura de pastas e templates obrigatorios.
4. Atualizar os artefatos vivos do projeto (`CONTEXT`, `CHANGELOG` e `README`).
5. A partir dessa base, abrir as proximas fases: domain, business logic, API, data e architecture deep dive.

## Estrutura recomendada

```text
.docs/
  domain/
    _TEMPLATE.md
  api/
    _TEMPLATE.md
  data/
    _TEMPLATE.md
  architecture/
    README.md
    _TEMPLATE.md
```

## Decisao importante para o contexto atual

Ja existe o arquivo `.docs/architecture.md`, o que entra em conflito com a criacao da pasta `.docs/architecture/`.

Para liberar a nova namespace sem perder a documentacao atual:

- migrar o overview existente para `.docs/architecture/README.md`
- atualizar referencias que apontavam para `.docs/architecture.md`
- reservar a pasta `architecture/` para os proximos deep dives

## Convencoes de nomenclatura

- `domain/`: arquivos por capacidade de negocio em `kebab-case`
  - exemplos: `goals.md`, `forecast.md`, `financial-score.md`, `insights.md`
- `api/`: arquivos por superficie de contrato
  - exemplos: `transactions.md`, `analytics.md`, `goals.md`
- `data/`: arquivos por dicionario ou agregado persistente
  - exemplos: `data-dictionary.md`, `analytics-snapshots.md`
- `architecture/`: arquivos por fluxo ou visao tecnica
  - exemplos: `flows.md`, `sequence.md`, `credit-card-billing.md`

## Regras obrigatorias

- Nenhum novo documento dessas camadas deve ser criado sem partir do template correspondente.
- Todo documento deve referenciar sua origem:
  - spec
  - task
  - ADRs relacionados
  - codigo fonte relevante
- Mudanca de regra, algoritmo ou estrutura continua exigindo ADR quando aplicavel.

## Output esperado desta fase

- Nova estrutura documental criada
- Templates base para `domain`, `api`, `data` e `architecture`
- Overview arquitetural migrado para a nova pasta
- Projeto pronto para iniciar a fase de domain documentation

## Fora de escopo

- Preencher documentos reais de dominio
- Documentar endpoints existentes um a um
- Criar dicionario de dados completo
- Produzir diagramas de sequencia finais

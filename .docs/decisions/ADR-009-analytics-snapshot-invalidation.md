# ADR-009: Estrategia Inicial de Snapshot e Invalidacao de Analytics

## Status

Accepted

## Context

As proximas features planejadas do Finance Controller dependem de leitura analitica reaproveitavel e coerente:

- Goal Engine
- Forecast Engine
- Score Financeiro
- Insights Automaticos

Depois da extracao do analytics core e da modelagem de billing de cartao, o sistema ainda precisava de uma base para cache e invalidação. Sem isso, novas features tenderiam a:

- recalcular tudo a cada leitura
- espalhar convencoes diferentes de cache por modulo
- ficar sujeitas a inconsistencias apos mutacoes de transacao, conta, categoria ou recorrencia

O projeto tambem precisava de uma estrategia inicial que funcionasse agora, sem exigir uma tabela final de snapshots antes da hora.

## Decision

Foi adotada uma estrategia inicial baseada em tags de snapshot por escopo.

- Todo snapshot analitico passa a ser identificado por:
  - raiz global `analytics`
  - escopo de usuario
  - modulo analitico
  - mes afetado, quando houver periodo explicito
  - entidades afetadas, quando houver vinculo direto com conta, categoria ou fatura

- Os modulos padronizados nesta fase sao:
  - `summary`
  - `goals`
  - `forecast`
  - `score`
  - `insights`
  - `credit-card`

- Mutacoes relevantes passam a chamar `invalidateAnalyticsSnapshots(context)` com contexto minimo suficiente para revalidar:
  - usuario
  - modulos afetados
  - meses afetados
  - contas afetadas
  - categorias afetadas
  - faturas afetadas

- O primeiro snapshot cacheavel implementado de fato nesta fase e o resumo mensal da API `GET /api/analytics/summary`, usando um DTO serializavel e tags padronizadas.

- Leituras ainda nao convertidas para snapshot cacheavel devem continuar usando os mesmos contratos de tags e invalidação para facilitar a migracao gradual.

## Consequences

- O sistema passa a ter uma convencao unica para invalidação analitica
- Features futuras podem adotar cache de forma incremental sem reinventar tags por modulo
- A API de summary ganha snapshot real e revalidação por tags
- O dashboard server component ainda nao usa snapshot persistido nesta fase, entao parte das leituras continua ao vivo
- A estrategia continua compatível com a direcao de snapshots persistidos em banco numa fase posterior

# Arquitetura

Visão estrutural do Finance Controller 2.0: contexto do sistema, containers, componentes, dependências permitidas/proibidas e implantação. Os documentos descrevem a arquitetura **planejada** do 2.0 (reescrita, ADR-016); cada um traz uma seção "Estado atual (1.x)" com a realidade do código de hoje.

## Documentos

- [`context.md`](context.md) — propósito, atores, fronteiras e integrações externas
- [`containers.md`](containers.md) — unidades implantáveis (app Next.js, Neon, Cron, webhook, MCP) e comunicação
- [`components.md`](components.md) — módulos de `src/server/modules/<modulo>` e componentes de UI
- [`dependencies.md`](dependencies.md) — direção de dependência permitida e proibida
- [`deployment.md`](deployment.md) — Vercel + Neon, variáveis de ambiente (somente nomes), build e cron

Diagramas complementares: [`../diagrams/`](../diagrams/README.md).

## Legado 1.x (referência)

Documentos do 1.x mantidos como referência histórica (movidos para esta pasta; `estado` reflete o 1.x, não o 2.0):

- [`flows.md`](flows.md) — fluxos de funcionalidade do 1.x
- [`sequence.md`](sequence.md) — diagramas de sequência do 1.x

## Decisões relacionadas

ADR-016 (reescrita), ADR-017 (informação mobile-first), ADR-019 (ledger), ADR-025 (camada de tools), ADR-030 (cron), ADR-031 (orquestração). Índice em `.agents/decisions/README.md`.

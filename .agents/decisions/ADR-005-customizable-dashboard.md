---
id: ADR-005
title: "Dashboard Customizavel com react-grid-layout"
status: superseded
date: 2026-04-15
deciders: [Victor]
related_tasks: []
superseded_by: ADR-017
legacy: fc-1.x
---

# ADR-005: Dashboard Customizavel com react-grid-layout

> **Revisão 2026-10-05 (FC 2.0):** status `superseded`, ver ADR-017. Home passa a ser a tela Hoje; dashboard arrastável removido.

## Status

Accepted

## Context

O dashboard MVP era statico — todos os widgets na mesma posicao para todos os usuarios. Para portfolio e usabilidade, precisamos de um dashboard personalizavel.

## Decision

- **react-grid-layout** para drag-and-drop + resize de widgets
- Layout persistido no banco via modelos `Dashboard` + `DashboardWidget`
- Cada usuario tem um dashboard (relacao 1:1 User → Dashboard)
- Widgets sao registrados em um registry com tipos, tamanhos padrao e limites
- Modo edicao toggle: drag/resize habilitado, botoes de remover/adicionar
- Layout salvo via PUT /api/dashboards ao sair do modo edicao
- Widgets carregados dinamicamente via `next/dynamic` (SSR desabilitado para grid)

## Consequences

- Dashboard totalmente personalizavel por usuario
- Novos widgets podem ser adicionados apenas registrando no registry
- Grid CSS requer importacao de styles do react-grid-layout
- Sem SSR para o grid (client-only), mas dados sao carregados server-side

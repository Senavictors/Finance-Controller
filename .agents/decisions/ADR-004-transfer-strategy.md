---
id: ADR-004
title: "Transferencias como Par de Transacoes Vinculadas"
status: accepted
date: 2026-04-14
deciders: [Victor]
related_tasks: []
legacy: fc-1.x
---

# ADR-004: Transferencias como Par de Transacoes Vinculadas

> **Revisão 2026-10-05 (FC 2.0):** status `accepted`. Mantido; reforçado pelo ADR-019.

## Status

Accepted

## Context

Transferencias entre contas precisam ser representadas no modelo de dados. Duas abordagens: modelo separado Transfer ou par de transacoes linkadas.

## Decision

Transferencias sao representadas como **duas transacoes** com o mesmo `transferId` (UUID). Uma transacao na conta de origem, outra na conta de destino. Ambas com `type: TRANSFER`.

- Nao existe tabela Transfer separada
- `transferId` eh um campo String na tabela transactions
- Criacao eh atomica via `prisma.$transaction()`
- Exclusao de uma transacao com transferId remove ambas

## Consequences

- Schema mais simples (sem tabela extra)
- Consultas de saldo por conta funcionam naturalmente
- Editar transferencia diretamente nao eh permitido (deve excluir e recriar)
- Limpeza de dados eh mais simples (cascade no account remove tudo)

---
id: ADR-006
title: "Regras Recorrentes com Aplicacao Manual"
status: superseded
date: 2026-04-15
deciders: [Victor]
related_tasks: []
superseded_by: ADR-020
legacy: fc-1.x
---

# ADR-006: Regras Recorrentes com Aplicacao Manual

> **Revisão 2026-10-05 (FC 2.0):** status `superseded`, ver ADR-020. Recorrências viram série RRULE com lançamentos previstos e matching.

## Status

Accepted

## Context

Transacoes recorrentes (salario, aluguel, assinaturas) precisam ser registradas automaticamente. Duas abordagens: cron job automatico ou endpoint de aplicacao manual.

## Decision

Regras recorrentes armazenadas na tabela `recurring_rules` com frequencia configuravel (diaria, semanal, mensal, anual). Aplicacao via endpoint `POST /api/recurring-rules/apply` que o usuario aciona manualmente (botao "Aplicar").

- **Frequencias**: DAILY, WEEKLY (dayOfWeek), MONTHLY (dayOfMonth), YEARLY (dayOfMonth + mes do startDate)
- **Idempotencia**: verifica logs existentes antes de criar transacao (nao duplica)
- **Logs**: cada aplicacao gera um RecurringLog com status (success/error)
- **lastApplied**: atualizado na regra apos aplicacao
- **Limite de seguranca**: max 365 transacoes por regra por aplicacao

## Rationale

- Endpoint manual eh mais simples que cron job e funciona em qualquer hospedagem
- Futuro: pode ser chamado por cron (Vercel Cron Jobs) sem alterar logica
- Idempotencia garante que rodar 2x nao duplica
- Logs permitem auditoria e debug

## Consequences

- Usuario precisa clicar "Aplicar" periodicamente (ou integrar com cron)
- Regras pausadas (isActive=false) nao sao processadas
- Exclusao de regra cascata nos logs

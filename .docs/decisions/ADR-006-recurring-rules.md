# ADR-006: Regras Recorrentes com Aplicacao Manual

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

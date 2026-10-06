---
id: ADR-030
title: Jobs agendados via Vercel Cron idempotentes
status: accepted
date: 2026-10-05
deciders: [Victor (dono do produto), orquestrador]
related_tasks: [FC2-F3-01, FC2-F5-05, FC2-F1-04, FC2-F0-02]
supersedes: []
---

# ADR-030 — Jobs agendados via Vercel Cron idempotentes

## Contexto
O sistema precisa de rotinas periódicas: materializar recorrências PLANNED (ADR-020), recalcular saldos e checar drift (ADR-019), atualizar o `MeiLedger` (ADR-029) e rodar agentes (Vigia, Resumo, Fechamento) que enviam alertas via Telegram (ADR-027). O deploy é Vercel + Neon e o orçamento é mínimo (uso pessoal). Fila externa (Redis, QStash, Inngest) adicionaria custo e componentes.

## Decisão
1. **Vercel Cron diário** declarado em `vercel.json`, chamando route handlers em `src/app/api/cron/*`:

```json
{
  "crons": [
    { "path": "/api/cron/daily", "schedule": "0 9 * * *" }
  ]
}
```
   `0 9 * * *` UTC = 06:00 em Brasília. No plano Hobby o cron é no máximo diário e a execução pode atrasar até 59 minutos; o desenho tolera isso. Um único cron `daily` orquestra os jobs em ordem; cada job também tem rota própria (`/api/cron/materialize-recurring`, `/recompute-balances`, `/mei-ledger`, `/agents`) para execução manual e testes.
2. **Autenticação**: a Vercel envia `Authorization: Bearer CRON_SECRET`; o handler compara em tempo constante e retorna `401` caso contrário. `CRON_SECRET` (>= 32 caracteres) só em variáveis de ambiente. Rotas de cron não usam sessão de usuário.
3. **Idempotência obrigatória**: todo job pode rodar 0, 1 ou N vezes sem efeito colateral duplicado:
   - Materialização: índice único `(seriesId, plannedFor)` com `ON CONFLICT DO NOTHING`.
   - Recalcular saldos: recomputa de `Σ ledger` (determinístico); `UPDATE` absoluto, não incremental.
   - Agentes/alertas: tabela `JobRun (job, runKey, status, startedAt, finishedAt, detail)` com unicidade `(job, runKey)`, em que `runKey` = data local `yyyy-mm-dd` (ou semana/mês, conforme o agente). Alerta já enviado no `runKey` não é reenviado.
4. **Limites de engenharia**: `export const maxDuration = 60` (limite do plano Hobby); cada job processa em lotes e é retomável: trabalho máximo por execução de 500 séries e 10 contas; se não terminar, grava `status = PARTIAL` e continua na próxima chamada (a materialização "preguiçosa" na abertura do app cobre o intervalo).
5. **Execução preguiçosa de reforço**: ao abrir Hoje, se `JobRun` de hoje não existe, o app dispara a materialização do usuário em segundo plano (mesmo código). Cron é conveniência; o sistema não depende dele para estar correto.
6. **Sem fila externa no início**. Reavaliar quando houver necessidade comprovada de: execução com frequência < 1 dia, jobs > 60 s, retries com backoff ou múltiplos usuários.
7. **Observabilidade**: log estruturado por job (`job`, `runKey`, contagens, `durationMs`), sem dados financeiros; falha repetida (2 dias seguidos) gera mensagem de alerta técnica no Telegram.

## Alternativas consideradas
### Alternativa A — Fila externa (QStash, Inngest, BullMQ + Redis)
- Vantagens: retries, agendamentos finos, jobs longos.
- Desvantagens: custo e conta adicionais, mais variáveis e superfície de segurança; sem necessidade em single-user.

### Alternativa B — GitHub Actions agendado chamando a API
- Vantagens: gratuito e flexível (cron a cada hora).
- Desvantagens: segredo duplicado fora da Vercel, minutos de CI consumidos e acoplamento operacional estranho.

### Alternativa C — Calcular tudo sob demanda, sem jobs
- Vantagens: sem agendador.
- Desvantagens: alertas proativos (Vigia, Resumo) e envio por Telegram não existem; primeira abertura do dia seria lenta.

## Consequências
### Positivas
- Zero infraestrutura extra; idempotência torna reexecuções seguras.
- Mesma lógica para cron, execução manual e execução preguiçosa.

### Negativas
- Granularidade diária e janela de atraso de até 59 minutos (Hobby).
- Jobs limitados a 60 s.

### Riscos
- Cron não disparado: coberto pela materialização preguiçosa e pelo alerta de falha.
- Duas execuções simultâneas (cron + app): concorrência resolvida por unicidade no banco.

## Plano de adoção
1. FC2-F0-02: tabela `JobRun`.
2. FC2-F3-01: `/api/cron/materialize-recurring` e `vercel.json`.
3. FC2-F1-04 / F5-05: verificação de drift e agentes sob o mesmo mecanismo; `CRON_SECRET` configurado na Vercel.

## Validação
- Testes: chamar o handler 2x no mesmo dia gera 0 duplicatas e 1 alerta; chamada sem token = 401.
- `JobRun` com status `OK` em 28 de 30 dias no primeiro mês.

## Revisão
Se for necessária frequência < 24 h, jobs > 60 s ou migração para plano Pro.

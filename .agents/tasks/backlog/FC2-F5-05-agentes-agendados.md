---
id: FC2-F5-05
title: Agentes agendados (Vigia, Resumo semanal, Fechamento)
status: backlog
type: feature
phase: F5
wave: 3
owner: ia-integracoes
depends_on: [FC2-F5-04, FC2-F3-02]
created_at: 2026-10-05
updated_at: 2026-10-05
affected_modules: [ai, telegram, tools, recurring, debts, budget]
related_use_cases: []
related_adrs: [ADR-030, ADR-025, ADR-026, ADR-027, ADR-021]
---

# FC2-F5-05 — Agentes agendados (Vigia, Resumo semanal, Fechamento)

## Contexto
Três "agentes" rodam sozinhos e avisam o dono pelo Telegram: **Vigia** (diário: anomalias), **Resumo semanal** (domingos) e **Fechamento** (fim do ciclo de renda). Cada agente é um **prompt + conjunto de tools somente leitura** (F5-01) que devolve **propostas que exigem aprovação**; nenhum agente altera dinheiro sozinho. Execução por **Vercel Cron diário** (ADR-030: jobs idempotentes), custo dentro do orçamento da F5-02 (US$ 5 no total, ≤ US$ 1/mês). Envio pelo bot da F5-04.

## Problema
O app só ajuda quando o usuário abre. Cobranças duplicadas, assinatura que subiu de preço, parcela atrasada ou cheque especial em uso passam despercebidos até o saldo doer. E sem revisão periódica o "fechar o mês" vira tarefa grande.

## Objetivo
1. Rota de cron única e idempotente que decide quais agentes rodam hoje.
2. Três agentes com detecção determinística (barata, testável) e redação opcional por LLM (degrada para texto fixo se não houver orçamento).
3. Registro em `AgentRun`, propostas em `AgentProposal` com aprovação por botões no Telegram.
4. Custo controlado por execução e dentro do orçamento global.

## Fora de escopo
- Agentes que executam ações sozinhos; chat conversacional com os dados.
- Cron mais frequente que diário (limite do plano Hobby da Vercel).
- Tela de histórico de agentes (F6).
- Alertas em tempo real (ex.: ao importar).

## Comportamento atual
- F5-04 entrega `TelegramClient`, pareamento e callbacks inline; F5-01 as tools de leitura (`get_available`, `list_upcoming`, `list_card_statements`, `list_transactions`, `get_debts_summary`, `get_budget_status`, `get_inbox_summary`); F5-02 `callStructured`/`getBudgetStatus`; F3-02 o ciclo de renda e o engine Disponível; F3-01 as séries recorrentes; F1-05 as dívidas.
- A F3-01 já criou `vercel.json` com o cron `/api/cron/recurring` (09:00 UTC, materializa recorrências e marca atrasados) e o padrão de rota `GET /api/cron/*` com `Authorization: Bearer ${CRON_SECRET}`; a F0-06 entrega `requireCronSecret()` em `src/server/auth/secrets.ts` e o `proxy.ts` já deixa `/api/cron/` passar sem cookie.

## Comportamento esperado
### Cron
**Acrescentar** ao `vercel.json` existente (sem remover o cron da F3-01) a entrada:
```json
{ "path": "/api/cron/agents", "schedule": "0 10 * * *" }
```
(10:00 UTC = 07:00 em Brasília, uma hora depois do cron de recorrências, para os agentes enxergarem PLANNED e atrasados já atualizados.) Rota `src/app/api/cron/agents/route.ts` (`GET`, `runtime = 'nodejs'`, `maxDuration = 60`):
- Autenticação: `requireCronSecret()` (F0-06; `Authorization: Bearer ${CRON_SECRET}`, que a Vercel envia quando a variável existe; fail closed). A Vercel Cron chama por **GET**; exportar também `POST` com o mesmo handler para disparo manual.
- Calcula `runDate` em `America/Sao_Paulo` e decide: **Vigia** todo dia; **Resumo semanal** se domingo; **Fechamento** se hoje é o **último dia do ciclo de renda** (véspera do próximo pagamento, via F3-02/`IncomeRule`).
- Idempotência: `AgentRun` com `@@unique([userId, agent, runDate])`; reexecução do mesmo dia devolve `200` com `skipped: true` na resposta HTTP e não reenvia nada. Permite reprocessar manualmente com `?force=1` só se a run anterior falhou.
- Roda os agentes em sequência (não paralelo) para controlar custo; falha de um não impede os outros.

### Anatomia de um agente
```ts
interface AgentDefinition {
  name: 'VIGIA' | 'RESUMO_SEMANAL' | 'FECHAMENTO'
  allowedTools: string[]                       // somente access: 'read' (validado no registro)
  detect(ctx): Promise<Finding[]>              // determinístico, usa as tools de leitura
  narrate(ctx, findings): Promise<AgentOutput> // LLM opcional (F5-02) com fallback de template
  maxCostMicroUsd: number                      // teto por execução (padrão 20_000 = US$ 0,02)
}
interface Proposal { id: string; kind: string; title: string; detail: string;
  severity: 'INFO'|'WARN'|'ALERT'; action?: { tool: string; input: unknown } }  // action só de tools 'write'
```
`detect` roda sempre; `narrate` tenta o LLM (`tier: 'small'`, `purpose: 'AGENT'`, entrada **redigida** com contagens e valores agregados, sem nomes de pessoas) e, se `ok:false` (orçamento, kill switch, erro) ou saída inválida, usa **template determinístico** em pt-BR. O LLM **não decide** o que é anomalia; só redige e prioriza.

### Vigia (diário)
Verificações (cada uma é uma função pura sobre dados lidos pelas tools):
1. **Duplicadas**: duas transações da mesma conta, mesmo valor, mesmo `merchantKey`, ≤ 1 dia de diferença, ambas não ligadas a recorrência/parcelas diferentes → proposta "Possível cobrança duplicada" com ação `delete_transaction` da mais recente.
2. **Aumento de assinatura**: série `SUBSCRIPTION`/`BILL` cuja última ocorrência casada excede em > 5% a média das 3 anteriores → "Assinatura {nome} subiu de R$ X para R$ Y" (sem ação automática).
3. **Parcelas atrasadas**: `LoanInstallment`/PLANNED de dívida com vencimento < hoje e não paga → "Parcela do empréstimo {nome} atrasada há N dias" com custo estimado de juros/multa (F1-05).
4. **Cheque especial**: saldo de conta < 0 → "Você está usando R$ X do limite (N dias), custo estimado de R$ Y/mês"; alerta forte quando o uso passa de 80% do limite.
5. **Modo Aperto** ativo (F3-02): resume o "falta até o salário" e o que vence antes.
Só envia mensagem se houver achados (sem spam); achados idênticos aos do dia anterior não reenviam (hash em `AgentRun.output`).

### Resumo semanal (domingo)
Conteúdo: gasto Flex da semana vs ritmo, 3 maiores categorias, vencimentos da próxima semana (`list_upcoming 7`), faturas que fecham/vencem, itens no Inbox, custo de IA do mês (`get_ai_usage`). Saída: mensagem curta + 0–2 propostas ("revisar Inbox", "ajustar Flex da categoria X").

### Fechamento (último dia do ciclo de renda)
Conteúdo: resultado do ciclo (flex gasto/planejado, sobra ou estouro), contas para **conferir saldo** (reconciliação, F1-04) com lista "confira no banco: Conta X", recorrências **OUTSTANDING** (previstas que não ocorreram), sugestão de Flex do próximo ciclo (média + tendência, sem LLM) e destino da sobra (meta de reserva/quitação). Propostas: `adjust_flex` (apenas proposta), "registrar reserva".

### Propostas e aprovação
Tabela `AgentProposal`. Cada proposta com `action` vira mensagem no Telegram com botões `[Aprovar] [Ignorar]` (`callback_data`: `p:{proposalId}:a` / `p:{proposalId}:i`). Ao **Aprovar**, a F5-04 trata o callback: confere `chat_id` vinculado e `status = PENDING`, chama `runTool` com `channel = 'bot'`, `allowWrite: true` e a `action` gravada, marca `APPROVED` (ou `FAILED` com motivo) e responde o resultado. Propostas sem `action` são só informativas. Expiram em 7 dias (`EXPIRED`).

### Modelo de dados
A F0-02 **já criou** `AgentRun` (`agent`, `status AgentRunStatus` com `RUNNING | OK | FAILED`, `startedAt`, `finishedAt?`, `summary?`, `input Json?`, `output Json?`, `costMicroUsd`, índice `[userId, agent, startedAt desc]`). Migration aditiva `add_agents`: em `AgentRun`, `runDate DateTime` (data de calendário em meio-dia UTC, **sem** `@db.Date`: o teste de contrato do schema da F0-02 proíbe) com `@@unique([userId, agent, runDate])` e `steps Json @default("[]")` (`[{ tool, ok, ms }]`); e a nova tabela de propostas. Conferir se `agent` é `String` ou enum e usar os valores `VIGIA`, `RESUMO_SEMANAL`, `FECHAMENTO`. Não existe o status `SKIPPED`: run sem achados ou já executada fica `OK` com `output.skipped = true`.
```prisma
enum ProposalStatus { PENDING APPROVED REJECTED EXPIRED FAILED }

model AgentProposal {
  id        String         @id @default(cuid())
  runId     String
  userId    String
  kind      String
  title     String
  detail    String
  severity  String
  action    Json?
  status    ProposalStatus @default(PENDING)
  createdAt DateTime       @default(now())
  decidedAt DateTime?
  run       AgentRun       @relation(fields: [runId], references: [id], onDelete: Cascade)
  @@index([userId, status])
}
```

## Regras de negócio
- RN-01: Agentes só podem usar tools `read` (o registro de agentes valida `allowedTools` contra `access`; teste falha se houver `write`). Ações de escrita só existem como `Proposal.action` executada **após aprovação humana**.
- RN-02: Cron idempotente por `(userId, agent, runDate)`; segunda chamada no mesmo dia não reenvia mensagens (ADR-030).
- RN-03: Custo por execução ≤ `maxCostMicroUsd`; excedente interrompe a narração e usa template. `AgentRun.costMicroUsd` soma os `AiUsage` do `agentRunId`.
- RN-04: Orçamento global manda: com `BUDGET_EXCEEDED`/`KILL_SWITCH`/`DISABLED` os agentes continuam funcionando com **detecção + template** (sem LLM). A reserva da F5-02 vale: agentes não consomem os últimos US$ 0,50.
- RN-05: Dados ao LLM: apenas agregados e rótulos redigidos (F5-02); nunca nomes de pessoas, CPF, contas.
- RN-06: Sem achados no Vigia → nenhuma mensagem; Resumo e Fechamento sempre enviam.
- RN-07: Segunda run do mesmo achado (mesmo hash) em dias seguidos não reenvia, salvo `ALERT` com mudança de valor.
- RN-08: Aprovação só vale para o `chat_id` vinculado; proposta expirada/decidida não executa.
- RN-09: `runDate` e "domingo"/"fim do ciclo" calculados em `America/Sao_Paulo`; ciclo de renda via F3-02.
- RN-10: Falha de envio ao Telegram marca a run `FAILED` com erro, mantém propostas `PENDING` e permite `force=1`.
- RN-11: Logs sem conteúdo: apenas `{ agent, status, findings, costMicroUsd, durationMs }`.
- RN-12: Mensagens em pt-BR, tom direto, sem emojis, valores em BRL a partir de centavos.

## Critérios de aceitação
- [ ] CA-01: `GET /api/cron/agents` sem `Authorization` correto retorna `401`.
- [ ] CA-02: Em dia útil roda só o Vigia; em domingo, Vigia + Resumo; no último dia do ciclo, inclui Fechamento (datas injetadas no teste).
- [ ] CA-03: Duas chamadas no mesmo dia geram uma só `AgentRun` por agente e uma só mensagem.
- [ ] CA-04: Vigia detecta duplicada, aumento de assinatura > 5%, parcela atrasada e cheque especial em dados sintéticos; sem anomalia, nada é enviado.
- [ ] CA-05: Com o provedor de IA bloqueado, as mensagens saem com template e `costMicroUsd = 0`.
- [ ] CA-06: Com IA disponível (mock), o custo da execução fica ≤ `maxCostMicroUsd` e `AiUsage` referencia o `agentRunId`.
- [ ] CA-07: Proposta com ação aparece com botões; **Aprovar** executa a tool de escrita uma única vez e marca `APPROVED`; **Ignorar** marca `REJECTED`; aprovar duas vezes não duplica.
- [ ] CA-08: Teste de registro garante que nenhum agente declara tool `write` em `allowedTools`.
- [ ] CA-09: Resumo semanal e Fechamento trazem os campos descritos (conteúdo verificado sobre dados sintéticos).
- [ ] CA-10: Proposta com mais de 7 dias não executa (`EXPIRED`).
- [ ] CA-11: `vercel.json` contém o cron; `.env.example` documenta `CRON_SECRET`.
- [ ] CA-12: `npm run lint`, `npm test`, `npx next build` passam; `docs/integrations/agentes.md` documenta agentes, gatilhos e custos.

## Impacto técnico
### Backend
Criar:
- `src/server/modules/ai/domain/agents/types.ts`, `schedule.ts` (decide quais agentes rodam: puro, com `now` injetado) (+ testes)
- `src/server/modules/ai/domain/agents/detectors/duplicates.ts`, `subscription-increase.ts`, `overdue-installments.ts`, `overdraft-usage.ts`, `tight-mode.ts` (puros) (+ testes)
- `src/server/modules/ai/domain/agents/templates.ts` (textos de fallback)
- `src/server/modules/ai/application/agents/vigia.ts`, `weekly-summary.ts`, `cycle-close.ts`, `run-agents.ts` (orquestra, idempotência, custo, envio), `decide-proposal.ts`
- `src/server/modules/ai/domain/prompts/agents.ts` (prompts versionados: `vigia.v1`, `resumo.v1`, `fechamento.v1`)
- `src/server/modules/ai/infra/agent-run-repository.ts`, `proposal-repository.ts`
- `src/app/api/cron/agents/route.ts` (GET e POST); acrescentar a entrada em `vercel.json`
- Alterar `src/server/modules/telegram/application/handle-callback.ts` (F5-04) para aceitar `p:{id}:a|i`.

### Frontend
Nenhum.

### Banco de dados
Migration `add_agents` (modelos acima).

### Integrações
Vercel Cron; Telegram (envio); OpenAI (narração opcional) via F5-02.

### Segurança
`CRON_SECRET` em tempo constante; só leitura nos agentes; aprovação por chat vinculado; dados ao LLM agregados e redigidos; sem logs de conteúdo.

## Plano de implementação
- [ ] 1. Ler: tools da F5-01, `TelegramClient` e `handle-callback` da F5-04, `callStructured` da F5-02, ciclo de renda do F3-02, dívidas da F1-05; listar o que cada detector precisa e quais tools fornecem.
- [ ] 2. `schedule.ts` (puro) com testes de datas (domingo, fim do ciclo, virada de mês, fuso).
- [ ] 3. Detectores puros com fixtures sintéticos, um por um (TDD).
- [ ] 4. Templates de fallback e prompts versionados.
- [ ] 5. Migration `add_agents` e repositórios.
- [ ] 6. `run-agents.ts` (idempotência, custo, envio, falha parcial) e os três agentes.
- [ ] 7. Aprovação de propostas (`decide-proposal`) + callback `p:` na F5-04.
- [ ] 8. Rota de cron, `vercel.json` e `CRON_SECRET`.
- [ ] 9. Testes de integração (Telegram fake, IA mock) para CA-02 a CA-10.
- [ ] 10. Documentar; atualizar `CONTEXT.md`; teste manual com `curl` autenticado e `force=1` em dados sintéticos.

## Estratégia de testes
- [ ] Unitários: `schedule` (segunda a sábado → [VIGIA]; domingo → [VIGIA, RESUMO]; véspera do pagamento → inclui FECHAMENTO; domingo que também é fim de ciclo → três); detector de duplicadas (mesmo valor e merchant em 1 dia → sim; 2 dias → não; valores diferentes → não; parcelas 2/10 e 3/10 do mesmo merchant → não); aumento de assinatura (R$ 40,00, 40,00, 40,00 → 44,00: +10% sim; 41,00: +2,5% não); parcela atrasada (vencida ontem → 1 dia; paga → não); cheque especial (saldo −R$ 500,00 com limite R$ 1.000,00 → 50%, WARN; −R$ 900,00 → 90%, ALERT; saldo positivo → nada); hash de achados estável.
- [ ] Integração: run completa por agente com Telegram fake e IA mock; IA bloqueada; custo estourado no meio; falha do envio; idempotência; aprovação/ignorar/expirar; usuário sem vínculo ativo do Telegram (não envia; run `OK` com `output.skipped = true`).
- [ ] E2E: n/a.
- [ ] Manual: `curl -H "Authorization: Bearer $CRON_SECRET" /api/cron/agents` em ambiente de teste com dados sintéticos; conferir mensagem e botões no bot real.

## Riscos e rollback
- **Alertas em excesso (spam)**: só envia com achados, dedupe por hash, severidade.
- **Falso positivo de duplicada**: apenas proposta; ação exige aprovação.
- **Cron diário no plano Hobby** pode atrasar até uma hora na janela: aceitável; mensagem não depende de minuto exato.
- **Custo**: detecção sem LLM + narração opcional + teto por run + orçamento global.
- Rollback: remover o cron do `vercel.json` desliga os agentes; `AI_ENABLED=false` mantém só templates; tabelas isoladas.

## Registro de execução
### Alterações realizadas
### Arquivos principais
### Decisões
### Divergências
### Pendências

## Validação

## Handoff

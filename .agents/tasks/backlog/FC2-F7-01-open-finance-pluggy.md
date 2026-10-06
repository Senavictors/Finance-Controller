---
id: FC2-F7-01
title: Open Finance via Pluggy
status: backlog
type: feature
phase: F7
wave: null
owner: ia-integracoes
depends_on: [FC2-F4-04]
created_at: 2026-10-05
updated_at: 2026-10-05
affected_modules: [openfinance, imports, accounts, ledger]
related_use_cases: []
related_adrs: [ADR-023, ADR-016, ADR-030]
---

# FC2-F7-01 — Open Finance via Pluggy

> Backlog sem data. Só iniciar depois da F6 e da decisão do dono sobre custo e plano (ver Riscos). Antes de executar, reler a documentação vigente da Pluggy: endpoints e planos podem ter mudado.

## Contexto
Hoje o saldo e os lançamentos entram por captura, importação de PDF/OFX/CSV e Telegram. O Open Finance (agregação bancária regulada) permitiria sincronizar contas e cartões automaticamente, eliminando o passo manual de baixar extratos. A agregadora considerada é a **Pluggy** (spec §7: "futuro, custo, credenciais próprias"). A infraestrutura de importação (ADR-023) já existe: esta task é um **novo parser/fonte** que alimenta o mesmo pipeline.

## Problema
Importar PDF todo mês é rápido (F4), mas ainda é manual e atrasa a visão de saldo e fatura. Saldos ficam desatualizados entre importações, e o "livre" depende de reconciliação manual.

## Objetivo
Sincronizar contas e transações de bancos conectados via Pluggy, entrando como `source = OPEN_FINANCE` no mesmo pipeline (normalizar → `importHash` → dedupe → enriquecer → matching → Inbox), com saldo conciliado contra o ledger.

## Fora de escopo
- Iniciação de pagamentos, Pix automático ou qualquer escrita no banco.
- Investimentos e dados cadastrais.
- Multiusuário/casal (F7-02).
- Substituir importação por arquivo (continua como fallback).

## Comportamento atual
Importação por arquivo funciona (F4-01/F4-02); matching e transferências entre contas (F4-04) funcionam; `Transaction.source` já prevê `OPEN_FINANCE` (spec §6). Não há conexão com agregadores.

## Comportamento esperado
1. Em Mais > Integrações o usuário clica "Conectar banco": o app obtém um **connect token** (backend, com `PLUGGY_CLIENT_ID`/`PLUGGY_CLIENT_SECRET` só no servidor) e abre o **Pluggy Connect** (widget). Ao concluir, o app recebe o `itemId` e grava `OpenFinanceItem`.
2. O usuário **mapeia** cada conta/cartão da Pluggy para uma `Account` do FC (ou cria uma).
3. Sincronização: botão "Atualizar agora" e cron diário (ADR-030, rota `src/app/api/cron/open-finance/route.ts`, idempotente) buscam transações desde `lastSyncAt − 3 dias`; cada transação vira `ParsedRow` (centavos com sinal, data meio-dia UTC, `externalId` = id da Pluggy) e entra no pipeline da F4-01 com `source = OPEN_FINANCE`.
4. Dedupe duplo: `importHash` (mesma fórmula da F4-01) **e** `externalId` Pluggy; se a mesma transação já veio por PDF/OFX, vale o `importHash` e não duplica.
5. Saldo: comparar `balance` da Pluggy com o saldo do ledger por conta e registrar divergência na reconciliação (F1-04), sem sobrescrever o ledger.
6. Webhook opcional `POST /api/open-finance/webhook` (evento `item/updated`) dispara sync da conta; verificação de autenticidade conforme a documentação da Pluggy.
7. Reconexão: itens expiram/exigem reautenticação; status `NEEDS_RECONNECT` visível e aviso no Telegram (F5-04).

## Regras de negócio
- RN-01: Credenciais da Pluggy apenas em env (`PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET`); API key da Pluggy (curta) obtida sob demanda e nunca persistida nem logada. Nenhuma credencial bancária do usuário passa pelo FC (só o widget da Pluggy as vê).
- RN-02: Somente leitura. Nenhuma chamada de escrita/iniciação de pagamento.
- RN-03: Toda transação sincronizada entra como `NEEDS_REVIEW` pelo pipeline existente; regras (F4-03) e matching/transferências (F4-04) se aplicam sem mudança.
- RN-04: Idempotência por `importHash` + `externalId`; sincronizações repetidas não duplicam.
- RN-05: Minimização: guardar só o necessário (id do item, id da conta externa, `lastSyncAt`, status); não guardar payload bruto da Pluggy; descrição passa pela normalização e redaction (F5-02) antes de ir a qualquer LLM.
- RN-06: Custo: contar chamadas por mês (`OpenFinanceSyncLog`) e respeitar um teto configurável (`OPEN_FINANCE_MAX_SYNCS_PER_DAY`, padrão 2 por item); alertar se próximo do limite do plano.
- RN-07: Desconectar remove o item na Pluggy e marca o `OpenFinanceItem` como revogado; transações já importadas permanecem.
- RN-08: Webhook exige verificação da origem e é idempotente; evento desconhecido é ignorado com `200`.
- RN-09: Falha da Pluggy nunca bloqueia o app; importação por arquivo segue disponível.
- RN-10: Uma decisão de custo/plano (gratuito pessoal vs. pago) é registrada em ADR antes de implementar.

## Critérios de aceitação
- [ ] CA-01: ADR de decisão do provedor/plano e custo escrito antes do código (ADR novo, numeração seguinte à 031).
- [ ] CA-02: Fluxo de conexão obtém connect token no servidor, abre o widget e grava `OpenFinanceItem` sem expor `PLUGGY_CLIENT_SECRET` ao navegador.
- [ ] CA-03: Mapeamento conta externa → `Account` funciona e impede mapear duas contas externas para a mesma conta do FC.
- [ ] CA-04: Sync traz transações sintéticas (mock da API) e cria `Transaction` `OPEN_FINANCE`/`NEEDS_REVIEW` com `importHash` da F4-01; segunda sync não duplica.
- [ ] CA-05: Transação já importada por OFX com o mesmo hash não é duplicada pelo sync.
- [ ] CA-06: Matching com PLANNED e detecção de transferência (F4-04) funcionam com linhas do Open Finance.
- [ ] CA-07: Divergência de saldo Pluggy × ledger aparece na reconciliação sem alterar o ledger.
- [ ] CA-08: Item expirado muda para `NEEDS_RECONNECT` e dispara aviso.
- [ ] CA-09: Webhook sem autenticidade válida retorna erro e não sincroniza.
- [ ] CA-10: Nenhum segredo ou payload bruto em logs; `npm run lint`, `npm test`, `npx next build` passam.

## Impacto técnico
### Backend
`src/server/modules/openfinance/{domain,application,infra,http}`: cliente Pluggy (`infra/pluggy-client.ts`), mapper `PluggyTransaction → ParsedRow` (puro), `connect-item`, `map-account`, `sync-item`, `disconnect-item`; rotas `api/open-finance/connect-token`, `items`, `items/[id]/sync`, `webhook`; cron `api/cron/open-finance`. Reusa `imports/application/import-file` (extrair função que aceita `ParsedRow[]` sem arquivo).
### Frontend
Seção "Bancos conectados" em Mais > Integrações: conectar, mapear contas, status, atualizar, desconectar (com tokens `--fc-*`).
### Banco de dados
`OpenFinanceItem { id, userId, provider, externalItemId, institutionName, status, lastSyncAt }`, `OpenFinanceAccountLink { id, itemId, externalAccountId, accountId }` (único por `externalAccountId`), `OpenFinanceSyncLog`.
### Integrações
Pluggy API e Pluggy Connect; Vercel Cron; Telegram (avisos).
### Segurança
Segredos em env; webhook autenticado; só leitura; minimização de dados; revogação.

## Plano de implementação
- [ ] 1. Ler a documentação atual da Pluggy (planos, limites, autenticação, webhooks) e escrever o ADR (CA-01).
- [ ] 2. Extrair do pipeline da F4-01 a entrada por `ParsedRow[]`.
- [ ] 3. Mapper puro e cliente Pluggy com mock.
- [ ] 4. Migration e repositórios; fluxo de conexão e mapeamento.
- [ ] 5. `sync-item` (janela, dedupe duplo) e integração com F4-04.
- [ ] 6. Cron e webhook; status de reconexão e aviso.
- [ ] 7. UI de integrações.
- [ ] 8. Testes (abaixo), docs em `docs/integrations/open-finance.md`, `CONTEXT.md`.

## Estratégia de testes
- [ ] Unitários: mapper (valor `-42.9` → `-4290`, data com fuso, descrição vazia, cartão com sinal invertido); janela de sync; dedupe duplo.
- [ ] Integração (API mockada): conexão, mapeamento, sync repetido, item expirado, webhook válido/inválido.
- [ ] E2E: n/a até a decisão de plano (ambiente sandbox da Pluggy, se disponível).
- [ ] Manual: conectar o sandbox, sincronizar e conferir Inbox.

## Riscos e rollback
- **Custo e limites de plano** da agregadora (principal risco): ADR e teto de sync.
- **Conformidade/privacidade**: dados bancários completos em serviço de terceiro; manter mínimo e revogável.
- **Divergência de dados** entre Pluggy e extrato oficial: ledger e reconciliação são a fonte de verdade.
- Rollback: desconectar itens e remover o cron; importação por arquivo permanece.

## Registro de execução
### Alterações realizadas
### Arquivos principais
### Decisões
### Divergências
### Pendências

## Validação

## Handoff

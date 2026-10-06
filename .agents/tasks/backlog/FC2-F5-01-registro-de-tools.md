---
id: FC2-F5-01
title: Registro de tools (Zod) sobre os use-cases
status: backlog
type: feature
phase: F5
wave: 1
owner: api-servidor
depends_on: [FC2-F2-03]
created_at: 2026-10-05
updated_at: 2026-10-05
affected_modules: [tools, ledger, accounts, cards, capture, imports]
related_use_cases: []
related_adrs: [ADR-025, ADR-024, ADR-027, ADR-026]
---

# FC2-F5-01 — Registro de tools (Zod) sobre os use-cases

## Contexto
O bot Telegram (F5-04), o servidor MCP (F5-06), os agentes (F5-05) e, se quiser, a própria UI precisam executar as mesmas operações sobre o mesmo domínio. ADR-025 define uma **camada única de tools** sobre os use-cases: cada tool é um contrato (nome, descrição, entrada Zod, saída, nível de acesso) cujo handler chama um use-case existente. Assim as regras de negócio não são duplicadas por canal.

## Problema
Sem registro central, cada canal reimplementaria consultas e mutações com validações diferentes, e não haveria um lugar para impor "read-only por padrão" nem para auditar o que um agente pode chamar.

## Objetivo
Criar `src/server/modules/tools/` com:
1. `defineTool` + registro tipado, com entrada/saída Zod 4, geração de JSON Schema e nível de acesso `read | write`.
2. Contexto de execução (`userId`, `channel`) e resultado padronizado.
3. Conjunto inicial de tools (leitura e escrita) sobre os use-cases existentes das fases F1–F4.
4. Testes de contrato que impedem tool nova sem schema, descrição e teste.

## Fora de escopo
- Transporte (webhook Telegram, HTTP do MCP) e loop de LLM com function calling (F5-04, F5-05, F5-06).
- Novos use-cases de domínio (usar os existentes; lacunas viram pendência).
- UI para as tools.

## Comportamento atual
Use-cases existem por módulo (`src/server/modules/ledger/application/`, `accounts`, `cards`, `capture`, `recurring`, `budget`, `imports`, etc.), chamados por Route Handlers finos. Não há `tools/`. A F2-01 entrega o parser quick-add (puro) e a F2-03 o use-case `createFromDraft`. A F3-02 entrega o engine Disponível; F3-01, as recorrências; F4, o Inbox.

## Comportamento esperado
### API do registro (`src/server/modules/tools/domain/define-tool.ts`)
```ts
import { z } from 'zod'

export type ToolAccess = 'read' | 'write'
export type ToolChannel = 'ui' | 'bot' | 'mcp' | 'agent'

export interface ToolContext {
  userId: string
  channel: ToolChannel
  now: Date
}

export interface ToolDefinition<I extends z.ZodType, O extends z.ZodType> {
  name: string                 // snake_case, único (ex.: 'get_available')
  description: string          // inglês curto (>= 20 caracteres): consumido por LLMs e clientes MCP
  access: ToolAccess
  input: I
  output: O
  handler: (ctx: ToolContext, input: z.infer<I>) => Promise<z.infer<O>>
}

export type ToolResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } }
```
`runTool(registry, name, ctx, rawInput, { allowWrite })` valida a entrada (Zod), recusa `write` quando `allowWrite = false` (`WRITE_NOT_ALLOWED`), executa, valida a saída e devolve `ToolResult`. Erros de domínio viram `{ ok:false }`; exceções inesperadas viram `INTERNAL` sem vazar stack.

`listTools(registry, { access })` devolve metadados + JSON Schema da entrada (`z.toJSONSchema(input)` do Zod 4) para MCP e para function calling.

### Tools iniciais (arquivo `src/server/modules/tools/application/definitions/*.ts`, um por arquivo)
Valores monetários sempre `...Cents` (inteiro) mais um campo `display` já formatado em BRL para facilitar respostas de bot.

Leitura (`access: 'read'`):
| Tool | Entrada | Saída | Use-case de apoio |
|---|---|---|---|
| `get_available` | `{ date?: string }` | modo (`NORMAL`/`APERTO`), `freeCents`, `perDayCents`, `cycleEnd`, `pace`, `shortfallCents?` | `getAvailable` em `src/server/modules/budget/application/get-available.ts` (F3-02) |
| `list_accounts` | `{}` | contas com `balanceCents`, `overdraftLimitCents`, `usedOverdraftCents` | F1-02 |
| `list_transactions` | `{ from?, to?, accountId?, categoryId?, q?, limit (≤ 50), cursor? }` | lançamentos resumidos | ledger |
| `search_transactions` | `{ q, limit (≤ 20) }` | idem | ledger |
| `list_upcoming` | `{ days (≤ 60, padrão 14) }` | PLANNED/faturas/renda que vencem | F3-01/F1-03 |
| `list_card_statements` | `{ onlyOpen?: boolean }` | faturas com total, vencimento, status | F1-03 |
| `get_inbox_summary` | `{}` | contagem e 5 primeiros itens | F4-05 |
| `list_categories` | `{}` | categorias e natureza | F1-07 |
| `get_budget_status` | `{ cycle?: 'current' }` | flex, gasto, ritmo por balde | F3-03 |
| `get_debts_summary` | `{}` | dívidas, custo mensal, ordem por taxa | F1-05 |
| `get_ai_usage` | `{}` | gasto do mês e total de IA | F5-02 (se já existir; senão stub com pendência) |

Escrita (`access: 'write'`):
| Tool | Entrada | Saída | Observação |
|---|---|---|---|
| `propose_transaction` | `{ text: string }` | `Draft` tipado + `draftId` + campos faltantes | **sem gravar**: `parseQuickAdd(text, ctx)` (F2-01, `capture/domain/parse-quick-add.ts`) + `enrichDraft` (F2-02) e, se `draft.needsFallback` e a IA permitir, o fallback LLM (F5-03); salva rascunho efêmero (TTL 15 min) em `ToolDraft` |
| `commit_draft` | `{ draftId, overrides? }` | transação criada + `availableAfter` (resultado de `getAvailable`) | monta a entrada de `createFromDraftSchema` (F2-03) com `clientRequestId = draftId` (a idempotência já é da F2-03: repetir devolve `duplicate: true`), `source = BOT` ou `QUICKADD` conforme o canal; guarda o `undoToken` devolvido |
| `confirm_inbox_item` | `{ transactionId, categoryId? }` | transação | `confirm-transaction` (F4-05), mesma regra de `userLocked`/aprendizado |
| `delete_transaction` | `{ transactionId }` | `{ deleted: true }` | `deleteTransaction` do ledger (F1-01); só transações `MANUAL/QUICKADD/BOT` criadas há ≤ 24 h e nunca `RECONCILED` |
| `undo_last_capture` | `{}` | resumo do que foi desfeito | localiza o último `ToolDraft` confirmado pelo mesmo usuário e canal com `undoToken` e chama `undoCapture` (F2-03), que só desfaz até 10 min após a criação, sem edição posterior e sem fatura paga; fora dessas condições devolve `CONFLICT`/`NOT_FOUND` com mensagem clara |
| `mark_planned_paid` | `{ plannedId, amountCents? }` | transação | `confirm-planned` (F3-01) |

Fluxo em dois passos de propósito: o LLM/bot **propõe**, o humano **confirma** (`commit_draft`). Nenhuma tool de escrita altera dinheiro sem um passo explícito.

### Rascunhos (`Draft` persistido)
Tabela `ToolDraft { id, userId, channel, draft Json, expiresAt, committedAt?, undoToken?, captureResult Json? }` (coordenar migration com `dados-prisma`); `commit_draft` preenche `committedAt`, `undoToken` e `captureResult` (idempotência complementar à da F2-03); limpeza oportunista de expirados.

## Regras de negócio
- RN-01: **Toda tool chama use-case**; proibido Prisma direto no handler (ADR-025). Handlers são finos: mapeiam entrada → use-case → saída.
- RN-02: `access` é obrigatório; tools `write` só rodam quando o chamador passa `allowWrite: true`. Canais: `ui` e `bot` (allowlist) permitem; `mcp` conforme token (F5-06); `agent` **nunca** executa `write` diretamente: devolve proposta para aprovação (F5-05).
- RN-03: Toda entrada é validada por Zod com limites (strings ≤ 500, listas ≤ 50, `limit` máximo). Saída também é validada (detecta vazamento de campos).
- RN-04: Saídas **nunca** incluem campos sensíveis (hashes, tokens, `importHash`, `userId`, números de conta/agência). Um teste verifica as chaves proibidas em todos os outputs de exemplo.
- RN-05: Datas de calendário seguem ADR-002 (meio-dia UTC internamente; strings `AAAA-MM-DD` nas bordas).
- RN-06: Nome de tool é estável e em snake_case; mudar nome ou schema de tool publicada é breaking change (versionar no `description` e registrar em `CONTEXT.md`).
- RN-07: Resultado padrão `ToolResult`; códigos de erro: `VALIDATION`, `NOT_FOUND`, `WRITE_NOT_ALLOWED`, `CONFLICT`, `INTERNAL`.
- RN-08: Registro único: `src/server/modules/tools/index.ts` exporta `registry`; um teste falha se houver tool sem `description` ≥ 20 caracteres, sem teste de contrato ou com `access` ausente.
- RN-09: Tools respeitam `userLocked` e demais regras porque reusam os use-cases (nenhuma duplicação de regra de negócio no handler).
- RN-10: Log de execução: `{ tool, channel, ok, durationMs }` apenas; nunca entrada/saída.

## Critérios de aceitação
- [ ] CA-01: `runTool` rejeita entrada inválida com `VALIDATION` e mensagem do Zod resumida.
- [ ] CA-02: `runTool` com `allowWrite: false` recusa qualquer tool `write` com `WRITE_NOT_ALLOWED` sem tocar no banco.
- [ ] CA-03: `listTools` devolve nome, descrição e JSON Schema válido (draft 2020-12) para todas as tools; filtro `access: 'read'` omite as de escrita.
- [ ] CA-04: `propose_transaction` com "ifood 42,90 nubank" devolve Draft com valor 4290, conta correta e **não** cria transação; `commit_draft` cria exatamente uma; repetir `commit_draft` com o mesmo `draftId` não cria outra.
- [ ] CA-05: `get_available` retorna o mesmo resultado do use-case/engine para o mesmo estado (teste de equivalência).
- [ ] CA-06: `undo_last_capture` desfaz a última captura confirmada em até 10 min (janela do `undoCapture` da F2-03) e recusa quando não há nenhuma, quando passou da janela ou quando a transação foi editada depois.
- [ ] CA-07: Teste de varredura confirma que nenhum output de exemplo contém chaves proibidas (`userId`, `importHash`, `token`, `password`, `accountNumber`).
- [ ] CA-08: Teste de contrato falha ao registrar uma tool sem descrição/`access`.
- [ ] CA-09: Isolamento: tool chamada com `userId` A nunca devolve dados do usuário B (teste com dois usuários).
- [ ] CA-10: `npm run lint`, `npm test`, `npx next build` passam; docs em `docs/api/tools.md` listam todas as tools com entrada/saída.

## Impacto técnico
### Backend
Criar:
- `src/server/modules/tools/domain/define-tool.ts`, `run-tool.ts`, `registry.ts`, `errors.ts` (+ testes)
- `src/server/modules/tools/application/definitions/` com: `get-available.ts`, `list-accounts.ts`, `list-transactions.ts`, `search-transactions.ts`, `list-upcoming.ts`, `list-card-statements.ts`, `get-inbox-summary.ts`, `list-categories.ts`, `get-budget-status.ts`, `get-debts-summary.ts`, `get-ai-usage.ts`, `propose-transaction.ts`, `commit-draft.ts`, `confirm-inbox-item.ts`, `delete-transaction.ts`, `undo-last-capture.ts`, `mark-planned-paid.ts`
- `src/server/modules/tools/application/drafts.ts`, `src/server/modules/tools/infra/draft-repository.ts`
- `src/server/modules/tools/http/schemas.ts` (formatos comuns: `money`, `isoDate`, paginação)
- `src/server/modules/tools/index.ts` (registro e exports públicos)
- Opcional (UI e debugging): `src/app/api/tools/route.ts` (GET lista) e `src/app/api/tools/[name]/route.ts` (POST, canal `ui`, sessão, `allowWrite: true`). Se não houver consumidor imediato, deixar só o GET e registrar a pendência.

### Frontend
Nenhum.

### Banco de dados
Migration `add_tool_drafts` (modelo `ToolDraft`, índice `[userId, expiresAt]`).

### Integrações
Nenhuma; é a base de F5-04, F5-05 e F5-06.

### Segurança
Allowlist de canais por `allowWrite`; saídas sanitizadas (RN-04); sem log de conteúdo; limites de tamanho; tools `write` nunca expostas a canal sem autenticação.

## Plano de implementação
- [ ] 1. Ler os use-cases reais dos módulos e a F2-01/F2-03 (parser e `createFromDraft`); montar a tabela "tool → use-case → arquivo" em "Registro de execução". Se faltar use-case para alguma tool, registrar em "Pendências" e **não** criar a tool.
- [ ] 2. Implementar `define-tool`, `run-tool`, `registry` e `errors` com TDD.
- [ ] 3. Implementar schemas comuns e o formatador `display` (centavos → BRL).
- [ ] 4. Tools de leitura, uma por vez, cada uma com teste de contrato.
- [ ] 5. `ToolDraft` (migration), `propose_transaction` e `commit_draft`.
- [ ] 6. Demais tools de escrita (`confirm_inbox_item`, `delete_transaction`, `undo_last_capture`, `mark_planned_paid`).
- [ ] 7. Teste de varredura de chaves proibidas e teste de registro (RN-08).
- [ ] 8. Rotas opcionais `api/tools`.
- [ ] 9. Escrever `docs/api/tools.md`; atualizar `CONTEXT.md`.

## Estratégia de testes
- [ ] Unitários: `defineTool` com schema; `runTool` (válida, inválida, escrita bloqueada, handler lança erro de domínio, handler lança erro inesperado → `INTERNAL`); `z.toJSONSchema` gera `properties` e `required` esperados; formatação `display` (`-4290` → `-R$ 42,90`).
- [ ] Integração: com Prisma, `propose_transaction` → `commit_draft` (1 transação), repetição idempotente, `ToolDraft` expirado (TTL) → `NOT_FOUND`; `undo_last_capture` janela de 10 min (11 min → recusa; edição posterior → recusa); isolamento entre dois usuários; `list_transactions` com `limit = 51` → `VALIDATION`.
- [ ] E2E: n/a (cobertos em F5-04/F5-06).
- [ ] Manual: chamar `GET /api/tools` e `POST /api/tools/get_available` autenticado.

## Riscos e rollback
- **Duplicar regra de negócio no handler**: revisão do `qa-revisor` verifica RN-01.
- **Schema de tool muda e quebra clientes MCP/Telegram**: versionar e testar contrato.
- **Tool de escrita exposta por engano a canal sem confirmação**: `allowWrite` explícito + teste CA-02.
- Rollback: módulo novo e aditivo; remover `tools/` e a migration `ToolDraft` não afeta o domínio.

## Registro de execução
### Alterações realizadas
### Arquivos principais
### Decisões
### Divergências
### Pendências

## Validação

## Handoff

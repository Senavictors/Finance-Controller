---
id: ADR-025
title: Camada única de tools sobre use-cases (UI, bot, MCP, agentes)
status: accepted
date: 2026-10-05
deciders: [Victor (dono do produto), orquestrador]
related_tasks: [FC2-F5-01, FC2-F5-04, FC2-F5-06, FC2-F5-05, FC2-F2-03]
supersedes: []
---

# ADR-025 — Camada única de tools sobre use-cases (UI, bot, MCP, agentes)

## Contexto
O produto terá várias portas de entrada para as mesmas operações: UI web (Server Actions e route handlers), bot Telegram (ADR-027), servidor MCP para Claude/ChatGPT (spec §7) e agentes agendados (Vigia, Resumo, Fechamento). Se cada porta reimplementar regras (criar lançamento, consultar saldo), as regras divergem (cache de saldo, matching, `userLocked`) e a superfície de segurança multiplica.

## Decisão
1. **Use-cases são a única via de mutação**: funções em `src/server/modules/MODULO/application/` com assinatura `(ctx: { userId, source }, input) -> Result`. Route handlers (`src/app/api/**/route.ts`) e Server Actions são adaptadores finos que só validam HTTP e chamam o use-case.
2. **Registry de tools** em `src/server/modules/tools/registry.ts`: cada tool é

```ts
type Tool<I, O> = {
  name: string;              // snake_case estável, ex.: "create_transaction"
  description: string;       // lido por LLM; pt-BR, uma frase + quando usar
  inputSchema: ZodType<I>;   // Zod 4; gera JSON Schema para OpenAI/MCP
  access: "read" | "write";
  handler: (ctx: ToolContext, input: I) => Promise<O>; // chama o use-case
};
```
3. **Catálogo inicial** (nomes estáveis): leitura: `get_available`, `get_balances`, `list_transactions`, `get_statement`, `get_debts`, `get_income_cycle`, `get_mei_status`; escrita: `create_transaction` (via `createFromDraft`), `confirm_inbox_item`, `categorize_transaction`, `mark_planned_paid`, `transfer_between_accounts`.
4. **Consumidores** usam o mesmo registry: a UI chama o use-case direto (sem passar por LLM) mas compartilha os schemas Zod; o bot (F5-04) e o cliente OpenAI (function calling) recebem `toOpenAITools(registry)`; o servidor MCP em `src/app/api/mcp` expõe `toMcpTools(registry)`; os agentes chamam `registry.call(name, input)`.
5. **Segurança por padrão**: MCP é **somente leitura**; escrita exige opt-in (`MCP_WRITE_ENABLED=true`) e token separado. Todo handler recebe `userId` do contexto autenticado e nunca de um parâmetro da tool. Ferramentas de escrita destrutivas (apagar, reconciliar) **não** entram no registry de LLM; exigem a UI. Entradas validadas por Zod antes do handler; saídas com no máximo 50 itens e sem `rawDescription` completa (redaction, ADR-026).
6. **Idempotência**: tools de escrita aceitam `idempotencyKey` opcional (ex.: `telegram:UPDATE_ID`), armazenada e verificada no use-case.
7. **Observabilidade**: cada chamada de tool registra `{tool, source, ok, durationMs}` em log estruturado, sem payloads financeiros.
8. **Teste de arquitetura**: um teste Vitest falha se `app/api/**` ou `components/**` importar `infra/` (Prisma) diretamente.

## Alternativas consideradas
### Alternativa A — Cada canal com sua própria lógica
- Vantagens: rápido no começo; sem abstração.
- Desvantagens: divergência certa; correção de bug precisa ser feita 3 vezes; risco de pular a atualização de `AccountBalance` (ADR-019).

### Alternativa B — Bot e MCP chamando a API HTTP interna
- Vantagens: reaproveita rotas existentes.
- Desvantagens: autenticação de sessão por cookie não serve a bot/MCP; latência de rede interna e acoplamento a formatos HTTP.

### Alternativa C — Framework de agentes pronto (LangChain etc.)
- Vantagens: orquestração pronta.
- Desvantagens: dependência pesada, abstrações opacas e custo de tokens menos controlável (ADR-026).

## Consequências
### Positivas
- Uma regra, um lugar; novos canais custam um adaptador.
- Schemas Zod únicos para UI, LLM e MCP.

### Negativas
- Disciplina de camadas obrigatória.
- Registry vira ponto central: erros afetam todos os canais.

### Riscos
- Prompt injection via descrição de transação ou texto do usuário tentando acionar escrita: mitigação com `access` explícito, confirmação por botão no bot para escrita iniciada por LLM e sem tools destrutivas.
- Vazamento de dados por leitura ampla no MCP: limite de itens e campos.

## Plano de adoção
1. FC2-F2-03: `createFromDraft` como primeiro use-case-tool.
2. FC2-F5-01: registry, conversores OpenAI/MCP e teste de arquitetura.
3. FC2-F5-04 (bot), F5-06 (MCP), F5-05 (agentes) consomem o registry.

## Validação
- Teste de contrato: toda tool tem schema Zod, descrição e `access`.
- Teste: chamar `create_transaction` pelo bot e pela UI produz o mesmo estado de `AccountBalance`.
- MCP rejeita `write` sem `MCP_WRITE_ENABLED`.

## Revisão
Ao adicionar um quarto canal ou habilitar escrita no MCP em produção.

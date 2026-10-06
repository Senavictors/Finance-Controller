---
id: FC2-F5-06
title: Servidor MCP (Streamable HTTP, read-only por padrão)
status: backlog
type: feature
phase: F5
wave: 2
owner: api-servidor
depends_on: [FC2-F5-01]
created_at: 2026-10-05
updated_at: 2026-10-05
affected_modules: [tools, auth, mcp]
related_use_cases: []
related_adrs: [ADR-025, ADR-024, ADR-016]
---

# FC2-F5-06 — Servidor MCP (Streamable HTTP, read-only por padrão)

## Contexto
O dono usa Claude Code e Codex e quer perguntar aos próprios dados ("quanto gastei com mercado este ciclo?", "qual fatura vence primeiro?") de dentro dessas ferramentas. O padrão para isso é um servidor **MCP** (Model Context Protocol) remoto. ADR-025: as mesmas tools da F5-01 servem UI, bot, agentes e MCP; nenhuma lógica nova de domínio aqui. Spec §7: MCP **read-only** por padrão, escrita **opt-in**.

## Problema
Sem MCP, consultar os dados fora do app exige abrir o PWA ou usar o bot. Expor o banco direto a um cliente MCP seria perigoso; é preciso um endpoint autenticado, restrito às tools aprovadas, com escopo de leitura por padrão e rastreabilidade.

## Objetivo
Endpoint `src/app/api/mcp` falando **Streamable HTTP** que:
1. Autentica por **token** (Bearer) gerado pelo dono, com escopo `read` (padrão) ou `read+write` (opt-in explícito).
2. Expõe como MCP tools exatamente as tools da F5-01 permitidas ao escopo do token.
3. Tem gestão de tokens (criar, listar, revogar) e limites de uso.

## Fora de escopo
- OAuth/Dynamic Client Registration (necessário para alguns "connectors" web; ver riscos). Esta task cobre clientes que aceitam header `Authorization` (Claude Code, Codex, Inspector).
- Resources/prompts MCP (só tools).
- UI de gestão de tokens (F6; aqui API + script).
- Novas tools (usar as da F5-01).

## Comportamento atual
Registro de tools e `runTool`/`listTools` existem (F5-01) com `access: 'read' | 'write'` e `channel`. Auth do app é cookie de sessão (`src/server/auth/`), inadequada para clientes MCP. Não existe `src/app/api/mcp`.

## Comportamento esperado
### Transporte
Streamable HTTP **sem estado** (cada requisição é independente, compatível com funções serverless):
- `POST /api/mcp` recebe mensagens JSON-RPC (`initialize`, `tools/list`, `tools/call`, `ping`, notificações) e responde JSON (`enableJsonResponse`) — sem SSE longo.
- `GET /api/mcp` → `405` com `Allow: POST` (sem stream de servidor para cliente).
- `DELETE /api/mcp` → `405` (sem sessões).
- Implementação: avaliar `@modelcontextprotocol/sdk` com o transporte web-standard stateless (`sessionIdGenerator: undefined`) dentro do Route Handler; alternativa `mcp-handler` (Vercel) se o SDK não casar com o runtime do Next 16. Registrar a escolha em "Decisões". `runtime = 'nodejs'`, `maxDuration = 30`.
- Servidor MCP: `name: 'finance-controller'`, `version` do `package.json`. Capacidades declaradas: apenas `tools`.

### Tools expostas
Para cada tool do registro (F5-01) cujo `access` seja permitido pelo escopo do token: `name`, `description` e `inputSchema` (JSON Schema de `listTools`). `tools/call` → `runTool(registry, name, { userId: token.userId, channel: 'mcp', now }, args, { allowWrite: token.scopes.includes('write') })`. Resultado MCP: `content: [{ type: 'text', text: JSON.stringify(data) }]` e `structuredContent` com os dados; erro de domínio → `isError: true` com `code` e `message` (sem stack).
- Token `read`: `tools/list` **não lista** as tools `write` (nem aceita chamá-las: `WRITE_NOT_ALLOWED`).
- Token `read+write`: lista todas. As tools de escrita mantêm o fluxo em dois passos da F5-01 (`propose_transaction` → `commit_draft`), de modo que o cliente MCP mostre o rascunho antes de gravar.

### Autenticação por token
Tabela `McpToken { id, userId, name, tokenHash, prefix, scopes (String[]), createdAt, lastUsedAt?, expiresAt?, revokedAt? }`.
- Formato do token: `fcmcp_` + 32 bytes aleatórios em base64url (≈ 43 chars). Mostrado **uma única vez** na criação; no banco só `sha256(token)` e os 8 primeiros caracteres (`prefix`) para identificação.
- Header: `Authorization: Bearer {token}`. Comparação do hash em tempo constante (mesmo princípio de `secrets.ts`); token inexistente/revogado/expirado → `401` com `WWW-Authenticate: Bearer` e corpo JSON-RPC de erro; sem distinguir o motivo.
- Gestão (sessão do app): `POST /api/mcp-tokens` (`{ name, scopes: ['read'] | ['read','write'], expiresInDays? }` → devolve o token uma vez), `GET /api/mcp-tokens` (lista sem token), `DELETE /api/mcp-tokens/[id]` (revoga). Escopo `write` exige `confirmWrite: true` no corpo (opt-in explícito) e, adicionalmente, a variável `MCP_ALLOW_WRITE=true` no servidor (trava global; padrão ausente = escrita impossível mesmo com token `write`).
- Script `scripts/mcp-token.ts` (`npm run mcp:token -- --name claude-code`) cria token de leitura direto no banco para o primeiro uso, sem precisar de UI.

### Segurança de transporte
- **Validar `Origin`**: se a requisição trouxer `Origin`, deve estar na allowlist (`MCP_ALLOWED_ORIGINS`, padrão vazio = rejeitar requisições com Origin de navegador), protegendo contra DNS rebinding/CSRF; clientes CLI não enviam `Origin`.
- Rate limit por token: 60 requisições/minuto e 600/hora (reusar `src/server/auth/rate-limit.ts` ou equivalente por chave de token); `429` com `Retry-After`.
- Corpo ≤ 64 KB; resposta ≤ 200 KB (truncar listas com `nextCursor`).
- `lastUsedAt` atualizado no máximo 1 vez por minuto por token.

### Como o dono conecta (documentar)
```text
claude mcp add --transport http finance-controller https://SEU-APP.vercel.app/api/mcp \
  --header "Authorization: Bearer fcmcp_..."
```
Para Codex, configurar o servidor HTTP com o mesmo header conforme a documentação vigente do Codex. O token nunca vai para o repositório (`.env`/config local).

## Regras de negócio
- RN-01: **Read-only por padrão.** Token novo = `['read']`. Escrita exige `confirmWrite`, escopo `write` no token **e** `MCP_ALLOW_WRITE=true`.
- RN-02: O MCP expõe **somente** tools do registro da F5-01; nenhuma tool específica de MCP, nenhuma query livre/SQL, nenhum acesso a tokens, senhas ou tabelas administrativas.
- RN-03: Toda chamada é escopada ao `userId` do token (single-user, mas `userId` mantido por segurança, ADR-016).
- RN-04: Saídas seguem as garantias da F5-01 (sem campos sensíveis); o MCP não adiciona campos.
- RN-05: Token em claro nunca é persistido nem logado; resposta de criação é a única exibição.
- RN-06: Logs estruturados `{ tokenPrefix, method, tool?, ok, durationMs }` — sem argumentos nem resultados.
- RN-07: Revogar token tem efeito imediato (verificação a cada requisição, sem cache longo; cache em memória ≤ 30 s aceitável).
- RN-08: Expiração opcional por token; padrão sem expiração para uso pessoal, mas listagem destaca tokens sem uso há > 90 dias.
- RN-09: Chamadas de escrita via MCP exigem o mesmo fluxo de rascunho/confirmação da F5-01 e ficam marcadas `channel = 'mcp'` (auditoria por `source`).
- RN-10: Respostas de erro JSON-RPC seguem a especificação MCP (códigos `-32600`, `-32601`, `-32602`, `-32603`); tool inexistente → `-32602` ou erro de tool conforme o SDK.

## Critérios de aceitação
- [ ] CA-01: `initialize` com token válido responde com `serverInfo` e capacidade `tools`; sem token ou com token inválido/revogado retorna `401`.
- [ ] CA-02: `tools/list` com token `read` retorna só tools `read` e cada tool com `inputSchema` JSON Schema; com token `write` (e `MCP_ALLOW_WRITE=true`) retorna também as de escrita.
- [ ] CA-03: `tools/call get_available` retorna o mesmo dado que o use-case (equivalência) em `structuredContent`.
- [ ] CA-04: `tools/call propose_transaction` com token `read` retorna erro `WRITE_NOT_ALLOWED` sem tocar no banco.
- [ ] CA-05: Token `write` com `MCP_ALLOW_WRITE` ausente continua sem poder escrever (trava global).
- [ ] CA-06: Criar token devolve o valor uma única vez; `GET /api/mcp-tokens` nunca devolve token nem hash; revogar bloqueia a próxima chamada.
- [ ] CA-07: Requisição com `Origin` fora da allowlist retorna `403`; sem `Origin` (CLI) funciona.
- [ ] CA-08: Excesso de requisições retorna `429` com `Retry-After`; corpo > 64 KB retorna `413`.
- [ ] CA-09: `GET` e `DELETE` em `/api/mcp` retornam `405`.
- [ ] CA-10: Teste com o cliente do SDK MCP (ou MCP Inspector) conectando por HTTP e chamando `tools/list` e `tools/call` com sucesso (teste de integração automatizado com o cliente do SDK).
- [ ] CA-11: Nenhum log contém token, argumentos ou resultados (teste espiando `console`).
- [ ] CA-12: `npm run lint`, `npm test`, `npx next build` passam; `docs/integrations/mcp.md` documenta conexão, escopos e revogação.

## Impacto técnico
### Backend
Criar:
- `src/server/modules/mcp/domain/token.ts` (geração, hash, formato, comparação) + testes
- `src/server/modules/mcp/domain/scopes.ts` (decide tools visíveis e `allowWrite` a partir de escopo + `MCP_ALLOW_WRITE`) + testes
- `src/server/modules/mcp/application/create-token.ts`, `list-tokens.ts`, `revoke-token.ts`, `authenticate-token.ts`, `build-mcp-server.ts` (monta o servidor MCP com as tools do registro)
- `src/server/modules/mcp/infra/token-repository.ts`
- `src/server/modules/mcp/http/schemas.ts`
- `src/app/api/mcp/route.ts` (POST; GET/DELETE → 405), `src/app/api/mcp-tokens/route.ts` (POST, GET), `src/app/api/mcp-tokens/[id]/route.ts` (DELETE)
- `scripts/mcp-token.ts` + script no `package.json`
- Dependência: `@modelcontextprotocol/sdk` (ou `mcp-handler`, conforme decisão). `.env.example`: `MCP_ALLOW_WRITE`, `MCP_ALLOWED_ORIGINS`.
- Autenticação do endpoint: a F0-06 já deixa `/api/mcp` passar pelo `proxy.ts` sem cookie e entrega `requireMcpToken()` em `src/server/auth/secrets.ts` (hoje compara com a env `MCP_TOKEN`). Esta task **estende** esse guard: primeiro tenta tokens `fcmcp_` da tabela `McpToken` (com escopo) e, como bootstrap, aceita a env `MCP_TOKEN` (se definida) com escopo **somente leitura**. Mantém fail closed (sem token válido nem env, nega).

### Frontend
Nenhum.

### Banco de dados
Migration `add_mcp_tokens` (`McpToken`, índice único em `tokenHash`).

### Integrações
Clientes MCP (Claude Code, Codex, MCP Inspector).

### Segurança
Bearer com hash sha256; comparação em tempo constante; read-only por padrão com trava global para escrita; `Origin` validado; rate limit; sem logs de conteúdo; tokens revogáveis; nenhuma tool fora do registro.

## Plano de implementação
- [ ] 1. Ler o registro e `runTool`/`listTools` (F5-01), `src/server/auth/rate-limit.ts`, `src/server/auth/secrets.ts` e `proxy.ts` (F0-06) e a documentação atual do SDK MCP (transporte web-standard stateless).
- [ ] 2. Spike curto: Route Handler mínimo com o SDK respondendo `initialize` e `tools/list` em `next build` + `next start`; decidir SDK vs `mcp-handler`; registrar a decisão.
- [ ] 3. `token.ts` e `scopes.ts` com TDD.
- [ ] 4. Migration `add_mcp_tokens` (via `dados-prisma`) e repositório.
- [ ] 5. `authenticate-token` + rate limit + validação de `Origin` + limites de tamanho.
- [ ] 6. `build-mcp-server` mapeando as tools da F5-01 (visibilidade por escopo, `runTool` com `channel = 'mcp'`).
- [ ] 7. Rotas `api/mcp` e `api/mcp-tokens`; script `mcp:token`.
- [ ] 8. Teste de integração com o cliente do SDK (CA-10) e testes de segurança (CA-04, 05, 07, 08, 11).
- [ ] 9. Documentar (`docs/integrations/mcp.md`: conexão no Claude Code/Codex, escopos, revogação, limitações); atualizar `CONTEXT.md`.

## Estratégia de testes
- [ ] Unitários: token (`fcmcp_` + comprimento, hash determinístico, nunca igual entre dois tokens, `prefix` de 8); `scopes` (`['read']` → só read; `['read','write']` sem `MCP_ALLOW_WRITE` → só read; com flag → todas); validação de `Origin` (ausente, na allowlist, fora); formatação de resultado MCP (dados e `isError`).
- [ ] Integração: ciclo completo create → initialize → list → call → revoke → 401; token expirado; token de outro usuário não vê dados do primeiro; `tools/call` com argumentos inválidos devolve erro de validação sem stack; paginação (`limit` máximo); rate limit com relógio injetado; corpo grande.
- [ ] E2E: cliente do SDK MCP contra `next start` (ou servidor de teste) em CI local.
- [ ] Manual: `claude mcp add --transport http ...` com token de leitura e perguntar "quanto está livre?" em ambiente com dados sintéticos; revogar e confirmar falha.

## Riscos e rollback
- **Clientes que exigem OAuth** (ex.: conectores web) não funcionam só com Bearer estático: fora de escopo; avaliar OAuth em task futura se necessário.
- **Token vazado** dá leitura de todos os dados financeiros: tokens curtos de uso, revogação imediata, prefixo visível, `lastUsedAt` para detectar uso estranho; recomendação de nunca colocar o token em repositório.
- **Escrita via LLM**: bloqueada por padrão com três travas; fluxo de rascunho preserva confirmação humana no cliente.
- **SDK instável em serverless**: modo stateless + fallback `mcp-handler`.
- Rollback: remover as rotas e a tabela desliga o MCP sem afetar o resto; `MCP_ALLOW_WRITE` ausente é o "freio de mão" de escrita.

## Registro de execução
### Alterações realizadas
### Arquivos principais
### Decisões
### Divergências
### Pendências

## Validação

## Handoff

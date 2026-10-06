---
id: FC2-F0-06
title: Auth single-user com sessão longa renovável
status: active
type: refactor
phase: F0
wave: 3
owner: api-servidor
depends_on: [FC2-F0-02]
created_at: 2026-10-05
updated_at: 2026-10-05
affected_modules: [auth, proxy, scripts, api]
related_use_cases: [login, logout, getSession, createOwner]
related_adrs: [ADR-016, ADR-027, ADR-030]
---

# FC2-F0-06 — Auth single-user com sessão longa renovável

## Contexto
O app é de uso pessoal (um único usuário), instalado como PWA no iPhone e também acessado por jobs (Vercel Cron), bot (Telegram webhook) e MCP. O 1.x tem auth própria: cookie `fc_session` HttpOnly, token aleatório em claro na tabela `sessions`, duração fixa de 7 dias, cadastro público em `/register`, limitador de tentativas em memória e `middleware.ts` com lista de rotas protegidas. A F0-01 removeu registro/troca de senha; a F0-02 trocou `Session.token` por `tokenHash` + `lastSeenAt`. Esta task fecha a segurança de acesso.

## Problema
- Sessão de 7 dias obriga logar toda semana no celular (atrito que mata hábito).
- O middleware protege uma lista de prefixos; qualquer rota nova fica aberta por esquecimento.
- Não há como criar o dono sem um endpoint público (removido): falta um script/CLI.
- O limitador de tentativas em memória não funciona em serverless (cada instância tem o seu).
- Jobs, webhook e MCP precisam de autenticação própria sem passar pelo cookie.

## Objetivo
1. Sessão longa (90 dias) com **renovação deslizante**.
2. Proteção por padrão de **todas** as rotas via proxy (allowlist explícita de públicas).
3. Remoção definitiva do cadastro público; criação do dono por script local.
4. Limitação de tentativas persistida no banco.
5. Contrato de autenticação para rotas não-cookie (cron, Telegram, MCP).

## Fora de escopo
- Multi-usuário, OAuth, passkeys/WebAuthn, 2FA (futuro; registrar em Pendências).
- Tela de configurações/trocar senha (usar o script `owner:set-password`).
- Implementação do bot, cron e MCP (F3/F5): aqui só se define e testa o guard de cada um.
- Rotação de `SESSION_SECRET` (o token de sessão é aleatório e guardado como hash; o segredo só assina o cookie auxiliar, se usado).

## Comportamento atual
- `src/server/auth/session.ts`: `SESSION_DURATION_MS = 7 dias`; `createSession(userId)` cria linha com token e grava cookie `fc_session` (`httpOnly`, `secure` em produção, `sameSite: 'lax'`, `path: '/'`, `expires`); `validateSession()` lê o cookie, busca a sessão e apaga se expirada; `invalidateOtherSessions`; `destroySession`. Após F0-02 usa `tokenHash`.
- `src/server/auth/guard.ts`: `requireAuth()` lança `AuthError` -> rotas respondem 401.
- `src/server/auth/rate-limit.ts`: `Map` em memória, 5 tentativas / 15 min por chave.
- `middleware.ts` (raiz): checa só a existência do cookie e só para `PROTECTED_ROUTES`; matcher exclui `api`, estáticos e imagens (portanto **API fica fora do middleware**).
- `src/app/api/auth/{login,logout,me}/route.ts` e `src/app/(auth)/login/*`.
- `src/server/auth/password.ts`: bcrypt (`hashPassword`, `verifyPassword`); schemas Zod em `schemas.ts` (`loginSchema`).

## Comportamento esperado
### Sessão (90 dias, deslizante)
- `SESSION_TTL_DAYS = 90`; `RENEW_AFTER_HOURS = 24`.
- Login cria `Session` com `tokenHash = sha256(token)`, `expiresAt = now + 90d`, `lastSeenAt = now`, `userAgent`; cookie `fc_session` = token bruto (32 bytes hex), `httpOnly`, `secure` (produção), `sameSite: 'lax'`, `path: '/'`, `maxAge = 90d`.
- `validateSession()`: se não há cookie ou hash inexistente ou `expiresAt < now` -> `null` (e apaga a linha expirada). Se `now - lastSeenAt > 24h` -> `UPDATE sessions SET lastSeenAt = now, expiresAt = now + 90d` (no máximo 1 escrita por dia por sessão).
- **Renovação do cookie**: Server Components não podem gravar cookies. Portanto a renovação do cookie acontece no **proxy** (resposta de navegação `GET` com cookie presente): reemite `fc_session` com os mesmos atributos e `maxAge` de 90 dias, no máximo 1 vez por dia (controlado por cookie auxiliar não sensível `fc_session_r` = dia juliano da última emissão). O banco é a fonte de verdade da expiração; o cookie é só o portador.
- Logout apaga a linha e o cookie. "Sair de todos os dispositivos": `invalidateOtherSessions` mantido.

### Proxy protegendo todas as rotas
Next.js 16: o arquivo de borda é `proxy.ts` (substitui `middleware.ts`, que continua aceito mas deprecado; confirmar na versão instalada e usar `proxy.ts` exportando `proxy`). O proxy:
1. Define `PUBLIC_PATHS` (allowlist exata/prefixo): `/login`, `/api/auth/login`, `/manifest.webmanifest`, `/icons/`, `/_next/`, `/favicon.ico`, `/brands/`, `/api/health` (se existir).
2. Define `TOKEN_PATHS` (autenticação própria, não cookie): `/api/cron/` (header `Authorization: Bearer ${CRON_SECRET}`), `/api/telegram/webhook` (header `X-Telegram-Bot-Api-Secret-Token` = `TELEGRAM_WEBHOOK_SECRET`), `/api/mcp` (Bearer `MCP_TOKEN`). O proxy **deixa passar** esses caminhos e o próprio handler valida com os guards `requireCronSecret()`, `requireTelegramSecret()`, `requireMcpToken()` (comparação em tempo constante, `crypto.timingSafeEqual`); sem o segredo configurado o guard nega (fail closed).
3. Para qualquer outro caminho: sem cookie `fc_session` -> navegação (`Accept: text/html`) redireciona para `/login?callbackUrl=` seguido do caminho de origem (somente caminhos internos começando com `/`, validar para evitar open redirect); requisição de API (`/api/*`) -> `401 {"error":"Unauthorized"}`.
4. Com cookie e acessando `/login` -> redireciona para `/hoje`.
5. O matcher cobre tudo exceto assets estáticos do Next; **nenhum prefixo de rota de produto é listado** (proteção por padrão).
A verificação no proxy é otimista (existência do cookie). A validação real (hash no banco) ocorre em `requireAuth()` (rotas/ações) e no `(app)/layout.tsx`. Nunca confiar só no proxy.

### Cadastro do dono por script
- `scripts/create-owner.ts` (`npm run owner:create`): lê `OWNER_EMAIL` e `OWNER_NAME` do ambiente ou por prompt; a senha **sempre** por prompt sem eco (nunca por argumento nem arquivo versionado); mínimo 12 caracteres, máximo 72 (limite do bcrypt); confirma duas vezes. Recusa se já existir algum `User` (single-user); `--reset-password` (`npm run owner:set-password`) troca a senha do único usuário e encerra todas as sessões. Cria `UserSettings` com defaults. Usa `DATABASE_URL` do `.env`.
- Remover qualquer rota/página de cadastro (conferir ausência de `/register` e `/api/auth/register`).
- `.env.example`: documentar `SESSION_SECRET` (usado só para assinar o cookie auxiliar, se mantido), `CRON_SECRET`, `TELEGRAM_WEBHOOK_SECRET`, `MCP_TOKEN` (comentados; valores de exemplo são `change-me`).

### Limitação de tentativas persistida
Substituir `rate-limit.ts` por consulta em `LoginAttempt`: chave `sha256(ip + '|' + email)`; bloquear quando houver >= 5 falhas nos últimos 15 minutos (resposta `429` com `Retry-After`); falha de login adiciona linha; sucesso limpa a chave. Limpeza oportunista de linhas > 24h no próprio login. Mensagem de erro de credenciais é única (não revela se o e-mail existe).

### Login
`POST /api/auth/login` valida `loginSchema`, aplica a limitação, compara bcrypt (executar `verifyPassword` contra hash fictício quando o usuário não existe, para tempo uniforme), cria sessão, responde `{ user: { id, name, email } }`. Página `/login` em dark glass usando primitivos `fc/*` (campo e-mail, senha, botão); após sucesso redireciona para `callbackUrl` válido ou `/hoje`.

## Regras de negócio
- RN-01: Existe no máximo **um** usuário; não há cadastro por HTTP.
- RN-02: Sessão dura 90 dias a partir do último uso (deslizante, escrita no banco no máximo 1x/24h).
- RN-03: O token de sessão só existe em claro no cookie; no banco fica o SHA-256.
- RN-04: Toda rota é protegida por padrão; públicas e de token são allowlists explícitas e testadas.
- RN-05: Segredos de cron/Telegram/MCP ausentes = acesso negado (fail closed); comparação em tempo constante.
- RN-06: `callbackUrl` só aceita caminho relativo interno (`/^\/(?!\/)/`); qualquer outro vira `/hoje`.
- RN-07: 5 falhas em 15 minutos bloqueiam novas tentativas daquela chave por até 15 minutos.
- RN-08: Nunca logar senha, token ou hash.

## Critérios de aceitação
- [ ] CA-01: Sem cookie, `GET /hoje`, `/lancamentos`, `/planejar`, `/cartoes`, `/mais` e qualquer caminho inventado (`/qualquer-coisa`) redirecionam (307) para `/login?callbackUrl=...`; `GET /api/accounts` (ou qualquer `/api/*` fora das allowlists) retorna 401 JSON.
- [ ] CA-02: `/login`, `/api/auth/login`, `/manifest.webmanifest`, `/icons/icon-192.png` respondem sem cookie.
- [ ] CA-03: `POST /api/cron/qualquer` sem `Authorization` retorna 401; com o header `Authorization: Bearer` + valor correto de `CRON_SECRET` passa pelo guard; com `CRON_SECRET` não configurado retorna 401 mesmo com header. Mesmo contrato para `/api/telegram/webhook` (`X-Telegram-Bot-Api-Secret-Token`) e `/api/mcp` (Bearer `MCP_TOKEN`).
- [ ] CA-04: Login com credenciais válidas cria linha em `sessions` com `token_hash` de 64 hex (nunca o token), `expires_at ≈ now + 90d`, e o cookie tem `HttpOnly`, `SameSite=Lax`, `Max-Age=7776000` (e `Secure` em produção).
- [ ] CA-05: Uma sessão com `lastSeenAt` de 2 dias atrás, ao navegar, tem `expiresAt` e `lastSeenAt` atualizados; uma com `lastSeenAt` de 2 horas atrás **não** gera escrita (verificar por contagem de updates em teste com repositório falso).
- [ ] CA-06: Uma sessão com `expiresAt` no passado é rejeitada e removida; o usuário cai em `/login`.
- [ ] CA-07: `npm run owner:create` cria o primeiro usuário e recusa o segundo com mensagem clara; `--reset-password` encerra as demais sessões; senha < 12 caracteres é recusada; a senha nunca aparece em argumentos de processo (`ps`) nem em logs.
- [ ] CA-08: `GET /register` e `POST /api/auth/register` retornam 404; `grep -ri "register" src` não encontra rota/ação de cadastro.
- [ ] CA-09: 5 logins errados seguidos para a mesma chave retornam `429` com `Retry-After`; o 6º com a senha correta também retorna 429 até a janela expirar; mensagens de erro de e-mail inexistente e senha errada são idênticas.
- [ ] CA-10: `callbackUrl=https://evil.example` e `//evil.example` redirecionam para `/hoje` após o login.
- [ ] CA-11: `npm run lint`, `npm test`, `npx next build`, `npm run format:check` passam.

## Impacto técnico
### Backend
`src/server/auth/{session,guard,rate-limit,schemas,password}.ts` revistos; novos `src/server/auth/secrets.ts` (`requireCronSecret`, `requireTelegramSecret`, `requireMcpToken`), `src/server/auth/redirect.ts` (`safeCallbackUrl`), `src/server/auth/session-policy.ts` (funções puras: `shouldRenew(lastSeenAt, now)`, `nextExpiry(now)`, `isExpired`). Rotas `api/auth/{login,logout,me}`. Scripts em `scripts/`. `proxy.ts` na raiz (remove `middleware.ts`).
### Frontend
`src/app/(auth)/login/*` com primitivos `fc/*` (dark glass). Sem registro.
### Banco de dados
Usa `Session.tokenHash`, `lastSeenAt`, `LoginAttempt` (já criados na F0-02). Sem nova migration; se faltar coluna, abrir pendência para a F0-02 em vez de alterar aqui.
### Integrações
Contrato de segredos para Vercel Cron (header `Authorization: Bearer` com o valor de `CRON_SECRET`, que a Vercel envia quando a variável existe), Telegram (secret token do `setWebhook`) e MCP.
### Segurança
Superfície mínima: sem cadastro, hash de token, comparação em tempo constante, redirect aberto bloqueado, brute force limitado em banco, fail closed. Cookies HttpOnly/Secure/Lax. Em PWA iOS o cookie da instalação é separado do Safari: logar uma vez dentro da PWA.

## Plano de implementação
- [ ] Etapa 1 — Ler `src/server/auth/*`, `middleware.ts`, `src/app/api/auth/*`, `src/app/(auth)/login/*`, o schema 2.0 (`Session`, `LoginAttempt`) e a documentação do Next 16 sobre `proxy`.
- [ ] Etapa 2 — `session-policy.ts` + `session-policy.test.ts` (funções puras); `redirect.ts` + testes; `secrets.ts` + testes.
- [ ] Etapa 3 — Reescrever `session.ts` (hash, 90 dias, renovação limitada) e `rate-limit.ts` (banco) com repositório injetável para teste.
- [ ] Etapa 4 — Criar `proxy.ts` conforme o contrato; remover `middleware.ts`; testes do roteador de decisão em módulo puro `src/server/auth/proxy-rules.ts` (`decide({pathname, hasCookie, accept}) -> 'next' | 'redirect-login' | 'redirect-home' | 'unauthorized'`).
- [ ] Etapa 5 — Rotas `login`/`logout`/`me`; página de login com primitivos; remover resquícios de registro.
- [ ] Etapa 6 — `scripts/create-owner.ts` + scripts no `package.json` (`owner:create`, `owner:set-password`); entrada de senha sem eco com `readline` + `stdin.setRawMode`.
- [ ] Etapa 7 — `.env.example`; docs em `docs/` (fluxo de auth e variáveis); `.agents/context/CONTEXT.md`.
- [ ] Etapa 8 — Verificações manuais (CA-01 a CA-10) com `curl` e navegador; commit `refactor(f0-06): auth single-user com sessão longa`.

## Estratégia de testes
- [ ] Unitários: `session-policy`: `shouldRenew` com diferença de 23h59 (false), 24h (true), 90d (true); `isExpired` no limite exato; `nextExpiry` = +90d. `proxy-rules.decide`: tabela com `/login` com/sem cookie, `/hoje` sem cookie (redirect), `/api/x` sem cookie (unauthorized), `/api/cron/job` (next), `/api/telegram/webhook` (next), `/_next/static/x.js` (next), `//evil` etc. `safeCallbackUrl('/hoje')`, `('//evil.com')`, `('https://x')`, `('/\\evil')`, `('')`, `(undefined)`. `secrets`: segredo ausente nega; header com comprimento diferente nega sem lançar; correto passa. Rate limit: 4 falhas permitem, 5ª bloqueia, sucesso zera, janela expira (relógio injetado).
- [ ] Integração: `login` com repositório falso: usuário inexistente executa bcrypt fictício (assert de chamada) e devolve a mesma resposta; sessão criada com hash; cookie com atributos corretos.
- [ ] E2E: não há runner; roteiro manual com `curl -i` e navegador.
- [ ] Manual: instalar PWA no iPhone, logar, fechar e reabrir após horas: continua logado; simular `lastSeenAt` antigo no banco e confirmar renovação.

## Riscos e rollback
- **Cookie não renovado** em páginas servidas do cache/prefetch: aceitável, pois o banco renova e o cookie original ainda vale 90 dias; em pior caso o usuário loga após 90 dias sem abrir o app.
- **`proxy.ts` x `middleware.ts`**: se a versão do Next instalada ainda não reconhecer `proxy.ts`, manter `middleware.ts` com o mesmo conteúdo e registrar em Divergências.
- **Lockout do próprio dono** por tentativas falhas: o bloqueio expira em 15 min; `owner:set-password` limpa `LoginAttempt` e sessões.
- **Segredos de cron/MCP vazados**: rotacionar na Vercel; os guards são fail closed.
- Rollback: `git revert`; restaurar `middleware.ts` do commit anterior. Sessões existentes (7 dias) continuam válidas após revert porque o formato do banco (hash) é o da F0-02.

## Registro de execução
### Alterações realizadas
### Arquivos principais
### Decisões
### Divergências
### Pendências

## Validação
Comandos e resultados.

## Handoff
Link para o handoff ativo, quando aplicável.

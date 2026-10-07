---
id: FC2-F0-06
title: Auth single-user com sessão longa renovável
status: completed
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
- [x] CA-01: Sem cookie, `GET /hoje`, `/lancamentos`, `/planejar`, `/cartoes`, `/mais` e qualquer caminho inventado (`/qualquer-coisa`) redirecionam (307) para `/login?callbackUrl=...`; `GET /api/accounts` (ou qualquer `/api/*` fora das allowlists) retorna 401 JSON. — **Evidência**: verificado com `next start` + `curl` (307 para `/login?callbackUrl=...` em `/hoje`, `/lancamentos`, `/planejar`, `/cartoes`, `/mais`, `/qualquer-coisa` e `/`; `/api/accounts`, `/api/auth/me` e `/api/auth/logout` respondem 401 JSON)
- [x] CA-02: `/login`, `/api/auth/login`, `/manifest.webmanifest`, `/icons/icon-192.png` respondem sem cookie. — **Evidência**: `/login` e `/favicon.ico` 200 sem cookie; `/api/auth/login` chega ao handler (400 com corpo vazio); `/manifest.webmanifest` e `/icons/icon-192.png` passam pelo proxy (404 aqui apenas porque os arquivos pertencem à FC2-F0-05; reconferir após a integração)
- [x] CA-03: `POST /api/cron/qualquer` sem `Authorization` retorna 401; com o header `Authorization: Bearer` + valor correto de `CRON_SECRET` passa pelo guard; com `CRON_SECRET` não configurado retorna 401 mesmo com header. Mesmo contrato para `/api/telegram/webhook` (`X-Telegram-Bot-Api-Secret-Token`) e `/api/mcp` (Bearer `MCP_TOKEN`). — **Evidência**: verificado com `curl` e segredos fictícios só no ambiente do comando: sem header 401, errado 401, correto passa pelo proxy (404 porque ainda não há handler), segredo não configurado 401 mesmo com header, nos três contratos; guards testados em `secrets.test.ts`
- [x] CA-04: Login com credenciais válidas cria linha em `sessions` com `token_hash` de 64 hex (nunca o token), `expires_at ≈ now + 90d`, e o cookie tem `HttpOnly`, `SameSite=Lax`, `Max-Age=7776000` (e `Secure` em produção). — **Evidência**: coberto por teste com repositório falso; verificação real pendente da FC2-F0-08 (`session-service.test.ts`; atributos do cookie em `session-policy.test.ts`)
- [x] CA-05: Uma sessão com `lastSeenAt` de 2 dias atrás, ao navegar, tem `expiresAt` e `lastSeenAt` atualizados; uma com `lastSeenAt` de 2 horas atrás **não** gera escrita (verificar por contagem de updates em teste com repositório falso). — **Evidência**: coberto por teste com repositório falso; verificação real pendente da FC2-F0-08 (`session-service.test.ts`: contagem de `touch`)
- [x] CA-06: Uma sessão com `expiresAt` no passado é rejeitada e removida; o usuário cai em `/login`. — **Evidência**: coberto por teste com repositório falso; verificação real pendente da FC2-F0-08 (`session-service.test.ts`; a página `/login` não entra em laço com cookie obsoleto)
- [x] CA-07: `npm run owner:create` cria o primeiro usuário e recusa o segundo com mensagem clara; `--reset-password` encerra as demais sessões; senha < 12 caracteres é recusada; a senha nunca aparece em argumentos de processo (`ps`) nem em logs. — **Evidência**: coberto por teste com repositório falso; verificação real pendente da FC2-F0-08 (`owner.test.ts`; o script recusa execução fora de TTY e a senha só vem de prompt sem eco)
- [x] CA-08: `GET /register` e `POST /api/auth/register` retornam 404; `grep -ri "register" src` não encontra rota/ação de cadastro. — **Evidência**: `/register` e `/api/auth/register` não existem (404 quando o cookie está presente; sem cookie o proxy redireciona antes, por CA-01); `grep -ri register src` só acha asserções negativas em `proxy-rules.test.ts`
- [x] CA-09: 5 logins errados seguidos para a mesma chave retornam `429` com `Retry-After`; o 6º com a senha correta também retorna 429 até a janela expirar; mensagens de erro de e-mail inexistente e senha errada são idênticas. — **Evidência**: coberto por teste com repositório falso; verificação real pendente da FC2-F0-08 (`login.test.ts`, `rate-limit.test.ts`)
- [x] CA-10: `callbackUrl=https://evil.example` e `//evil.example` redirecionam para `/hoje` após o login. — **Evidência**: `safeCallbackUrl` testado com `https://evil.example`, `//evil.example`, `/\evil` etc. (`redirect.test.ts`); a página `/login` aplica o filtro no servidor
- [x] CA-11: `npm run lint`, `npm test`, `npx next build`, `npm run format:check` passam. — **Evidência**: `npm run lint`, `npm test`, `npx next build` (sem migrate) e prettier dos arquivos tocados passam; `format:check` global falha em arquivos preexistentes de `docs/` (fora do escopo)

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
- [x] Etapa 1 — Ler `src/server/auth/*`, `middleware.ts`, `src/app/api/auth/*`, `src/app/(auth)/login/*`, o schema 2.0 (`Session`, `LoginAttempt`) e a documentação do Next 16 sobre `proxy`.
- [x] Etapa 2 — `session-policy.ts` + `session-policy.test.ts` (funções puras); `redirect.ts` + testes; `secrets.ts` + testes.
- [x] Etapa 3 — Reescrever `session.ts` (hash, 90 dias, renovação limitada) e `rate-limit.ts` (banco) com repositório injetável para teste.
- [x] Etapa 4 — Criar `proxy.ts` conforme o contrato; remover `middleware.ts`; testes do roteador de decisão em módulo puro `src/server/auth/proxy-rules.ts` (`decide({pathname, hasCookie, accept}) -> 'next' | 'redirect-login' | 'redirect-home' | 'unauthorized'`).
- [x] Etapa 5 — Rotas `login`/`logout`/`me`; página de login com primitivos; remover resquícios de registro.
- [x] Etapa 6 — `scripts/create-owner.ts` + scripts no `package.json` (`owner:create`, `owner:set-password`); entrada de senha sem eco com `readline` + `stdin.setRawMode`.
- [x] Etapa 7 — `.env.example`; docs em `docs/` (fluxo de auth e variáveis); `.agents/context/CONTEXT.md`.
- [x] Etapa 8 — Verificações manuais (CA-01 a CA-10) com `curl` e navegador; commit `refactor(f0-06): auth single-user com sessão longa`.

## Estratégia de testes
- [x] Unitários: `session-policy`: `shouldRenew` com diferença de 23h59 (false), 24h (true), 90d (true); `isExpired` no limite exato; `nextExpiry` = +90d. `proxy-rules.decide`: tabela com `/login` com/sem cookie, `/hoje` sem cookie (redirect), `/api/x` sem cookie (unauthorized), `/api/cron/job` (next), `/api/telegram/webhook` (next), `/_next/static/x.js` (next), `//evil` etc. `safeCallbackUrl('/hoje')`, `('//evil.com')`, `('https://x')`, `('/\\evil')`, `('')`, `(undefined)`. `secrets`: segredo ausente nega; header com comprimento diferente nega sem lançar; correto passa. Rate limit: 4 falhas permitem, 5ª bloqueia, sucesso zera, janela expira (relógio injetado).
- [x] Integração: `login` com repositório falso: usuário inexistente executa bcrypt fictício (assert de chamada) e devolve a mesma resposta; sessão criada com hash; cookie com atributos corretos.
- [x] E2E: não há runner; roteiro manual com `curl -i` e navegador.
- [ ] Manual: instalar PWA no iPhone, logar, fechar e reabrir após horas: continua logado; simular `lastSeenAt` antigo no banco e confirmar renovação.

## Riscos e rollback
- **Cookie não renovado** em páginas servidas do cache/prefetch: aceitável, pois o banco renova e o cookie original ainda vale 90 dias; em pior caso o usuário loga após 90 dias sem abrir o app.
- **`proxy.ts` x `middleware.ts`**: se a versão do Next instalada ainda não reconhecer `proxy.ts`, manter `middleware.ts` com o mesmo conteúdo e registrar em Divergências.
- **Lockout do próprio dono** por tentativas falhas: o bloqueio expira em 15 min; `owner:set-password` limpa `LoginAttempt` e sessões.
- **Segredos de cron/MCP vazados**: rotacionar na Vercel; os guards são fail closed.
- Rollback: `git revert`; restaurar `middleware.ts` do commit anterior. Sessões existentes (7 dias) continuam válidas após revert porque o formato do banco (hash) é o da F0-02.

## Registro de execução
### Alterações realizadas

- Sessão de 90 dias deslizante: política pura (`session-policy.ts`), regras com repositório e relógio injetados (`session-service.ts`), adaptador de cookie (`session.ts`). Token aleatório de 32 bytes; no banco só o SHA-256 (`token_hash`). Escrita no banco no máximo 1x/24h por sessão.
- Reemissão do cookie `fc_session` pelo proxy (no máximo 1x/dia, marca em `fc_session_r`).
- `src/proxy.ts` substitui `middleware.ts` (removido): proteção por padrão com allowlists (`proxy-rules.ts`), 401 JSON para `/api/*`, redirect para `/login?callbackUrl=` nas páginas; rotas de cron/Telegram/MCP têm o segredo verificado também no proxy (fail closed).
- Limite de tentativas em `LoginAttempt` (`rate-limit.ts`), substituindo o `Map` em memória: 5 falhas/15 min, `429` com `Retry-After`.
- Use-case `login` (bcrypt fictício para tempo uniforme, mensagem única), `getCurrentUser`, rotas `login`/`logout`/`me` finas, mensagens em pt-BR.
- Página `/login` e layout de `(auth)` reescritos com `GlassCard`, `Field`, `Button`, `Banner` e tokens `--fc-*`; `callbackUrl` filtrado no servidor (`redirect.ts`).
- `secrets.ts`: `requireCronSecret`, `requireTelegramSecret`, `requireMcpToken` (SHA-256 + `timingSafeEqual`).
- `scripts/create-owner.ts` + `src/server/auth/owner.ts` (lógica pura): `owner:create` e `owner:set-password`.
- `.env.example`, `docs/security/autenticacao.md` (novo), `docs/security/README.md`, `docs/architecture/deployment.md`.

### Arquivos principais

`src/proxy.ts`; `src/server/auth/{session-policy,session-service,session,rate-limit,login,secrets,redirect,proxy-rules,owner,ports,prisma-repositories,current-user,errors,schemas,guard,index}.ts` e os `*.test.ts` correspondentes; `tests/helpers/auth-fakes.ts`; `src/app/api/auth/{login,logout,me}/route.ts`; `src/app/(auth)/{layout.tsx,login/page.tsx,login/login-form.tsx}`; `scripts/create-owner.ts`; `package.json` (scripts `owner:*`); `.env.example`; `docs/security/autenticacao.md`.

### Decisões

- O proxy também verifica o segredo de `/api/cron`, `/api/telegram/webhook` e `/api/mcp` (o Next 16 roda o proxy em Node.js). `decide()` continua devolvendo `next` para esses caminhos, como na especificação. Motivo: os handlers só existem nas fases F3/F5; sem isso essas rotas ficariam abertas até lá, e CA-03 não seria verificável.
- Os handlers futuros devem chamar `requireCronSecret`/`requireTelegramSecret`/`requireMcpToken` (defesa em profundidade).
- `SESSION_SECRET` ficou reservado e não é lido: o cookie auxiliar `fc_session_r` não é sensível e não é assinado.
- `isExpired` usa `expiresAt <= now` (o instante exato conta como expirada).
- A mensagem de 401 do proxy e das rotas é `{"error":"Não autorizado"}` (pt-BR, regra do projeto); a especificação citava `Unauthorized`.
- `AuthError` migrou para `errors.ts` para os guards de segredo não importarem `next/headers` nem Prisma.

### Divergências

- **`proxy.ts` fica em `src/proxy.ts`, não na raiz.** Como o projeto usa `src/app`, o Next só detecta o proxy dentro de `src/`; na raiz ele não rodava (provado: com o arquivo na raiz nenhuma rota era protegida pelo proxy e o build não listava "Proxy"). O `middleware.ts` na raiz do 1.x também nunca era carregado.
- **`/login` com cookie não é redirecionado pelo proxy** (a especificação pedia `/hoje`). Redirecionar só pela existência do cookie cria laço quando o cookie está obsoleto (`/login` -> `/hoje` -> layout de `(app)` -> `/login`). A página `/login` valida a sessão no banco e redireciona para `callbackUrl` válido ou `/hoje`.
- **CA-01 x CA-08**: `GET /register` sem cookie recebe 307 para `/login` (proteção por padrão); com cookie, 404.
- `/manifest.webmanifest`, `/icons/*`, `/apple-touch-icon.png` estão na allowlist, mas os arquivos vêm da FC2-F0-05.
- O hash fictício (`DUMMY_PASSWORD_HASH`) é um bcrypt de um valor aleatório descartado, não de senha real.

### Pendências

- Verificação real dos CA-04, 05, 06, 07 e 09 contra o banco após o reset do Neon (FC2-F0-08); roteiro em `docs/security/autenticacao.md`.
- `(app)/layout.tsx` (F0-05) deve manter `validateSession()` + `redirect('/login')`; o laço é evitado pela página de login.
- Handlers de cron/Telegram/MCP (F3/F5) chamam os guards `require*` de `secrets.ts`.
- Teste manual em PWA no iPhone (logar, reabrir horas depois).
- Futuro: 2FA/passkeys, tela de troca de senha, rotação de segredos.
- `format:check` global falha em 18 arquivos preexistentes de `docs/` (fora desta task).

## Validação
Executado no worktree (`DATABASE_URL` fictícia só para o build; sem banco; nenhum `migrate`):

- `npm run lint`: sem erros nem avisos.
- `npm test`: 22 arquivos, 270 testes passando (novos: `session-policy`, `redirect`, `secrets`, `proxy-rules`, `rate-limit`, `session-service`, `login`, `owner`, `schemas`).
- `npx tsc --noEmit`: sem erros.
- `npx next build`: ok; lista `ƒ Proxy (Middleware)`.
- `npx prettier --check --end-of-line auto` nos arquivos de código tocados: ok.
- `next start -p 3108` + `curl` (encerrado depois): CA-01, CA-02, CA-03 e fail closed conforme a tabela de evidências; reemissão do cookie: com `fc_session` e sem `fc_session_r` o proxy envia `Set-Cookie` de ambos (`Max-Age=7776000; HttpOnly; SameSite=lax; Secure`); com a marca do dia, POST ou `/api/*`, não envia.
- `npx tsx scripts/create-owner.ts < /dev/null`: recusa fora de TTY (exit 1) antes de tocar no banco; o `@/server/db` carrega sob `tsx`.
- `grep -ri register src`: só asserções negativas em `proxy-rules.test.ts`.

### Parecer QA (qa-revisor): APROVADO com 1 achado importante

Comandos (HEAD `10f810d`): `prisma generate` ok; `npm run lint` sem erros; `npm run typecheck` ok; `npm test` 30 arquivos / 353 testes passando; `npm run guard:data` 3 arquivos / 54 testes passando; `prettier --check --end-of-line auto .` ok (tudo formatado); `DATABASE_URL=<fictícia> npx next build` ok, lista `ƒ Proxy (Middleware)` (confirma a decisão de `src/proxy.ts`).

Verificação real com Postgres 16 descartável (Docker, porta 55433; `migrate deploy` só nessa URL; dono inserido por SQL com hash bcrypt de senha de teste `<senha>`; `next start -p 3109` com segredos fictícios só no ambiente do comando; servidor encerrado e container parado ao final):

- CA-01: sem cookie, 307 para `/login?callbackUrl=<caminho>` em `/hoje`, `/lancamentos`, `/planejar`, `/cartoes`, `/mais`, `/qualquer-coisa`, `/`; `/api/accounts`, `/api/auth/me`, `/api/auth/logout` 401 JSON; `Accept: application/json` em página 401.
- CA-02: `/login` e `/favicon.ico` 200; `/api/auth/login` chega ao handler (400 em corpo inválido); `/manifest.webmanifest`, `/icons/*`, `/api/health` passam o proxy (404 por não existirem ainda; reconferir após F0-05).
- CA-03: cron, telegram, mcp: sem header 401, errado 401, correto passa o proxy (404 sem handler); sessão-cookie não substitui o segredo; segredo do cron não abre `/api/mcp`; tentativas de bypass (`/api/cron%2Fx`, `/API/cron/x`, `/api/mcpx`, `/api/cron/../accounts`) não abrem; `//` e `/` final recebem 308 e reentram no proxy.
- CA-04: login gerou 1 linha em `sessions` com `token_hash` de 64 hex (`^[0-9a-f]{64}$`), diferente do token do cookie, `expires_at` = now + 90d, `last_seen_at` = now, `user_agent` gravado; cookie `fc_session=<token>; Path=/; Max-Age=7776000; Secure; HttpOnly; SameSite=lax` (o `next start` roda com NODE_ENV=production, então emite `Secure`; HTTP local sem `Secure` só em dev).
- CA-05: `last_seen_at` 2h atrás: nenhuma escrita (linha idêntica após `/hoje` e `/api/auth/me`); 23h50: sem escrita; 2 dias atrás: `last_seen_at` e `expires_at` renovados (+89d/90d). Reemissão do cookie: com `fc_session_r` do dia, 0 `Set-Cookie`; marca antiga, 2; POST, 0.
- CA-06: `expires_at` no passado: `/api/auth/me` 401 e a linha foi removida (`count` 0); `/hoje` com cookie obsoleto 307 para `/login`, e `/login` com cookie obsoleto 200 (sem laço).
- CA-07: `scripts/create-owner.ts` sem TTY sai com 1 antes de tocar no banco; senha só por prompt sem eco; regras (<12, >72 bytes, segundo usuário, reset encerra sessões e limpa `LoginAttempt`) em `owner.test.ts`. O fluxo interativo não pôde ser exercitado sem TTY (pendente da F0-08, humano).
- CA-08: `/register` e `POST /api/auth/register` com cookie: 404.
- CA-09: 5 falhas sequenciais 401; 6ª com senha correta 429 com `Retry-After: 899`; e-mail inexistente e senha errada com a mesma mensagem e 401; chave de 64 hex (sem IP/e-mail); sucesso apaga a chave; falhas com 16 min deixam de contar (login 200); IP diferente com o mesmo e-mail não é bloqueado; tempos de resposta equivalentes (~0,24s) para e-mail existente e inexistente.
- CA-10: com sessão válida, `/login?callbackUrl=` com `https://evil.example`, `//evil.example`, `/%5Cevil.example`, `/%09/evil.example` e `/login` vão para `/hoje`; `/mais` vai para `/mais`.
- Logout: apaga linha e ambos os cookies; `/api/auth/me` depois: 401. Log do servidor sem senha, token ou segredos.

Achados:

- IMPORTANTE: o limite de tentativas não é atômico. `login()` consulta as falhas (`checkLoginAllowed`), executa o bcrypt (~240 ms) e só depois grava a falha. 10 POSTs paralelos com senha errada para a mesma chave retornaram 10x 401 e gravaram 10 falhas (nenhum 429). Um atacante que dispare uma rajada paralela passa muito de 5 tentativas antes do bloqueio (depois a chave fica bloqueada 15 min). Correção sugerida (código de produção, fora do papel do QA): gravar a tentativa antes do bcrypt e reverter/limpar no sucesso, ou consultar de novo após gravar. Não afeta os CA como escritos (sequenciais); recomendo corrigir antes de expor em produção ou registrar como pendência.
- MENOR: `Authorization: bearer ...` (esquema em minúsculas) é negado, pois o regex exige `Bearer` (a Vercel envia `Bearer`; RFC 7235 diz que o esquema é case-insensitive).
- MENOR: o proxy reemite `fc_session` (90 dias) para qualquer valor de cookie, inclusive lixo ou obsoleto, e em respostas 404; inofensivo (o banco decide), mas prolonga cookie inválido.
- MENOR: `clientIp` confia no primeiro item de `X-Forwarded-For`; correto na Vercel (sobrescreve o cabeçalho), contornável fora dela. Também por desenho a chave inclui o IP: rotação de IP contorna o limite.
- MENOR: `api/auth/me/route.ts` importa `prismaUserRepository` (ligação de repositório, sem consulta Prisma no handler); aceitável para ADR-025, mas melhor injetar via serviço quando a camada de use-cases crescer.

### Ciclo de correção 1 (achados do QA)

Corrigido:

- **IMPORTANTE, limite de tentativas não atômico**: `login()` agora chama `reserveLoginAttempt` (`rate-limit.ts`) em vez de `checkLoginAllowed` + `recordLoginFailure`. Fluxo: (1) checagem barata (chave já com 5 falhas: 429 sem gravar nada, então o bloqueio não é estendido); (2) grava a tentativa como falha provisória ANTES do bcrypt; (3) relê a contagem; se > 5 (contando a própria), remove só a própria linha e devolve 429 com `Retry-After` calculado sem ela, sem rodar bcrypt; (4) a falha provisória é a definitiva; no sucesso `recordLoginSuccess` limpa a chave (regra "sucesso zera" mantida). Invariante: cada tentativa que chega ao bcrypt gravou a linha antes de contar, e linhas de quem prossegue nunca são desfeitas; a última a contar enxerga todas, logo no máximo 5 bcrypts por janela, mesmo em rajada. Custo: sem rajada, a falha passa a custar 1 INSERT + 2 SELECT (antes 1 SELECT + 1 INSERT). Preservados: mensagens idênticas, bcrypt fictício para e-mail inexistente, `Retry-After`, chave = sha256(IP+e-mail), janela deslizante. Sem migration: a porta `LoginAttemptRepository` ganhou `record(): Promise<string>` (id da linha) e `remove(id)`.
- **MENOR, esquema `Bearer` case-insensitive** (`secrets.ts`, RFC 7235): aceita `bearer`/`BEARER`; o valor do token segue sensível a maiúsculas.
- Efeito colateral aceito: numa rajada totalmente simultânea de mais de 5 tentativas, várias podem ver a contagem estourada ao mesmo tempo e todas receberem 429 (menos de 5 chegam ao bcrypt). É o lado seguro; o limite nunca é excedido.

Testes novos: `login.test.ts` (rajada de 12 `login()` em `Promise.all` com relógio falso, latência no fake do banco e no bcrypt injetado: escalonada = exatamente 5 respostas 401 e 7 respostas 429 e 5 bcrypts; entrelaçada e simultânea = no máximo 5 respostas 401/bcrypts, linhas = falhas; chave segue bloqueada depois da rajada; senha correta dentro do limite entra e zera), `rate-limit.test.ts` (`reserveLoginAttempt`: 5 passam gravando, 6ª bloqueada sem gravar, estouro na disputa desfaz só a própria linha), `secrets.test.ts` (`bearer`/`BEARER`/`BeArEr`, Basic e esquema sem token negados). `FakeLoginAttemptRepository` aceita latência e tem `remove`. Os 3 testes de rajada FALHAM contra o `login.ts` antigo (12 respostas 401 de 12; `expected 12 to be 5` / `expected 12 to be <= 5`) e passam no novo.

Verificação real (Postgres 16 descartável em Docker, porta 55434; `migrate deploy` só nessa URL; dono por SQL com hash bcrypt de senha fictícia `<senha>`; `next start -p 3110`; IP fixo por `X-Forwarded-For`): 10 `curl` paralelos com senha errada: 4x 401 e 6x 429 (a QA tinha 10x 401 e 0x 429); 4 falhas gravadas; segunda rajada de 10: 1x 401 e 9x 429 (total 5 bcrypts na janela); senha correta depois: 429 com `Retry-After: 899`; outro IP: 200. `Authorization: bearer`/`BEARER` com o segredo certo passam o guard do cron (404 por não haver handler ainda), valor errado 401. Servidor e container encerrados.

Registrado sem correção (por desenho da spec ou aceitável):

- MENOR: o proxy reemite `fc_session` (90 dias) para qualquer valor de cookie, inclusive inválido, e em respostas 404; inofensivo (o banco decide a sessão), a spec define a checagem do proxy como otimista (existência do cookie).
- MENOR: `clientIp` confia no primeiro item de `X-Forwarded-For`; correto na Vercel (que sobrescreve o cabeçalho), contornável fora dela. A chave inclui o IP por desenho (spec): rotação de IP contorna o limite; mitigação futura seria um limite adicional só por e-mail.
- MENOR: `api/auth/me/route.ts` importa `prismaUserRepository` (ligação de repositório, sem consulta Prisma no handler); aceitável para ADR-025, injetar via serviço quando a camada de use-cases crescer.

Comandos (worktree, `DATABASE_URL` fictícia só para o build): `npm run lint` sem erros; `npm run typecheck` ok; `npm test` 30 arquivos / 365 testes; `npm run guard:data` 3 arquivos / 54 testes; `prettier --check --end-of-line auto src tests` ok; `npx next build` ok (`ƒ Proxy (Middleware)`).

### Re-revisão QA (ciclo de correção 1, HEAD `ce6059b`)

Parecer: **APROVADO**.

- Achado importante (limite não atômico): FECHADO. Leitura de `login.ts` e `rate-limit.ts`: a reserva grava antes do bcrypt, relê e desfaz só a própria linha (por id) no estouro; invariante verificado (a última tentativa a contar enxerga todas as que prosseguem, logo no máximo 5 bcrypts por janela). Login bem-sucedido: `recordLoginSuccess` limpa a chave, a linha provisória não sobra. Exceção no bcrypt/DB: a linha provisória permanece (fail closed, nunca libera tentativa extra); coberto por teste novo. `Retry-After`: calculado sem a própria linha, mínimo 1 s, máximo 15 min. Mensagens idênticas e bcrypt fictício preservados.
- Teste de mutação: com `login.ts` de `0628204` restaurado, os 3 testes de rajada de `login.test.ts` falham (`expected 12 to be 5`; `expected 12 to be <= 5`); revertido e passam no código novo. A latência injetada (fake do banco e bcrypt com `setTimeout` sob relógio falso) entrelaça de fato.
- Bearer case-insensitive: atendido (`secrets.ts`, regex `/^Bearer (.+)$/i`; valor do token comparado em tempo constante e sensível a maiúsculas; testes para `bearer`/`BEARER`/`BeArEr`, `Basic` e esquema sem token).
- Docker: INDISPONÍVEL (Docker Desktop desligado, `docker ps` falhou no pipe do engine); não foi iniciado. A rajada real não foi reproduzida pelo QA; o parecer se apoia nos testes de rajada e na evidência do implementador (10 `curl` paralelos: 4x 401 e 6x 429, 4 falhas gravadas).
- Teste adicionado pelo QA: `login.test.ts`, "exceção depois da reserva" (bcrypt lança, falha provisória permanece, exceção propaga).
- Comandos: `npm run lint` sem erros; `npm run typecheck` ok; `npm test` 30 arquivos / 366 testes; `npm run guard:data` 3 arquivos / 54 testes; `prettier --check --end-of-line auto .` ok; `DATABASE_URL=<ci> npx next build` ok (`ƒ Proxy (Middleware)`).
- Achados remanescentes: MENOR, rajada totalmente simultânea pode devolver 429 a todas (menos de 5 chegam ao bcrypt; lado seguro). MENOR, `X-Forwarded-For`/chave por IP e `me/route.ts` importando repositório, já registrados. Nenhum bloqueante ou importante.

## Handoff
Link para o handoff ativo, quando aplicável.

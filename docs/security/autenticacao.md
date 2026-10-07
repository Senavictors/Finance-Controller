---
estado: real
fonte: src/server/auth/, src/proxy.ts, scripts/create-owner.ts
ultima-revisao: FC2-F0-06 2026-10-05
---

# Autenticação single-user

Fluxo de acesso do Finance Controller 2.0. Decisões: ADR-016 (single-user), ADR-027 (webhook Telegram), ADR-030 (cron). Controles gerais: [`README.md`](README.md).

## Resumo

- Um único usuário (o dono), criado por script local. Não existe cadastro por HTTP (`/register` e `/api/auth/register` não existem).
- Sessão no servidor, de **90 dias com renovação deslizante**; o cookie `fc_session` carrega um token aleatório (32 bytes, hex) e o banco guarda só o **SHA-256** dele (`sessions.token_hash`).
- **Toda rota é protegida por padrão** pelo proxy; as exceções são allowlists explícitas e testadas.
- Cron, webhook do Telegram e MCP usam segredo próprio, validado em tempo constante, com comportamento fail closed.

## Onde está o código

| Peça                                                               | Arquivo                                                                       |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Política pura (TTL 90 dias, renovar após 24h, atributos do cookie) | `src/server/auth/session-policy.ts`                                           |
| Regras de sessão com repositório e relógio injetados               | `src/server/auth/session-service.ts`                                          |
| Adaptador Next (cookie) e `requireAuth()`                          | `src/server/auth/session.ts`, `guard.ts`                                      |
| Login (use-case), limite de tentativas                             | `src/server/auth/login.ts`, `rate-limit.ts`                                   |
| Decisão do proxy (módulo puro)                                     | `src/server/auth/proxy-rules.ts`                                              |
| Proxy do Next 16                                                   | `src/proxy.ts` (dentro de `src/`, no mesmo nível de `app/`)                   |
| Segredos de cron/Telegram/MCP                                      | `src/server/auth/secrets.ts`                                                  |
| Anti open redirect                                                 | `src/server/auth/redirect.ts`                                                 |
| Criar o dono / trocar a senha                                      | `scripts/create-owner.ts` + `src/server/auth/owner.ts`                        |
| Rotas                                                              | `src/app/api/auth/{login,logout,me}/route.ts`, página `src/app/(auth)/login/` |

## Sessão

- Login: `POST /api/auth/login` valida o corpo (Zod), aplica o limite de tentativas, compara a senha com bcrypt (contra um hash fictício quando o e-mail não existe, para tempo uniforme), cria a linha em `sessions` e grava o cookie.
- Cookie `fc_session`: `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age=7776000` (90 dias), `Secure` em produção.
- `validateSession()`/`requireAuth()`: busca por `tokenHash`; sem linha ou expirada (`expiresAt <= now`) devolve `null` (a linha expirada é apagada). Se `now - lastSeenAt >= 24h`, faz **uma** escrita (`lastSeenAt = now`, `expiresAt = now + 90d`): no máximo 1 escrita por dia por sessão.
- Renovação do cookie: Server Components não gravam cookies; o proxy reemite `fc_session` (mesmos atributos, 90 dias) em navegações `GET` a páginas protegidas, no máximo 1 vez por dia, controlado pelo cookie auxiliar `fc_session_r` (dia UTC desde a época Unix; não sensível). O banco é a fonte de verdade da expiração: se o cookie não for renovado, ele ainda vale 90 dias desde a última emissão.
- Logout apaga a linha e os dois cookies. `invalidateOtherSessions` mantém "sair dos outros dispositivos".
- PWA no iOS: o cookie da instalação é separado do Safari; logar uma vez dentro da PWA.

## Limite de tentativas

Persistido em `login_attempts` (serverless não compartilha memória). Chave `sha256(ip|email)`; 5 falhas nos últimos 15 minutos bloqueiam a chave (`429` com `Retry-After`, mesmo com a senha correta) até a falha mais antiga sair da janela. Falha grava linha; sucesso limpa a chave; linhas com mais de 24h são removidas no próprio login. Tentativas bloqueadas não gravam linhas nem executam bcrypt. A mensagem para e-mail inexistente e senha errada é a mesma.

## Proxy: rota → decisão

| Caminho                                                                                                                                           | Decisão                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `/login`, `/api/auth/login`, `/manifest.webmanifest`, `/favicon.ico`, `/apple-touch-icon.png`, `/api/health`, `/_next/*`, `/icons/*`, `/brands/*` | público (segue)                                                                  |
| `/ui`, `/ui/*`                                                                                                                                    | público **só fora de produção**                                                  |
| `/api/cron`, `/api/cron/*`                                                                                                                        | exige `Authorization: Bearer <CRON_SECRET>`; senão `401`                         |
| `/api/telegram/webhook`                                                                                                                           | exige `X-Telegram-Bot-Api-Secret-Token` = `TELEGRAM_WEBHOOK_SECRET`; senão `401` |
| `/api/mcp`, `/api/mcp/*`                                                                                                                          | exige `Authorization: Bearer <MCP_TOKEN>`; senão `401`                           |
| `/api/*` (demais) sem cookie `fc_session`                                                                                                         | `401` JSON                                                                       |
| qualquer outro caminho sem cookie                                                                                                                 | redireciona (307) para `/login?callbackUrl=<caminho>`                            |
| qualquer rota com cookie                                                                                                                          | segue; a validação real é no servidor                                            |

O proxy checa só a **existência** do cookie. A validação real (hash no banco) acontece em `requireAuth()` (rotas e ações) e no layout de `(app)`. Nunca confie só no proxy. Os guards `requireCronSecret`, `requireTelegramSecret` e `requireMcpToken` devem ser chamados também pelos handlers (defesa em profundidade). `/login` sempre segue: a página valida a sessão no banco e redireciona para `callbackUrl` válido ou `/hoje`; redirecionar pelo cookie no proxy causaria laço com cookie obsoleto.

`callbackUrl` só aceita caminho interno (`/^\/(?!\/)/`, sem barra invertida nem caracteres de controle); qualquer outro valor vira `/hoje`.

## Variáveis de ambiente (somente nomes)

| Variável                    | Uso                                                                                     |
| --------------------------- | --------------------------------------------------------------------------------------- |
| `DATABASE_URL`              | Banco (também lida pelo script do dono)                                                 |
| `CRON_SECRET`               | Vercel Cron (`Authorization: Bearer`); ausente = cron negado                            |
| `TELEGRAM_WEBHOOK_SECRET`   | Mesmo valor do `secret_token` do `setWebhook`; ausente = webhook negado                 |
| `MCP_TOKEN`                 | Token do servidor MCP; ausente = MCP negado                                             |
| `OWNER_EMAIL`, `OWNER_NAME` | Opcionais, só para o script `owner:create` (senão pergunta no terminal)                 |
| `SESSION_SECRET`            | Reservado; o código atual não o lê (o token de sessão é aleatório e guardado como hash) |

Use pelo menos 32 caracteres aleatórios nos três segredos. Valores só na Vercel e em `.env.local`.

## Criar o dono e trocar a senha

```bash
npm run owner:create         # primeiro usuário; recusa se já existir algum
npm run owner:set-password   # troca a senha do único usuário, encerra TODAS as sessões e limpa login_attempts
```

A senha é pedida **sempre** em prompt sem eco (nunca por argumento, variável ou arquivo); 12 a 72 bytes; confirmada duas vezes. O script exige terminal interativo e `DATABASE_URL` em `.env.local`/`.env`. Ele cria o `UserSettings` com os defaults. Se o dono se trancar por tentativas falhas, o bloqueio expira em 15 minutos ou `owner:set-password` o limpa.

## Verificação manual (após o reset do Neon, FC2-F0-08)

1. `npm run owner:create` e logar em `/login`: conferir em `sessions` um `token_hash` de 64 hex e `expires_at` em ~90 dias; cookie com `HttpOnly`, `SameSite=Lax`, `Max-Age=7776000`.
2. Alterar `last_seen_at` de uma sessão para 2 dias atrás, navegar e conferir `last_seen_at`/`expires_at` atualizados; com `last_seen_at` de 2 horas atrás, sem escrita.
3. Alterar `expires_at` para o passado, navegar: cai em `/login` e a linha é removida.
4. 5 logins errados seguidos: `429` com `Retry-After`; o 6º com a senha correta também; mesma mensagem para e-mail inexistente.
5. `npm run owner:create` de novo: recusa com mensagem clara; `npm run owner:set-password` encerra as demais sessões.

## Fora de escopo

Multi-usuário, OAuth, passkeys/WebAuthn e 2FA (futuro). Tela de configurações para trocar a senha (use o script).

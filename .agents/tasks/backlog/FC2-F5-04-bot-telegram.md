---
id: FC2-F5-04
title: Bot Telegram (webhook, comandos, texto e áudio)
status: backlog
type: feature
phase: F5
wave: 2
owner: ia-integracoes
depends_on: [FC2-F5-01, FC2-F5-02]
created_at: 2026-10-05
updated_at: 2026-10-05
affected_modules: [telegram, tools, ai, capture]
related_use_cases: []
related_adrs: [ADR-027, ADR-025, ADR-026, ADR-024, ADR-030]
---

# FC2-F5-04 — Bot Telegram (webhook, comandos, texto e áudio)

## Contexto
O bot é o terceiro canal de captura (além do FAB e do atalho desktop): lançar um gasto em segundos sem abrir o app, e consultar "quanto posso gastar". ADR-027: bot **single-user** por **webhook** (não polling), com `secret_token` e allowlist por `chat_id`. Todo comportamento passa pelas tools da F5-01 (ADR-025) e a IA pelo cliente da F5-02. Telegram (e não WhatsApp) por decisão do dono.

## Problema
Hoje só é possível lançar dentro do app. Sem o bot, gastos de rua (parado no balcão) ficam sem registro até a noite, e consultar o "livre" exige abrir o PWA.

## Objetivo
Webhook em `src/app/api/telegram/webhook` que:
1. Autentica a origem (`secret_token`) e restringe a um `chat_id` cadastrado.
2. Atende os comandos `/hoje`, `/livre`, `/faturas`, `/desfazer`, `/ajuda`.
3. Trata **texto livre** pelo parser da F2-01 e pede **confirmação com botões inline** antes de gravar.
4. Trata **áudio** (nota de voz): transcreve (F5-02) e segue o mesmo fluxo do texto.
5. Responde sempre com o **"livre" atualizado** após lançar.

## Fora de escopo
- Agentes agendados e alertas proativos (F5-05, que reutiliza o cliente e o envio de mensagens daqui).
- Chat livre com LLM sobre os dados (futuro; aqui só comandos e captura).
- Fotos de nota fiscal, localização, grupos e canais.
- Multiusuário (um único `chat_id`).

## Comportamento atual
Tools da F5-01 (`propose_transaction`, `commit_draft`, `get_available`, `list_card_statements`, `undo_last_capture`, `list_upcoming`) e cliente da F5-02 (`callStructured`, `transcribe`, `getBudgetStatus`) estão disponíveis. Não existe `src/server/modules/telegram/` nem rota de webhook. Auth de sessão do app é a de `src/server/auth/` (o webhook **não** usa cookie).

## Comportamento esperado
### Configuração (env, documentar em `.env.example`)
```text
TELEGRAM_BOT_TOKEN=            # do BotFather; nunca logar
TELEGRAM_WEBHOOK_SECRET=       # string aleatória 32+ caracteres; vira o secret_token do setWebhook
APP_BASE_URL=                  # ex.: https://fc.exemplo.vercel.app (para o setWebhook)
```

### Pareamento (allowlist por chat_id)
`TelegramLink` **já existe** (F0-02: `userId @unique`, `chatId String @unique`, `username?`, `isActive`, `linkedAt`); revogar = `isActive = false`. Nova tabela `TelegramLinkCode { id, userId, codeHash, expiresAt, usedAt? }`.
1. No app (sessão): `POST /api/telegram/link-code` gera um código de 8 caracteres (alfabeto sem ambiguidade), guarda **hash**, expira em 10 min e devolve o código uma vez.
2. No Telegram o dono envia `/start CODIGO` ao bot. Se o hash casa e não expirou, cria `TelegramLink` com o `chat_id` da mensagem e responde "Vinculado".
3. Qualquer outro `chat_id` sem vínculo: **ignorar em silêncio** (200 sem resposta, sem revelar que o bot existe) e incrementar contador de métrica.
4. `DELETE /api/telegram/link` (sessão) revoga o vínculo. Vínculo único por usuário (single-user).

### Webhook (`src/app/api/telegram/webhook/route.ts`)
- `POST` apenas. O `proxy.ts` (F0-06) já deixa `/api/telegram/webhook` passar sem cookie; o handler chama `requireTelegramSecret()` de `src/server/auth/secrets.ts` (F0-06: header `X-Telegram-Bot-Api-Secret-Token` contra `TELEGRAM_WEBHOOK_SECRET`, comparação em tempo constante, fail closed se o segredo não estiver configurado); divergente → `401` sem corpo e sem log do payload. Não reimplementar a comparação.
- Idempotência: gravar `update_id` em `TelegramUpdate { updateId (único), receivedAt }`; update repetido (retry do Telegram) → responde `200` sem reprocessar. Limpar com mais de 7 dias.
- Sempre responder `200` rapidamente para updates válidos (mesmo em erro interno, para o Telegram não reenviar em loop); erro vira mensagem amigável ao usuário.
- `runtime = 'nodejs'`, `maxDuration = 30`.
- Rota fina: delega a `handleUpdate` em `src/server/modules/telegram/application/handle-update.ts` (puro em relação ao Telegram: recebe `update` e `deps` injetáveis, devolve ações `send`/`edit`/`answerCallback`).
- Script `scripts/telegram-set-webhook.ts` + `npm run telegram:webhook` chama `setWebhook` com `url = APP_BASE_URL + /api/telegram/webhook`, `secret_token` e `allowed_updates = ["message","callback_query"]`, e `getWebhookInfo` para conferir.

### Comandos
| Comando | Tool | Resposta (exemplo com valores fictícios) |
|---|---|---|
| `/livre` | `get_available` | `Livre até 25/10: R$ 1.200,00 (R$ 80,00/dia). Ritmo: no plano.` ou, em modo Aperto: `Aperto: faltam R$ 300,00 até o salário (dia 05).` |
| `/hoje` | `get_available` + `list_upcoming` (3 dias) + `get_inbox_summary` | Livre, gasto de hoje, até 3 vencimentos próximos e "N itens no Inbox" |
| `/faturas` | `list_card_statements` | uma linha por cartão: `Cartão Exemplo: R$ 800,00 vence em 12 dias` |
| `/desfazer` | `undo_last_capture` | `Desfeito: ifood R$ 42,90 (Alimentação).` ou `Nada para desfazer nos últimos 10 min.` |
| `/ajuda` | — | lista de comandos e exemplos de captura |
| `/start CODIGO` | — | pareamento |
Mensagens em HTML (`parse_mode: 'HTML'`) com escape de `<`, `>`, `&` no conteúdo dinâmico; valores formatados em BRL a partir de centavos.

### Texto livre
1. Mensagem de texto (não comando) → tool `propose_transaction` (parser da F2-01; se baixa confiança e a IA permitir, fallback LLM da F5-03).
2. Resposta de confirmação com **teclado inline**:
```text
ifood R$ 42,90 · Nubank · Alimentação · hoje
[Confirmar]  [Cancelar]
[Trocar conta]  [Trocar categoria]
```
`callback_data` ≤ 64 bytes no formato `c:{draftId}` (confirmar), `x:{draftId}` (cancelar), `a:{draftId}` / `k:{draftId}` (trocar conta/categoria, abre botões com as 4 opções mais usadas e `m:{draftId}:{id curto}`). O `Draft` fica em `ToolDraft` (F5-01); o `draftId` é opaco (cuid curto).
3. **Confirmar** → `commit_draft` → edita a mensagem para "Registrado" e envia uma nova com o `get_available` atualizado: `Registrado: ifood R$ 42,90. Livre até 25/10: R$ 1.157,10 (R$ 77,14/dia).` Cartão: incluir a fatura de destino e se pesa no caixa do ciclo ("cai na fatura de 12/11").
4. Campos faltantes (valor ausente): perguntar objetivamente ("Qual o valor?") e tratar a próxima mensagem como complemento do mesmo rascunho (estado em `ToolDraft` por 15 min).
5. Rascunho expirado/já usado → "Esse lançamento expirou. Envie de novo."
6. `callback_query` sempre recebe `answerCallbackQuery` (para parar o spinner).

### Áudio
`message.voice` (OGG/Opus) ou `message.audio`: validar `duration ≤ 60 s` e `file_size ≤ 2 MB`; `getFile` + download para **memória** (nunca disco); `transcribe` (F5-02, modelo configurável); responder `Entendi: "{transcrição}"` e seguir o fluxo de texto livre com confirmação obrigatória. Se a IA estiver indisponível (orçamento/kill switch/sem chave): "Não consegui transcrever agora. Envie por texto." O áudio e a transcrição não são persistidos além do `ToolDraft` efêmero.

### Alerta de orçamento de IA
Quando `getBudgetStatus` indicar 80% do teto mensal, incluir uma única linha de aviso por mês no rodapé da próxima resposta de `/hoje`.

## Regras de negócio
- RN-01: Webhook só aceita requisições com `secret_token` válido; nenhuma lógica roda antes disso; nenhum corpo é logado.
- RN-02: Só o `chat_id` vinculado é atendido; demais são ignorados em silêncio. Mensagens de grupos/canais são ignoradas (`chat.type !== 'private'`).
- RN-03: Toda leitura/escrita passa pelas tools da F5-01 com `channel = 'bot'`; o bot **não** acessa Prisma de domínio direto (só as próprias tabelas `TelegramLink`, `TelegramLinkCode`, `TelegramUpdate`).
- RN-04: **Nada é gravado sem confirmação** por botão (texto ou áudio). Confirmação é idempotente (`draftId`).
- RN-05: `/desfazer` usa `undo_last_capture` (que chama `undoCapture` da F2-03): só desfaz a última captura confirmada pelo bot em até 10 min, sem edição posterior e sem fatura paga, e informa o que removeu.
- RN-06: Token do bot e secret nunca em log, resposta, URL de erro ou `AiUsage`.
- RN-07: Texto do usuário enviado ao LLM (fallback) sempre passa por redaction (F5-02); transcrições também.
- RN-08: Limite de entrada: texto ≤ 500 caracteres; rate limit por `chat_id` de 30 mensagens/minuto (acima disso ignora).
- RN-09: Datas e fuso: "hoje/ontem" no fuso `America/Sao_Paulo`; datas internas ao meio-dia UTC (ADR-002).
- RN-10: Falha interna → mensagem curta ("Algo deu errado. Tente de novo."), `200` ao Telegram e log estruturado `{ updateId, kind, ok, durationMs }`.
- RN-11: Respostas do bot nunca incluem número de conta, agência ou nome de terceiros além do que o usuário digitou.
- RN-12: A camada de envio (`TelegramClient.sendMessage/editMessageText/answerCallbackQuery/getFile`) é uma interface injetável, reaproveitada pela F5-05 para alertas.

## Critérios de aceitação
- [ ] CA-01: Requisição sem header ou com secret errado retorna `401` e não executa handler (teste de rota).
- [ ] CA-02: Mensagem de `chat_id` não vinculado retorna `200`, não envia resposta e não cria nada.
- [ ] CA-03: Pareamento: código válido cria `TelegramLink`; expirado, usado ou errado é recusado; o código é guardado só como hash.
- [ ] CA-04: `update_id` repetido não gera segunda resposta nem segunda transação.
- [ ] CA-05: `/livre`, `/hoje`, `/faturas`, `/desfazer`, `/ajuda` respondem com o formato esperado usando as tools (mock do client e dados sintéticos).
- [ ] CA-06: Texto "ifood 42,90 nubank" gera mensagem de confirmação com botões; **Confirmar** cria uma transação e responde com o "livre" atualizado; **Cancelar** não cria.
- [ ] CA-07: Confirmar duas vezes o mesmo botão cria uma só transação.
- [ ] CA-08: Texto sem valor ("mercado") pergunta o valor e o complemento "42,90" completa o mesmo rascunho.
- [ ] CA-09: Áudio válido (mock da transcrição) mostra "Entendi: ..." e segue com confirmação; áudio > 60 s ou > 2 MB é recusado com mensagem; IA indisponível devolve a mensagem de fallback.
- [ ] CA-10: `/desfazer` remove a última captura do bot em até 10 min e recusa depois disso (ou se a transação foi editada).
- [ ] CA-11: Nenhum log contém token, secret, texto de mensagens ou valores (teste espiando `console`).
- [ ] CA-12: `npm run telegram:webhook` registra o webhook com `secret_token` e `allowed_updates` corretos (verificado com mock de fetch).
- [ ] CA-13: `npm run lint`, `npm test`, `npx next build` passam; `docs/integrations/telegram.md` descreve configuração (BotFather, env, setWebhook, pareamento).

## Impacto técnico
### Backend
Criar:
- `src/server/modules/telegram/domain/commands.ts` (parse de comando e `callback_data`), `format.ts` (HTML escape, BRL, mensagens), `types.ts` (subconjunto tipado do `Update` com Zod)
- `src/server/modules/telegram/application/handle-update.ts`, `link-chat.ts`, `create-link-code.ts`, `revoke-link.ts`, `handle-command.ts`, `handle-text.ts`, `handle-voice.ts`, `handle-callback.ts`
- `src/server/modules/telegram/infra/telegram-client.ts` (fetch para `https://api.telegram.org/bot{token}/...`), `link-repository.ts`, `update-repository.ts`
- `src/server/modules/telegram/http/schemas.ts`
- `src/app/api/telegram/webhook/route.ts`, `src/app/api/telegram/link-code/route.ts` (POST), `src/app/api/telegram/link/route.ts` (GET status, DELETE)
- `scripts/telegram-set-webhook.ts` + script em `package.json`
- `.env.example`

### Frontend
Nenhum aqui (tela de integração em Mais é da F6; por enquanto o código de pareamento sai pela API).

### Banco de dados
Migration `add_telegram_pairing`: apenas `TelegramLinkCode` e `TelegramUpdate` (índices por `expiresAt` e `updateId` único); `TelegramLink` já existe na F0-02.

### Integrações
Telegram Bot API (HTTPS, `setWebhook`, `sendMessage`, `editMessageText`, `answerCallbackQuery`, `getFile` + download). OpenAI via F5-02 para transcrição e fallback.

### Segurança
`secret_token` com comparação em tempo constante; allowlist silenciosa; token só em env; hash do código de pareamento; limites de tamanho/duração; sem persistir áudio; sem logar conteúdo.

## Plano de implementação
- [ ] 1. Ler as tools da F5-01 (`src/server/modules/tools/`), o cliente da F5-02 e o parser da F2-01; confirmar nomes e schemas reais.
- [ ] 2. Domínio puro: `commands.ts`, `format.ts`, tipos Zod do `Update`, com testes.
- [ ] 3. Migration `add_telegram_pairing` (via `dados-prisma`) e repositórios.
- [ ] 4. `TelegramClient` com interface injetável + fake para testes.
- [ ] 5. `handle-update` e handlers (comandos, texto, callback, voz) com TDD usando o fake.
- [ ] 6. Rota do webhook (secret, idempotência) e rotas de pareamento.
- [ ] 7. Script `telegram:webhook`.
- [ ] 8. Testes de integração ponta a ponta (rota → handler → tool → banco) com Telegram e OpenAI mockados.
- [ ] 9. Documentar em `docs/integrations/telegram.md`; atualizar `CONTEXT.md`.
- [ ] 10. Teste manual no bot real (fora do CI), com valores fictícios; registrar resultado na Validação.

## Estratégia de testes
- [ ] Unitários: `parseCallbackData` (`c:abc123`, formato inválido, > 64 bytes); `escapeHtml` (`<b>&`); formatação BRL (`429000` → `R$ 4.290,00`, negativo, zero); parse de comando com `@nomedobot` (`/livre@fc_bot`) e com argumentos; extração do `chat_id` de `message` e de `callback_query`.
- [ ] Integração (Telegram fake, banco real): fluxos CA-02 a CA-10; secret errado/ausente; `update_id` duplicado; rate limit (31ª mensagem no minuto ignorada); mensagem de grupo ignorada; draft expirado; usuário inexistente para o chat revogado; erro da tool vira mensagem amigável com `200`.
- [ ] E2E: n/a no CI. Manual com bot real: pareamento, `/livre`, lançar por texto e por áudio, `/desfazer`.
- [ ] Manual: conferir que a Vercel entrega o corpo sem timeout (< 10 s por update, incluindo transcrição).

## Riscos e rollback
- **Timeout da função** durante transcrição: limites de 60 s/2 MB, `maxDuration = 30`; se estourar, o Telegram reenvia — `update_id` evita duplicar.
- **Vazamento do secret/token**: rotação por env + novo `setWebhook`; allowlist limita impacto (só o chat vinculado é atendido).
- **Confirmação acidental**: botão explícito + `/desfazer`.
- **Telegram fora do ar**: o app continua funcionando; bot é opcional.
- Rollback: `deleteWebhook` (script ou chamada manual) desliga o canal; remover a rota não afeta o domínio; tabelas novas são isoladas.

## Registro de execução
### Alterações realizadas
### Arquivos principais
### Decisões
### Divergências
### Pendências

## Validação

## Handoff

---
id: ADR-027
title: Bot Telegram single-user por webhook
status: accepted
date: 2026-10-05
deciders: [Victor (dono do produto), orquestrador]
related_tasks: [FC2-F5-04, FC2-F5-05, FC2-F5-01, FC2-F0-02]
supersedes: []
---

# ADR-027 — Bot Telegram single-user por webhook

## Contexto
O dono quer lançar e consultar de qualquer lugar sem abrir o app: "uber 18 nubank" por texto ou áudio, "quanto posso gastar hoje?", alertas de vencimento. A decisão de produto é Telegram (não WhatsApp: API oficial paga, aprovação de templates e número dedicado). A hospedagem é serverless (Vercel), sem processo permanente, então long polling não serve. O bot lida com dados financeiros e só deve responder ao dono.

## Decisão
1. **Webhook** em `src/app/api/telegram/webhook/route.ts` (POST). Registro via `setWebhook` com `allowed_updates=["message","callback_query"]`, `max_connections=1` e `secret_token`.
2. **Autenticação em duas camadas**:
   - Cabeçalho `X-Telegram-Bot-Api-Secret-Token` comparado em tempo constante (`crypto.timingSafeEqual`) com `TELEGRAM_WEBHOOK_SECRET` (>= 32 caracteres aleatórios). Falha: responde `401` sem corpo.
   - **Allowlist de `chat_id`**: tabela `TelegramLink` (`userId`, `chatId` único, `linkedAt`). O vínculo é criado por código de uso único gerado em Mais > Integrações (`/start CODIGO`, validade 10 min). Mensagens de `chat_id` não vinculado são ignoradas silenciosamente com `200` (sem eco, sem revelar que o bot existe).
3. **Idempotência**: Telegram reenvia updates em falha. O `update_id` é persistido (`TelegramUpdate` com índice único ou `lastUpdateId` por vínculo); updates repetidos retornam `200` sem reprocessar. Chave `telegram:UPDATE_ID` vai como `idempotencyKey` das tools (ADR-025).
4. **Rápido e assíncrono**: responder `200` em < 3 s. Captura de texto roda o parser determinístico (ADR-024) dentro da requisição (ms); chamadas de LLM e transcrição respeitam timeout de 8 s e `maxDuration = 30`.
5. **Comandos**: `/hoje` (livre, R$/dia, modo), `/saldo`, `/vence` (próximos 7 dias), `/fatura CARTAO`, `/inbox` (contagem), `/ajuda`. Texto livre: parser > confirmação. Áudio: transcrição (ADR-026) > parser.
6. **Confirmação por botão**: todo lançamento criado via texto ou áudio mostra resumo e botões inline `Confirmar | Editar | Cancelar`; escrita iniciada por LLM sempre exige toque. Lançamentos de parser com `confidence >= 0.9` e todos os campos resolvidos podem ser salvos direto com botão "Desfazer" por 60 s.
7. **Dados mínimos nas mensagens**: mensagens trazem apenas o necessário (descrição curta do merchant, valor, categoria, nome do cartão/conta pelo apelido, "livre para gastar"). Nunca: CPF, número de conta/cartão, chaves Pix, saldo detalhado de todas as contas em uma só mensagem, nomes de terceiros. Modo privacidade (`Settings.botHideAmounts`) substitui valores por "••".
8. **Segurança operacional**: token do bot (`TELEGRAM_BOT_TOKEN`) só em env; rate limit de 30 mensagens por minuto por `chat_id`; comando `/desvincular` e botão em Mais para revogar; rotação do secret documentada.
9. **Alertas**: envio proativo pelos agentes agendados (F5-05, ADR-030) usando `sendMessage` para os `chatId` vinculados.

## Alternativas consideradas
### Alternativa A — WhatsApp (API oficial ou não oficial)
- Vantagens: onde o dono já conversa.
- Desvantagens: API oficial exige conta business, templates e custo por conversa; soluções não oficiais violam termos e quebram.

### Alternativa B — Long polling em worker dedicado
- Vantagens: sem endpoint público.
- Desvantagens: exige processo 24/7 fora da Vercel (custo e operação) para um único usuário.

### Alternativa C — Somente o app, sem bot
- Vantagens: menor superfície de ataque.
- Desvantagens: perde captura por voz/ no momento da compra; a meta de captura < 5 s depende de reduzir fricção.

## Consequências
### Positivas
- Terceira porta de captura sem infra nova; uso por áudio.
- Alertas ativos sem depender de notificação push do PWA (limitada no iOS).

### Negativas
- Telegram é terceiro: mensagens trafegam pelos servidores dele (não são ponta a ponta nos bots).
- Webhook público exige cuidado de segurança.

### Riscos
- Vazamento do secret ou token: rotação (`setWebhook` novo, `BotFather /revoke`).
- Replay de update: coberto por idempotência.
- Cold start da função: resposta pode demorar; Telegram tolera até ~60 s, mas manter < 3 s.

## Plano de adoção
1. FC2-F0-02: tabelas `TelegramLink` e `TelegramUpdate`.
2. FC2-F5-04: rota, validação do secret, vínculo, comandos, captura, botões e testes (update com secret errado, `chat_id` não permitido, `update_id` repetido).
3. FC2-F5-05: alertas dos agentes.

## Validação
- Testes de rota: secret inválido = 401; `chat_id` fora da lista = 200 sem ação e sem chamada de use-case; `update_id` duplicado = 1 lançamento.
- Captura pelo bot de ponta a ponta < 10 s incluindo confirmação.

## Revisão
Se Telegram mudar políticas de bots ou se o modo casal (F7-02) exigir múltiplos vínculos.

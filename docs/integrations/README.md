# Integrações

Credenciais (somente nomes de variáveis), limites, retry, idempotência e indisponibilidade das integrações de terceiros. Variáveis em [`../architecture/deployment.md`](../architecture/deployment.md).

## Integrações do 2.0

| Integração | Uso | ADR | Fase |
|---|---|---|---|
| Neon Postgres | Banco; pode ser zerado | 016 | F0 |
| Vercel (hosting + Cron) | Deploy e jobs diários idempotentes | 030 | F0, F3 |
| OpenAI API | Fallback do parser, categorização, chat, transcrição; orçamento de US$ 5 | 026 | F5 |
| Telegram Bot API | Captura, consultas, alertas por webhook | 027 | F5 |
| MCP | Tools read-only para Claude/ChatGPT | 025 | F5 |
| Open Finance (Pluggy) | Futuro | — | F7 |

## Planejados do 2.0 (nascem sob demanda)

- `openai.md` — orçamento, redaction, modelos, registro em `AiUsage` (F5-02)
- `telegram.md` — webhook, secret token, `chatId` único (F5-04)
- `mcp.md` — autenticação e escopo (F5-06)
- `vercel-cron.md` — agenda, `CRON_SECRET`, idempotência (F3-01)
- `importacao-bancos.md` — formatos PDF/OFX/CSV de Itaú e Nubank, sempre com fixtures sintéticas (F4-02)

## Template por integração

```markdown
---
estado: planejado | real | divergente
fonte: código real que implementa a integração
ultima-revisao: task ou data
---

# Integração Nome

## Propósito
## Credenciais e configuração
## Limites e rate limits
## Retry / timeout / idempotência
## Modos de falha e circuit breaker
## Procedimento de indisponibilidade
```

## Estado atual (1.x)

Nenhuma integração externa além do Postgres.

---
estado: planejado
fonte: docs/product/especificacao-fc2.md
ultima-revisao: bootstrap-init 2026-10-05
---

# Segurança e privacidade

Threat model leve para um sistema pessoal, de um único usuário, hospedado na Vercel com banco no Neon. Foco: proteger dados financeiros reais e impedir que superfícies expostas (webhook, MCP, cron) virem porta de entrada. Relacionados: ADR-016, ADR-025, ADR-026, ADR-027, ADR-030 e [`../ai/README.md`](../ai/README.md).

## Ativos

- Dados financeiros reais (saldos, transações, faturas, dívidas, renda) no Neon.
- Credenciais: sessão, token do bot, chave da OpenAI, token do MCP, segredo do cron, `DATABASE_URL`.
- Arquivos de extrato e fatura do usuário.

Adversários realistas: bot ou varredura na internet, vazamento acidental via Git ou logs, dispositivo perdido, dependência comprometida. Fora do modelo: adversário com acesso físico ao dispositivo desbloqueado e ataques estatais.

## Controles por superfície

| Superfície | Risco | Controle |
|---|---|---|
| Sessão (PWA) | roubo de cookie, força bruta | cookie `HttpOnly`, `Secure`, `SameSite=Lax`, sessão no servidor com expiração longa renovável, hash bcrypt, limite de tentativas de login com atraso crescente, logout revoga a sessão |
| Telegram webhook | requisições forjadas, outro usuário falando com o bot | verificar o cabeçalho de secret token em tempo constante, aceitar somente o `chatId` cadastrado em `TelegramLink`, ignorar silenciosamente os demais, validar o payload com Zod, ações de escrita pedem confirmação |
| MCP | acesso indevido a dados | token longo e aleatório em cabeçalho, comparação em tempo constante, somente leitura por padrão, escrita opt-in por tool, mesmas regras de `userId` das tools, rotação possível e registro de uso |
| Cron (Vercel) | disparo externo de jobs | `CRON_SECRET` validado em `Authorization: Bearer`, jobs idempotentes (ADR-030) para que repetição não duplique dados |
| Segredos | vazamento | só em variáveis de ambiente da Vercel (escopos Production/Preview separados) e `.env.local` fora do Git; nenhum segredo em código, docs ou logs; rotação ao menor indício |
| Dados reais e Git | repositório público | Constituição: dados reais fora do Git; extratos em `private/` (gitignored); fixtures só sintéticas em `tests/fixtures/`; guardrail anti-vazamento do `bootstrap-audit` e hook de pré-commit; pre-commit e CI bloqueiam padrões como CPF e números longos |
| Processamento de extratos | persistência indevida de arquivos | upload processado **em memória**, sem gravar o arquivo em disco ou em bucket; guarda-se apenas o resultado normalizado, o hash e as contagens do `ImportBatch`; limite de tamanho e tipo; parsers sem execução de conteúdo do PDF |
| Entrada do usuário | injeção e XSS | Zod em toda entrada, Prisma parametrizado, React escapa por padrão, CSP restritiva, sem `dangerouslySetInnerHTML` com dado externo |
| Multi-tenant (resíduo) | consulta sem filtro | `userId` em toda tabela e em toda query; testes cobrindo isolamento mesmo sendo single-user |
| IA | vazamento para o provedor, injeção por texto de extrato | redaction obrigatória, extratos nunca enviados, conteúdo externo tratado como dado, tools tipadas, escrita com confirmação (ver `ai/`) |
| Dependências | cadeia de suprimentos | lockfile versionado, `npm audit` e atualização periódica, poucas dependências |
| Transporte | interceptação | somente HTTPS, HSTS pela Vercel, conexão com o Neon via TLS |

## Dados financeiros reais fora do Git

- O que nunca entra no repositório: valores reais de saldo e salário, faturas, contratos, CPF, números de conta ou cartão, nomes de terceiros, nomes de arquivos de extrato do usuário.
- Onde mora o dado real: apenas no banco Neon e em `private/` local (gitignored).
- Exemplos em docs, testes e prompts usam valores redondos fictícios.
- Se um dado real vazar para o Git: considerar comprometido, remover do histórico (reescrita) e rotacionar o que for segredo. Registrar o incidente em `.agents/handoffs/`.

## LGPD pessoal

O dono é titular e controlador dos próprios dados; o tratamento é pessoal e não comercial. Ainda assim, boas práticas valem:

- Minimização: guardar o necessário; extratos originais não são retidos.
- Terceiros: nomes de contrapartes aparecem em descrições bancárias; não são enviados à IA e não entram em docs ou testes.
- Operadores: Vercel, Neon, OpenAI e Telegram processam dados; manter a lista em `docs/integrations/` com finalidade e dados enviados.
- Exportação e exclusão: o app deve permitir exportar tudo (JSON/CSV) e apagar a conta e os dados.
- Retenção: sem prazo automático por ora; registros de `AiUsage` e `AgentRun` não guardam conteúdo sensível.
- Modo privacidade na UI oculta valores em capturas de tela e reuniões.

## Backups do Neon

- Usar o histórico de recuperação (point-in-time) do plano do Neon e confirmar a janela de retenção disponível.
- Backup lógico periódico (`pg_dump`) para armazenamento privado do dono, criptografado, nunca em repositório; frequência mensal e antes de migrations destrutivas.
- Antes de qualquer operação destrutiva (reset, migration que remove coluna), criar branch ou snapshot no Neon; o papel `dados-prisma` tem veto.
- Testar a restauração em um branch do Neon ao menos uma vez por trimestre; backup sem teste de restauração não conta.
- Credenciais do banco separadas por ambiente; Preview usa branch com dados sintéticos, nunca cópia do real.

## Resposta a incidentes (mínimo)

1. Revogar: sessões, token do bot (BotFather), token do MCP, `CRON_SECRET`, chave da OpenAI.
2. Rotacionar `DATABASE_URL` (senha do role no Neon) e redeploy.
3. Revisar logs de acesso e `AgentRun`.
4. Registrar causa e correção em handoff e atualizar este documento.

## Checklist por task

- A task cria superfície exposta? Autenticação, validação e limite de taxa definidos.
- Mexe com segredo? Só variável de ambiente.
- Manipula arquivo do usuário? Em memória, sem persistir.
- Envia algo a terceiro? Passa pelo redator e consta em integrações.
- Teste de isolamento por `userId` coberto.

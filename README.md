# Finance Controller 2.0

Sistema de finanças pessoais de uso pessoal, em **reescrita completa** para a versão 2.0: uma PWA mobile-first com visual _dark glass_ que responde em 2 segundos "quanto posso gastar", deixa lançar um gasto em 5 segundos por texto livre, importa extratos com uma Inbox de revisão, mostra dívidas e juros, acompanha a renda MEI e conversa pelo Telegram.

> A versão 1.x (fases 8 a 41) está preservada no histórico do Git (commit `5cfb2c9`) e documentada em [`docs/roadmap/legado/`](docs/roadmap/legado/).

## Stack

| Camada      | Tecnologia                                                                   |
| ----------- | ---------------------------------------------------------------------------- |
| App         | Next.js 16 (App Router), React 19, TypeScript                                |
| UI          | Tailwind CSS v4, shadcn/Base UI, tokens Dark Glass (`src/styles/tokens.css`) |
| Dados       | PostgreSQL (Neon) + Prisma 7                                                 |
| Validação   | Zod 4                                                                        |
| Testes      | Vitest 4                                                                     |
| Deploy      | Vercel (+ Vercel Cron)                                                       |
| Integrações | OpenAI (orçamento fixo), Telegram Bot API, MCP                               |

## Roadmap

| Fase | Objetivo                                                              | Status                                                          |
| ---- | --------------------------------------------------------------------- | --------------------------------------------------------------- |
| F0   | Fundação: limpeza do legado, schema novo, tokens, shell PWA           | em andamento (FC2-F0-01 limpeza do legado: concluída no branch) |
| F1   | Confiança: ledger, contas, cartões, dívidas, renda MEI, reconciliação | planejada                                                       |
| F2   | Captura: parser de texto, memória de merchant, sheet global           | planejada                                                       |
| F3   | Hoje & Planejar: recorrências, engine Disponível, modo Aperto         | planejada                                                       |
| F4   | Importação & Inbox: PDF/OFX/CSV, regras, matching                     | planejada                                                       |
| F5   | IA, Telegram & MCP                                                    | planejada                                                       |
| F6   | Polimento & hábito: motion, acessibilidade, relatórios                | planejada                                                       |
| F7   | Futuro: Open Finance, modo casal                                      | backlog                                                         |

**Próximo passo:** seguir a F0 (`executar fase F0`). Detalhe de cada task em [`PLANS.md`](PLANS.md).

## Como o projeto é desenvolvido

O desenvolvimento usa a arquitetura de agentes do plugin [bootstrap-agent-architecture](https://github.com/Senavictors/bootstrap-agent-architecture-plugin): um **orquestrador em Opus** conduz cada fase e delega as tasks a **subagentes especialistas em Sonnet**, em ondas paralelas, com revisão obrigatória antes de integrar.

```text
AGENTS.md / CLAUDE.md        roteadores para Claude Code e Codex
.claude/agents/              orquestrador + 7 papéis especialistas
.claude/skills/executar-fase procedimento de execução de uma fase
.codex/agents/               mesmos papéis para o Codex
.agents/                     contexto, tasks, handoffs, ADRs, constituição
docs/                        produto, arquitetura, dados, UI, IA, segurança, roadmap
```

Leitura recomendada: [`AGENTS.md`](AGENTS.md) → [`docs/product/especificacao-fc2.md`](docs/product/especificacao-fc2.md) → [`docs/README.md`](docs/README.md).

## Rodando localmente

Requer Node.js ≥ 20.9 e um PostgreSQL (local ou branch do Neon).

```bash
npm install
cp .env.example .env       # preencha DATABASE_URL e SESSION_SECRET
npx prisma migrate dev
npm run dev                # http://localhost:3000
```

Validação:

```bash
npm run lint
npm test
npm run format:check
npx next build             # npm run build também aplica migrations (prisma migrate deploy)
```

## Privacidade

Este repositório é público. Nenhum dado financeiro real (extratos, faturas, saldos, documentos) é versionado; arquivos pessoais ficam em `private/`, que é ignorado pelo Git. Ver a Constituição em [`.agents/test-onboarding.md`](.agents/test-onboarding.md).

## Licença

Uso pessoal.

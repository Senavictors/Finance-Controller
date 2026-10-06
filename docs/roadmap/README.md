---
estado: planejado
fonte: PLANS.md
ultima-revisao: bootstrap-init 2026-10-05
---

# Roadmap

Fases do Finance Controller 2.0. O índice completo de tasks, papéis, dependências e ondas está em [`PLANS.md`](../../PLANS.md); a spec mestre (§10) em [`../product/especificacao-fc2.md`](../product/especificacao-fc2.md). Este documento resume o que cada fase entrega e como saber que terminou. Execução: orquestrador Opus com subagentes Sonnet em ondas (ADR-031).

## Fases

| Fase | Objetivo | Entrega principal | Saída (critério) |
|---|---|---|---|
| F0 Fundação | limpar o legado e preparar a base | limpeza do 1.x, schema Prisma 2.0 do zero com reset do Neon, tokens dark glass, primitivos de UI, shell PWA, auth single-user, testes e CI | app abre no iPhone instalado como PWA, com as abas vazias, tokens aplicados e banco novo |
| F1 Confiança | números que merecem confiança | ledger e `AccountBalance`, contas, cartões (ciclo de fatura, parcelas), dívidas, renda MEI, reconciliação, categorias padrão | saldo de cada conta no app é igual ao do banco; dívidas e renda modeladas |
| F2 Captura | lançar sem fricção | parser quick-add pt-BR, memória de merchant, use-case `createFromDraft`, sheet global, tela Lançamentos | lançar um gasto em menos de 5 s |
| F3 Hoje & Planejar | responder "quanto posso gastar" | recorrências com matching, orçamento Flex, engine Disponível (modo Aperto), telas Hoje, Planejar e Cartões, metas | "quanto posso gastar" sem clicar; modo Aperto correto |
| F4 Importação & Inbox | fechar o mês rápido | pipeline de importação (OFX, CSV, PDF Itaú e Nubank), `ImportBatch` e `importHash`, regras, matching importado × previsto, Inbox, tela Importar | fechar o mês importando extratos em cerca de 10 min |
| F5 IA, Telegram & MCP | reduzir digitação com orçamento fixo | registro de tools, cliente OpenAI com orçamento e redaction, categorização LLM, fallback do parser, bot, agentes (Vigia, Resumo, Fechamento), MCP | pelo menos 80% categorizado sem toque; bot lança e responde; custo até US$ 1 por mês |
| F6 Polimento & hábito | refinar e fixar o uso | motion e 120 Hz, ritual e sequência, privacy mode, relatórios, acessibilidade, Lighthouse PWA | Lighthouse PWA ok; app aberto em 5 de 7 dias |
| F7 Futuro | backlog sem data | Open Finance via Pluggy, modo casal | sem data |

Ordem lógica: F0 → F1 → F2 → F3 → F4 → F5 → F6; dentro de cada fase, as tasks seguem `depends_on` e agrupam-se em ondas paralelas. F2 e F3 podem se sobrepor onde `PLANS.md` não declara dependência entre as tasks.

## Como acompanhar

- Estado real de cada task: pasta em `.agents/tasks/` (`backlog/` → `active/` → `completed/`).
- Ao concluir uma task, `bootstrap-complete` atualiza os docs afetados, carimba `ultima-revisao` e vira `planejado` em `real` quando cabe; o orquestrador atualiza `PLANS.md` e `.agents/context/CONTEXT.md` a cada onda.
- Mudança de escopo vira task ou ADR, não edição silenciosa deste documento.

<a id="historico-1x"></a>
## Histórico 1.x

O FC 1.x (fases 8 a 41, migradas como `legacy-*` em `.agents/tasks/completed/`) deixou especificações de funcionalidades futuras e um changelog curado. Esse material é histórico e não define o 2.0.

Destino: `docs/roadmap/legado/`, onde ficarão:

- as specs antigas `future-features`;
- o changelog do 1.x.

Esses arquivos são movidos por outro processo (migração de `.docs/`). Ao serem movidos, serão linkados aqui. Qualquer item deles que ainda interesse deve virar task nova em `PLANS.md`, não ser lido como compromisso.

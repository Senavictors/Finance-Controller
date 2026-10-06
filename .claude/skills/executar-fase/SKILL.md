---
name: executar-fase
description: Executa uma fase inteira do Finance Controller 2.0 (F0–F7) com o orquestrador em Opus delegando as tasks a subagentes Sonnet em ondas paralelas, com revisão do qa-revisor, integração sequencial e DoD via bootstrap-complete. Use quando o dono disser "executar fase F1", "roda a F2", "continua a fase atual" ou "executa a task FC2-F3-02".
model: opus
---

# executar-fase — orquestração de uma fase (ADR-031)

## Entradas obrigatórias
- Fase alvo (`F0`…`F7`) ou uma task específica (`FC2-Fx-yy`). Se o dono não disser, use a primeira fase de `PLANS.md` com tasks em `backlog/` cujas dependências já estão em `completed/`.
- Repositório limpo (`git status` sem mudanças não commitadas fora de `.agents/`) ou confirmação do dono para seguir.

## Processo

### 1. Carregar contexto (uma vez por fase)
1. Leia `AGENTS.md`, `.agents/context/CONTEXT.md`, `.agents/test-onboarding.md` (Constituição + perguntas de sanidade) e `PLANS.md`.
2. Liste as tasks da fase em `.agents/tasks/backlog/` e leia o frontmatter (`owner`, `depends_on`, `wave`, `related_adrs`).
3. Responda mentalmente as perguntas de sanidade. Se alguma resposta não bater com o código atual, pare e reporte.

### 2. Montar as ondas
1. Monte o grafo pelas `depends_on` (dependências em outras fases precisam estar em `completed/`; senão, pare e diga qual falta).
2. Onda N = tasks cujas dependências estão todas concluídas. Respeite o campo `wave` como sugestão, não como dogma.
3. Dentro da onda, **serialize** tasks que alteram os mesmos arquivos críticos: `prisma/schema.prisma`, `src/app/globals.css`, `src/styles/tokens.css`, `package.json`, `vercel.json`, `src/server/modules/tools/registry.ts`.
4. Mostre ao dono a tabela da onda (task, papel, arquivos principais) em uma mensagem curta e siga; peça confirmação só se a onda incluir operação destrutiva de banco.

### 3. Executar a onda
Para cada task da onda:
1. Mova o arquivo de `backlog/` para `active/` e atualize `status: active`, `updated_at`.
2. Delegue ao papel do campo `owner` com o Agent tool (`subagent_type` = nome do papel). Com 2+ tasks em paralelo, use `isolation: "worktree"`. Lance todas as delegações paralelas **na mesma mensagem**.
3. Briefing obrigatório de cada delegação (o subagente não vê esta conversa):
   - caminho da task e instrução para ler `AGENTS.md`, a Constituição, os ADRs de `related_adrs` e o próprio papel;
   - o que não tocar (arquivos de outras tasks da onda);
   - validações a rodar (`npm run lint`, `npm test`, `npx next build` quando houver UI/rotas);
   - preencher "Registro de execução" e "Validação" na própria task;
   - formato de retorno: resumo, arquivos alterados, saída resumida dos comandos, pendências e riscos.
4. Ao receber cada retorno, delegue ao `qa-revisor` a revisão da task (critérios de aceitação, Constituição, testes, build). Pode revisar em paralelo com outras implementações ainda em curso.
5. `REPROVADO` → devolva ao mesmo papel com os achados (no máximo 2 ciclos; no terceiro, você assume a correção ou abre handoff e avisa o dono).

### 4. Integrar
1. Integre as tasks aprovadas **uma por vez** (merge do worktree, ou commit direto se não houve worktree), rodando após cada uma: `npm run lint && npm test && npx next build`.
2. Commit por task: `feat(<fase>-<modulo>): <resumo> (FC2-Fx-yy)` com identidade `Senavictors <victorsena760@gmail.com>`. Nunca commite `.env*` nem `private/`.
3. Rode `bootstrap-complete` na task (código → docs → testes). Ela move a task para `completed/` e atualiza docs de `docs/` (frontmatter `estado: planejado → real`, `ultima-revisao`).

### 5. Fechar a onda e a fase
1. Atualize `PLANS.md` (task concluída), `.agents/context/CONTEXT.md` (estado, decisões, riscos) e a seção de roadmap do `README.md`.
2. Repita o passo 2 até não haver tasks da fase em `backlog/`.
3. No fim da fase: rode `bootstrap-audit`, verifique o critério de saída da fase em `PLANS.md` e reporte ao dono em uma mensagem curta: tasks entregues, evidências, o que testar no iPhone, riscos e a próxima fase sugerida.

## Restrições
- Não ampliar o escopo de uma task; achados fora dela viram task nova em `backlog/`.
- Não executar `prisma migrate reset`, migrations no banco de produção, `npm run build` com `DATABASE_URL` de produção, `git push` ou chamadas reais à OpenAI sem confirmação do dono na hora.
- Não declarar uma task concluída sem o parecer `APROVADO` do `qa-revisor` e as evidências registradas.
- Se uma sessão precisar parar no meio, rode `bootstrap-handoff` antes.

## Saída
- Tabela final: task, papel, status, commit, validações.
- Riscos e pendências.
- CONTEXT, PLANS, README e docs atualizados.

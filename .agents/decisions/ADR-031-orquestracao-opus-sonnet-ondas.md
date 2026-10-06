---
id: ADR-031
title: Orquestração do desenvolvimento — Opus orquestrador e subagentes Sonnet em ondas
status: accepted
date: 2026-10-05
deciders: [Victor (dono do produto), orquestrador]
related_tasks: [FC2-F0-01, FC2-F0-07, FC2-F6-04]
supersedes: []
---

# ADR-031 — Orquestração do desenvolvimento: Opus orquestrador e subagentes Sonnet em ondas

## Contexto
A reescrita tem ~50 tasks em 7 fases (`PLANS.md`), executadas por um único desenvolvedor com Claude Code e Codex. Rodar tudo em uma sessão linear é lento e consome contexto; paralelizar sem coordenação gera conflitos de merge e regressões. É preciso custo controlado (modelo maior só onde o raciocínio de coordenação importa), qualidade verificável e continuidade entre sessões (estado fora da conversa).

## Decisão
1. **Orquestrador Opus na sessão principal**: `.claude/settings.json` com `"agent": "orquestrador"` e `"model": "opus"`; definição em `.claude/agents/orquestrador.md`. Ele lê `PLANS.md`, a fase e as tasks, monta as ondas, delega, revisa e integra. Não implementa features grandes sozinho.
2. **Subagentes Sonnet**: cada papel (`dados-prisma`, `dominio-financeiro`, `api-servidor`, `ui-design-system`, `telas-produto`, `ia-integracoes`, `qa-revisor`) em `.claude/agents/NOME-DO-PAPEL.md` com `model: sonnet` e escopo de ferramentas e diretórios declarado. Uma task tem exatamente um papel dono (`owner` na task).
3. **Ondas por `depends_on`**: dentro de uma fase, a onda N contém as tasks cujas dependências estão todas concluídas; tasks da mesma onda não dependem entre si e rodam **em paralelo**. A coluna "Onda" de `PLANS.md` é o resultado desse cálculo; o orquestrador recalcula se uma dependência mudar. Skill `executar-fase` (`.claude/skills/executar-fase/SKILL.md`) automatiza (`executar fase F1`).
4. **Worktrees para paralelismo**: cada subagente da onda trabalha em um `git worktree` próprio (branch no formato `fc2/FC2-F1-01`), evitando conflito de arquivos e de `node_modules` compartilhado. Regra de posse: dois subagentes na mesma onda não editam os mesmos diretórios; `prisma/schema.prisma` e `package.json` só por quem a task designar, com merge sequencial.
5. **qa-revisor com veto**: nenhuma task é concluída sem parecer do `qa-revisor` com evidências (comandos e saída): `npm run lint`, `npm test`, `npx next build`, `npm run format:check`, critérios de aceitação marcados, Constituição respeitada (sem dado real, sem cor literal). `dados-prisma` mantém veto sobre operações destrutivas de banco (reset do Neon só na F0-02).
6. **Um commit por task** (Conventional Commits, ex.: `feat(f1-ledger): ...`) com identidade `Senavictors`; merge sequencial das branches da onda em `main`, rodando testes após cada merge. Falhou: a task volta ao subagente com o parecer, no máximo 2 rodadas; depois o orquestrador escala ao dono.
7. **`bootstrap-complete` como Definition of Done**: ao fechar cada task, o orquestrador executa a skill, que verifica código, docs e testes, atualiza `.agents/context/CONTEXT.md`, `PLANS.md` e `README.md`, e move a task de `active/` para `completed/`. Pausas usam `bootstrap-handoff` (`.agents/handoffs/`). Decisões arquiteturais novas viram ADR.
8. **Estado fora da conversa**: tudo o que importa vive em `.agents/` (tasks, handoffs, memória, decisões) e `docs/`, não na janela de contexto. Subagentes recebem como entrada: a task, os ADRs de `related_adrs`, a spec e o papel.
9. **Codex replica os papéis**: `.codex/agents/NOME-DO-PAPEL.toml` (ou equivalente) espelha os mesmos papéis e regras de `.claude/agents/`, com `AGENTS.md` como fonte principal para ambos. A skill `bootstrap-audit` verifica a paridade dos formatos antes de commit.
10. **Limites de engenharia**: no máximo 4 subagentes simultâneos por onda; cada task <= 1 dia de trabalho e <= 400 linhas de diff líquido (acima disso, o orquestrador divide a task).

## Alternativas consideradas
### Alternativa A — Uma sessão única, sem subagentes
- Vantagens: simplicidade; contexto contínuo.
- Desvantagens: contexto estoura em fases longas; sem paralelismo; revisão feita pelo mesmo agente que escreveu.

### Alternativa B — Todos os agentes em Opus
- Vantagens: máxima qualidade por tarefa.
- Desvantagens: custo desproporcional para tarefas de implementação bem especificadas; o ganho está na coordenação e na revisão, não em cada edição.

### Alternativa C — Paralelismo no mesmo diretório de trabalho (sem worktrees)
- Vantagens: sem configuração.
- Desvantagens: conflitos de arquivo, builds interferindo uns nos outros e estado sujo difícil de atribuir a uma task.

## Consequências
### Positivas
- Entrega em ondas com revisão independente; custo de modelo proporcional ao valor.
- Retomada simples entre sessões e entre ferramentas (Claude Code e Codex).

### Negativas
- Overhead de processo (task, parecer, handoff) em mudanças pequenas.
- Conflitos de integração concentrados no merge de `schema.prisma` e `package.json`.

### Riscos
- Subagente sai do escopo: mitigado por escopo de diretórios no papel e veto do `qa-revisor`.
- Divergência entre `.claude/agents/` e `.codex/agents/`: verificação por `bootstrap-audit`.
- Documentação desatualizada: DoD obriga atualizar CONTEXT, PLANS e README por task.

## Plano de adoção
1. Bootstrap (feito em 2026-10-05): papéis, skill `executar-fase`, `.claude/settings.json`, `.codex/agents/`.
2. FC2-F0-01 e F0-03 formam a primeira onda da F0, testando o fluxo completo (worktrees, qa-revisor, bootstrap-complete).
3. FC2-F0-07: CI e fixtures sintéticas dão ao `qa-revisor` o gate objetivo; FC2-F6-04 fecha com auditoria final.

## Validação
- Em cada fase: 100% das tasks concluídas têm parecer do `qa-revisor` anexado e um commit.
- Zero merge quebrando `main` (CI verde após cada integração).
- `bootstrap-audit` sem pendências antes de cada release de fase.

## Revisão
Ao final da F1 (avaliar tamanho das ondas, custo e taxa de retrabalho) e a cada novo modelo disponível.

# Instruções para Claude Code — Finance Controller 2.0

Arquivo versionado. A fonte principal é `AGENTS.md`, na raiz.

Leia nesta ordem:
1. `AGENTS.md`
2. `.agents/context/CONTEXT.md`
3. task ativa em `.agents/tasks/active/` (se houver) ou a fase em `PLANS.md`
4. o subagente especializado relevante em `.claude/agents/`

Sessão principal: roda como **orquestrador em Opus** (`.claude/settings.json` → `"agent": "orquestrador"`, `"model": "opus"`). Para executar uma fase inteira: skill `executar-fase` (ex.: "executar fase F1").

Subagentes (Sonnet): `.claude/agents/` — `dados-prisma`, `dominio-financeiro`, `api-servidor`, `ui-design-system`, `telas-produto`, `ia-integracoes`, `qa-revisor`.
Skills do projeto: `.claude/skills/executar-fase/` (além das skills do plugin bootstrap: `bootstrap-plan`, `bootstrap-complete`, `bootstrap-handoff`, `bootstrap-audit`).
Regras globais: `.claude/rules/global.md`

Não trate este arquivo como documentação completa. Siga os links indicados e registre o estado necessário à continuidade em `.agents/tasks/` e `.agents/handoffs/`.

---
name: worktree-base-e-crlf
description: Worktrees de subagentes nascem em commit antigo (não no HEAD de main) e o checkout Windows usa CRLF, quebrando format:check
metadata:
  type: feedback
---

Worktrees criados via `isolation: worktree` partiram de `5cfb2c9` (último commit do remoto/origem), não do HEAD local de `main`. Todo briefing de implementador em worktree deve mandar rodar `git merge --ff-only main` antes de começar e confirmar que a task existe em `.agents/tasks/active/`.

**Why:** na F0 onda 1 o worktree não tinha AGENTS.md 2.0 nem a task; o agente só percebeu por acaso.

**How to apply:** incluir a instrução no topo de todo briefing com worktree; worktree também não tem `node_modules` (rodar `npm ci`) nem `.env`.

Checkout Windows tem `core.autocrlf=true`; `npm run format:check` (Prettier `endOfLine: lf`) falha localmente por CRLF. Use `npx prettier --check --end-of-line auto <arquivos>` para avaliar formatação real localmente. Ver [[fase-f0-estado]].

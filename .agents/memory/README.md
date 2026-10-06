# Memória persistente dos agentes — Finance Controller 2.0

Notas curtas que valem entre sessões e não cabem em task, handoff ou ADR: armadilhas descobertas, comandos que funcionaram, preferências de execução do dono.

Regras:
- Um arquivo por assunto (`<assunto>.md`), poucas linhas, com data.
- Versionado no Git: **nada de dados financeiros reais, segredos ou nomes de terceiros** (Constituição).
- Se a nota virar regra, mova para `.claude/rules/global.md` ou para um ADR e apague daqui.

Notas iniciais:
- 2026-10-05 — O repositório local fica dentro do OneDrive no Windows; o Git pode mostrar arquivos como modificados só por permissão. Use `git config core.fileMode false` se isso atrapalhar diffs.
- 2026-10-05 — `npm run build` roda `prisma migrate deploy` antes do `next build`. Para validar compilação sem tocar banco, use `npx next build`.
- 2026-10-05 — O dono prefere explicações visuais (tabelas, diagramas, antes/depois) nos relatórios de fim de fase.

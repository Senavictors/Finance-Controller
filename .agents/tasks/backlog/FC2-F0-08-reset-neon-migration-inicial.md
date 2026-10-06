---
id: FC2-F0-08
title: Reset do Neon e aplicação da migration inicial (portão humano)
status: backlog
type: chore
phase: F0
wave: 3
owner: dados-prisma
depends_on: [FC2-F0-02]
created_at: 2026-10-05
updated_at: 2026-10-05
affected_modules: [prisma, db]
related_use_cases: []
related_adrs: [ADR-016, ADR-019]
---

# FC2-F0-08 — Reset do Neon e aplicação da migration inicial

## Contexto
Desmembrada da FC2-F0-02 pelo orquestrador em 2026-10-05: a F0-02 entregou schema, migration `init_fc2` e teste de contrato sem tocar em banco; as etapas 7–9 (portão de confirmação, reset, verificação) e os critérios CA-05 e CA-08 da F0-02 passam para cá. Motivo: o reset depende de insumos que só o dono tem (`DATABASE_URL`, snapshot/branch de segurança e confirmação literal na hora), e a F0-06 depende apenas do schema em código.

## Objetivo
Zerar o banco Neon e aplicar a migration `init_fc2`, somente após confirmação humana explícita, com rollback garantido.

## Fora de escopo
Qualquer alteração de schema (volta para a F0-02 / nova task), seed (F1-07, F0-06).

## Pré-requisitos (fornecidos pelo dono)
- `.env` local com `DATABASE_URL` (e, se a URL for a pooled `-pooler`, a string direta para migrations).
- Branch ou snapshot de segurança criado no console do Neon, com nome/id informado.

## Regras de negócio
- RN-01: Nada roda sem a pergunta literal "Confirma apagar TODOS os dados deste banco (host X, database Y) e recriar o schema 2.0?" e resposta afirmativa do dono no chat, no momento.
- RN-02: Host mostrado sempre mascarado (sem usuário/senha). Recusar se host/database não forem os esperados ou se a resposta for ambígua.
- RN-03: O banco é compartilhado com a produção da Vercel: avisar o dono.

## Critérios de aceitação
- [ ] CA-01 (ex-CA-05 da F0-02): `npx prisma migrate status` informa "Database schema is up to date"; a listagem de tabelas mostra só as 29 tabelas 2.0 (sem `wishlist_items`, `dashboards`, `forecast_snapshots`, `recurring_rules`...).
- [ ] CA-02 (ex-CA-08 da F0-02): o Registro de execução traz host mascarado, nome do database, id do snapshot/branch de segurança, a pergunta feita, a resposta literal, o horário e o resultado.
- [ ] CA-03: nenhum segredo registrado em arquivo versionado.

## Plano de implementação
- [ ] Etapa 1 — Mostrar ao dono host mascarado, database e tabelas atuais com contagem de linhas.
- [ ] Etapa 2 — Confirmar o snapshot/branch de segurança; fazer a pergunta literal; aguardar.
- [ ] Etapa 3 — `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="<resposta literal>" npx prisma migrate reset --force --skip-seed` (com a string direta, se necessário). Alternativa: `DROP SCHEMA public CASCADE; CREATE SCHEMA public;` + `npx prisma migrate deploy`, também só após confirmação.
- [ ] Etapa 4 — `npx prisma migrate status`; listar tabelas; registrar.

## Riscos e rollback
Perda de dados mitigada pelo snapshot/branch; rollback = restaurar o snapshot ou promover o branch de segurança.

## Registro de execução
### Alterações realizadas
### Decisões
### Divergências
### Pendências

## Validação
Comandos e resultados.

## Handoff

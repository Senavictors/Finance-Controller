---
id: FC2-F1-10
title: Endurecimentos do módulo de dívidas (achados da revisão da F1-05)
status: completed
type: fix
phase: F1
wave: 4
owner: dominio-financeiro
depends_on: [FC2-F1-05]
created_at: 2026-10-07
updated_at: 2026-10-09
affected_modules: [debts]
related_use_cases: [registerInstallmentPayment, createLoan, deleteLoan]
related_adrs: [ADR-028, ADR-025]
---

# FC2-F1-10 — Endurecimentos do módulo de dívidas

## Contexto
Criada pelo orquestrador em 2026-10-07 a partir dos achados menores da revisão QA da FC2-F1-05 (`.agents/tasks/completed/FC2-F1-05-dividas-juros.md`, seção Validação).

## Objetivo
1. `registerInstallmentPayment` recusa pagamento de parcela de contrato `PAID_OFF`/arquivado com erro estável (`DEBT_NOT_ACTIVE`).
2. Criação de dívida `OVERDRAFT`/`CARD_REVOLVING` por conta é atômica: duas criações concorrentes para a mesma conta resultam em uma só (lock da conta ou verificação dentro da mesma transação).
3. `deleteLoan` também bloqueia quando há parcelas marcadas como pagas na criação (sem lançamento), conforme o texto da F1-05.
4. Documentar o truncamento de `lateFeePct`/`lateInterestMonthlyPct` (`Decimal(5,2)`) e validar na entrada que o percentual tem no máximo 2 casas (erro claro em vez de truncar).

## Fora de escopo
Migration (se for preferível aumentar a escala do Decimal, abrir pendência para `dados-prisma`).

## Critérios de aceitação
- [x] CA-01: pagar parcela de contrato encerrado → `DEBT_NOT_ACTIVE`, sem efeitos (memória + Postgres).
- [x] CA-02: 10 criações concorrentes de cheque especial na mesma conta → 1 dívida (Postgres).
- [x] CA-03: `deleteLoan` com parcela pré-marcada como paga → bloqueado.
- [x] CA-04: percentual com 3 casas recusado com mensagem clara.
- [x] CA-05: `npm run lint`, `npm run typecheck`, `npm test`, `npm run guard:data`, `npx next build` passam; integração verde.

## Registro de execução
### Alterações realizadas
- `registerInstallmentPayment`: contrato quitado ou arquivado recusa com `DEBT_NOT_ACTIVE` (409), sem efeitos; `DEFAULTED` segue aceitando.
- `insertLoanForAccountIfAbsent` (Prisma e memória): checagem e criação de cheque especial/rotativo na mesma transação, serializadas por `pg_advisory_xact_lock` sobre (usuário, conta, tipo).
- `deleteLoan`: bloqueado também com parcela pré-marcada como paga na criação.
- `assertPercentPrecision` em `domain/new-loan.ts`: multa e mora com mais de 2 casas no percentual são recusadas ao criar e ao editar.
- `docs/domain/dividas.md`: convenção do limite de 2 casas e seção "Regras de integridade".
### Decisões
- Sem migration: manter `Decimal(5,2)` e validar na entrada (o Fora de escopo pedia isso).
### Pendências
- Nenhuma.

## Validação
- Implementação feita por subagente em 07/10 no worktree `agent-aaa4aed5aa40d9bb4`, que caiu sem commitar; retomada em 09/10 aplicando o diff no `main` (worktree preservado).
- `npm run lint`, `npm run typecheck`: ok. `npm test` com Postgres 16 descartável (`DATABASE_URL_TEST`): 111 arquivos, 1746 testes (+12 desta task), 2 pulados. `npm run guard:data`: 195 testes. `npx next build`: ok.
- Cobertura por critério: CA-01, CA-02 e CA-04 em memória e em Postgres; CA-03 em Postgres e no teste do use-case.


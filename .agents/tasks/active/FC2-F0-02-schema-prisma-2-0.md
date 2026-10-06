---
id: FC2-F0-02
title: Schema Prisma 2.0 do zero + reset do Neon + migration inicial
status: active
type: feature
phase: F0
wave: 2
owner: dados-prisma
depends_on: [FC2-F0-01]
created_at: 2026-10-05
updated_at: 2026-10-05
affected_modules: [prisma, db, auth]
related_use_cases: []
related_adrs: [ADR-016, ADR-002, ADR-004, ADR-008, ADR-019, ADR-020, ADR-023, ADR-026, ADR-027, ADR-028, ADR-029]
---

# FC2-F0-02 — Schema Prisma 2.0 do zero

## Contexto
O FC 2.0 reescreve o modelo de dados (§6 da especificação) com o banco zerado (decisão do dono em 05/10/2026, ADR-016). O schema 1.x (`prisma/schema.prisma`, 21 models, 12 migrations) modela transações por `type` + `amount` positivo, sem status, sem importação, sem séries, sem dívidas. O 2.0 precisa de ledger com status, cache de saldo, importação com hash, recorrência por série, dívidas, renda MEI e rastreio de IA. Todas as tasks de F1 em diante dependem deste schema; ele é a task mais crítica da fundação.

O papel `dados-prisma` tem **veto** sobre operações destrutivas de banco: o reset do Neon só acontece com confirmação humana explícita, no momento da execução.

## Problema
- O schema 1.x não representa: status de lançamento, kinds, revisão/Inbox, `importHash`, merchants, regras, séries RRULE, `IncomeRule`, `Loan`, `AccountBalance`, `Reconciliation`, `MeiLedger`, IA e Telegram.
- Valores monetários e datas precisam seguir ADR-002 (centavos `Int`; datas de calendário ao meio-dia UTC) de forma consistente em todos os modelos.
- Há 12 migrations acumuladas do 1.x que não devem coexistir com o novo modelo.

## Objetivo
1. Escrever `prisma/schema.prisma` 2.0 completo, do zero, conforme a lista de modelos abaixo.
2. Apagar `prisma/migrations/` antigo e gerar uma migration inicial única, com CHECK constraints adicionados em SQL.
3. Zerar o banco Neon (`prisma migrate reset`) **somente após confirmação humana explícita** e validada pelo papel `dados-prisma`.
4. `npx prisma generate` e `npx next build` passam; um teste de contrato do schema (Vitest) protege decisões-chave.

## Fora de escopo
- Qualquer use-case, repositório ou rota (cada módulo tem sua task).
- Seed de categorias (FC2-F1-07) e criação do dono (FC2-F0-06). **Nenhum seed é executado aqui.**
- Tabelas de Watchlist e dados de relatórios (F3-03 e F6-03 adicionam migrations incrementais).
- Row Level Security / Neon Auth. A isolação é por `userId` em toda query (single-user, mas mantido por segurança).

## Comportamento atual
`prisma/schema.prisma` (1.x): `User` (com `image`), `Session` (token em texto), `Account` (`initialBalance`, `statementClosingDay`, `statementDueDay`, `networkBrandKey`), `Category`, `Transaction` (`type INCOME|EXPENSE|TRANSFER`, `amount` positivo, `transferId`, `creditCardStatementId`), `CreditCardStatement` (unique `[accountId, periodStart]`), `CreditCardPurchase`/`CreditCardPurchaseInstallment`/`CreditCardInstallmentAdvance`, `RecurringRule`/`RecurringLog`, `Goal`, `Wishlist*`, `ForecastSnapshot`, `FinancialScoreSnapshot`, `InsightSnapshot`, `Dashboard`/`DashboardWidget`. Gerador `prisma-client` com saída em `src/generated/prisma`; `prisma.config.ts` lê `DATABASE_URL`. `src/server/db.ts` usa `@prisma/adapter-pg`.

## Comportamento esperado
### Convenções globais
- Tabelas `snake_case` plural via `@@map`, colunas `snake_case` via `@map`, ids `String @id @default(cuid())` (como no 1.x), `createdAt`/`updatedAt` em todos os modelos mutáveis.
- Dinheiro: `Int` em centavos. **`Transaction.amount` é assinado**: positivo entra na conta, negativo sai da conta, nunca zero. Saldo de uma conta = soma dos `amount`. Em conta de cartão (`CREDIT_CARD`) o saldo é ≤ 0 na prática (negativo = dívida da fatura).
- Taxas: `Decimal(9,6)` como **fração mensal** (1,99% a.m. = `0.019900`); a camada de domínio converte com `.toNumber()` na borda do repositório.
- Tempo: colunas de data de calendário são `DateTime` guardando **meio-dia UTC**; instantes (`createdAt`, `startedAt`) em UTC normal. Nenhum `@db.Date`.
- Cores/ícones por **chave de token** (`colorKey` como `cat-3`), nunca hex.
- Todo modelo financeiro tem `userId` com `onDelete: Cascade` e índice começando por `userId` quando consultado por usuário.

### Enums (todos com `@@map` snake_case)
`AccountType` (CHECKING, SAVINGS, WALLET, INVESTMENT, CREDIT_CARD, BUSINESS) · `CategoryType` (INCOME, EXPENSE) · `Nature` (MUST, NEED, WANT) · `TxnKind` (EXPENSE, INCOME, TRANSFER, CARD_PAYMENT, FEE, INTEREST, ADJUSTMENT) · `TxnStatus` (PLANNED, PENDING, CLEARED, RECONCILED) · `ReviewState` (NEEDS_REVIEW, REVIEWED) · `TxnSource` (MANUAL, QUICKADD, IMPORT, BOT, RECURRING, OPEN_FINANCE) · `CategorySource` (USER, RULE, MERCHANT, LLM, PARSER, IMPORT) · `SeriesKind` (BILL, SUBSCRIPTION, INCOME, TRANSFER, LOAN_INSTALLMENT, TAX) · `LoanKind` (CONSIGNADO, PERSONAL, OVERDRAFT, CARD_REVOLVING, CARD_REFINANCE, PIX_CREDIT) · `LoanSystem` (PRICE) · `LoanStatus` (ACTIVE, PAID_OFF, DEFAULTED) · `InstallmentStatus` (PENDING, PAID, SKIPPED) · `StatementStatus` (OPEN, CLOSED, PAID, OVERDUE) · `BudgetBucket` (FIXED, NON_MONTHLY, FLEX) · `RuleStage` (PRE, DEFAULT, POST) · `RuleOrigin` (USER, LEARNED) · `ImportKind` (OFX, CSV, PDF_ITAU_EXTRATO, PDF_ITAU_FATURA, PDF_NUBANK_EXTRATO, PDF_NUBANK_FATURA) · `ImportStatus` (PENDING, PROCESSED, FAILED, UNDONE) · `GoalKind` (RESERVE, PRIORITY, WISH, DEBT_PAYOFF) · `GoalStatus` (ACTIVE, DONE, ARCHIVED) · `ReconStatus` (MATCHED, ADJUSTED, UNDONE) · `CycleMode` (CALENDAR_MONTH, INCOME_CYCLE) · `BusinessDayRule` (NONE, NEXT_BUSINESS_DAY, PREVIOUS_BUSINESS_DAY) · `AdditionalBasis` (PREVIOUS_MONTH, SAME_MONTH) · `AgentRunStatus` (RUNNING, OK, FAILED).

Extensões em relação ao resumo da §6 (justificar em "Decisões"): `LoanKind.CARD_REVOLVING` (rotativo), `Transaction.refundOfId` (estorno), `Transaction.occurrenceKey` (idempotência de previstos), `UserSettings`, `MeiProfile`, `LoginAttempt`, `Session.tokenHash`.

### Modelos, campos-chave, índices e uniques
1. **User** — `email @unique`, `name?`, `password` (hash bcrypt), timestamps. Sem `image`.
2. **Session** — `userId`, `tokenHash @unique` (SHA-256 do token do cookie), `expiresAt`, `lastSeenAt`, `userAgent?`. Índices: `[userId]`, `[expiresAt]`.
3. **LoginAttempt** — `key` (hash de IP+email), `success`, `createdAt`. Índice `[key, createdAt]`.
4. **UserSettings** — `userId @unique`, `timezone` default `America/Sao_Paulo`, `cycleMode` default `INCOME_CYCLE`, `cushionCents` default 0, `aiMonthlyBudgetMicroUsd` default 1000000, `aiTotalBudgetMicroUsd` default 5000000, `privacyMode` default false.
5. **Account** — `name`, `type`, `issuerKey?`, `networkKey?`, `colorKey?`, `icon?`, `overdraftLimit` default 0, `creditLimit?`, `closingDay?`, `dueDay?`, `isArchived`, `sortOrder`. `@@unique([userId, name])`, `@@index([userId, isArchived])`.
6. **AccountBalance** — `accountId @id` (1:1 com Account, cascade), `userId`, `balanceCleared`, `balancePending`, `balancePlanned` (default 0), `lastEntryDate?`, `version Int @default(0)`, `updatedAt`. `@@index([userId])`. Cache derivado (ADR-019); recalculável a partir de `Transaction`.
7. **Reconciliation** — `accountId`, `asOfDate`, `bankBalance`, `ledgerBalance`, `difference`, `status ReconStatus`, `reconciledCount`, `reconciledIds Json?` (ids travados, usado para desfazer na F1-04), `adjustmentTransactionId? @unique`, `note?`, `createdAt`. `@@index([accountId, asOfDate(sort: Desc)])`.
8. **Category** — `key` (slug estável), `name`, `type`, `nature?`, `icon?`, `colorKey?`, `parentId?` (self-relation, `onDelete: SetNull`), `sortOrder`, `isSystem`, `isArchived`. `@@unique([userId, key])`, `@@index([userId, parentId])`.
9. **Merchant** — `name`, `normalizedKey`, `aliases String[]`, `defaultCategoryId?`, `recentCategoryIds String[]` (últimas 3), `nature?`, `defaultAccountId?`, `brandKey?`. `@@unique([userId, normalizedKey])`, `@@index([aliases], type: Gin)`.
10. **Transaction** — `accountId`, `categoryId?`, `merchantId?`, `kind`, `status` default CLEARED, `review` default REVIEWED, `source` default MANUAL, `amount Int`, `date` (meio-dia UTC), `postedDate?`, `description`, `rawDescription?`, `notes?`, `tags String[]`, `transferId?` (UUID do par), `refundOfId?` (self-relation), `seriesId?`, `occurrenceKey?`, `statementId?`, `statementKey?` (`YYYY-MM` do vencimento), `importBatchId?`, `importHash?`, `categorySource?`, `aiConfidence Int?` (0-100), `userLocked Json @default("{}")`, `excludeFromBudget Boolean @default(false)`, `originalCurrency?`, `originalAmount Int?`.
    - Uniques: `@@unique([userId, importHash])`, `@@unique([userId, occurrenceKey])`, `@@unique([transferId, accountId])` (no máximo uma perna por conta em cada par).
    - Índices: `[userId, date(sort: Desc)]`, `[accountId, date(sort: Desc)]`, `[accountId, status]`, `[userId, status, date]`, `[userId, review]`, `[categoryId, date]`, `[merchantId]`, `[statementId]`, `[seriesId, date]`, `[transferId]`, `[importBatchId]`, `[tags] type: Gin`.
11. **RecurringSeries** — `kind SeriesKind`, `name`, `accountId`, `toAccountId?`, `categoryId?`, `merchantId?`, `amount Int` (assinado, esperado), `amountTolerancePct Int @default(10)`, `dayTolerance Int @default(3)`, `rrule String`, `dtstart`, `until?`, `autoConfirm`, `isActive`, `materializedUntil?`, `incomeRuleId?`, `loanId?`. `@@index([userId, isActive])`.
12. **IncomeRule** — `name`, `baseCents`, `perDayCents`, `weekdays Int[]` (0=domingo..6=sábado), `payDay Int` (1-31), `paymentAdjust BusinessDayRule @default(NEXT_BUSINESS_DAY)`, `additionalBasis AdditionalBasis @default(PREVIOUS_MONTH)`, `destinationAccountId`, `extraDaysOff String[]` (ISO `YYYY-MM-DD`), `attendanceOverrides Json @default("{}")` (mapa data → boolean), `startDate`, `endDate?`, `isActive`. `@@index([userId, isActive])`.
13. **MeiProfile** — `userId @unique`, `openedAt?`, `annualCeilingCents Int @default(8100000)`, `dasAmountCents Int`, `dasDueDay Int @default(20)`, `dasAccountId?`, `businessAccountId?`. **Sem CNPJ.**
14. **MeiLedger** — `year`, `accumulatedCents`, `proportionalCeilingCents`, `byMonth Json` (12 inteiros), `lastRecomputedAt`. `@@unique([userId, year])`.
15. **Loan** — `kind`, `name`, `lenderName?`, `accountId?` (conta onde debita / conta do cheque especial), `principalCents`, `monthlyRate Decimal(9,6)`, `installmentCount?`, `installmentAmountCents?`, `firstDueDate?`, `contractedAt?`, `system LoanSystem @default(PRICE)`, `outstandingCents` (cache), `lateFeePct Decimal(5,2) @default(2)`, `lateInterestMonthlyPct Decimal(5,2) @default(1)`, `status`, `categoryId?`, `notes?`. `@@index([userId, status])`.
16. **LoanInstallment** — `loanId`, `number`, `dueDate`, `principalCents`, `interestCents`, `amountCents`, `status`, `paidAt?`, `paidAmountCents?`, `lateChargesCents @default(0)`, `transactionId? @unique`. `@@unique([loanId, number])`, `@@index([dueDate])`.
17. **CreditCardStatement** — como 1.x + `statementKey`: `accountId`, `periodStart`, `periodEnd`, `closingDate`, `dueDate`, `statementKey`, `totalAmount`, `paidAmount`, `status StatementStatus`. `@@unique([accountId, periodStart])`, `@@unique([accountId, statementKey])`, `@@index([userId, dueDate])`.
18. **CardPurchase** — `accountId`, `categoryId?`, `merchantId?`, `description`, `notes?`, `purchaseDate`, `totalAmount`, `installmentCount`. **CardInstallment** — `purchaseId`, `advanceId?`, `installmentNumber`, `originalAmount`, `originalDate`, `ledgerTransactionId @unique`; `@@unique([purchaseId, installmentNumber])`. **CardInstallmentAdvance** — `purchaseId`, `accountId`, `advancedAt`, `totalOriginalAmount`, `totalPaidAmount`, `totalDiscountAmount`, `notes?`. (Sem vínculo com wishlist.)
19. **BudgetCycle** — `startDate`, `endDate`, `flexAmount`, `cushion`, `expectedIncome?`; `@@unique([userId, startDate])`. **BudgetLine** — `cycleId`, `bucket`, `categoryId?`, `label`, `plannedCents`; `@@index([cycleId])`.
20. **Rule** — `name`, `stage`, `priority`, `conditions Json`, `actions Json`, `origin`, `hits Int @default(0)`, `lastHitAt?`, `isActive`. `@@index([userId, stage, priority])`.
21. **ImportBatch** — `kind`, `accountId?`, `fileSha256`, `fileLabel?`, `periodStart?`, `periodEnd?`, `totalRows`, `newCount`, `duplicateCount`, `matchedCount`, `errorCount`, `status`, `errorLog Json?`. `@@unique([userId, fileSha256])`.
22. **Goal** — `kind`, `name`, `targetCents`, `currentCents`, `targetDate?`, `priority`, `accountId?`, `loanId?`, `categoryId?`, `status`, `notes?`.
23. **Memory** — `key`, `value Json`, `scope`; `@@unique([userId, key])`. **AgentRun** — `agent`, `status`, `startedAt`, `finishedAt?`, `summary?`, `input Json?`, `output Json?`, `costMicroUsd Int @default(0)`; `@@index([userId, agent, startedAt(sort: Desc)])`. **AiUsage** — `model`, `purpose`, `inputTokens`, `outputTokens`, `costMicroUsd`, `agentRunId?`, `createdAt`; `@@index([userId, createdAt])`. **TelegramLink** — `userId @unique`, `chatId String @unique`, `username?`, `isActive`, `linkedAt`.

Relações com `onDelete` explícito: filhos de `User` e `Account` em `Cascade`; referências opcionais a Category/Merchant/Series/ImportBatch em `SetNull`; `Transaction.statementId` `SetNull`; `CardInstallment.ledgerTransactionId` `Cascade`.

### Migration inicial (SQL manual anexado)
Gerar com `--create-only` e acrescentar ao `migration.sql`:
```sql
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_amount_nonzero" CHECK ("amount" <> 0);
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_pair_requires_transfer_id"
  CHECK (("kind" NOT IN ('TRANSFER','CARD_PAYMENT')) OR "transfer_id" IS NOT NULL);
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_overdraft_nonneg" CHECK ("overdraft_limit" >= 0);
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_days_range"
  CHECK (("closing_day" IS NULL OR "closing_day" BETWEEN 1 AND 31) AND ("due_day" IS NULL OR "due_day" BETWEEN 1 AND 31));
ALTER TABLE "income_rules" ADD CONSTRAINT "income_rules_pay_day_range" CHECK ("pay_day" BETWEEN 1 AND 31);
```

## Regras de negócio
- RN-01: Valores monetários sempre `Int` em centavos (ADR-002); `Transaction.amount` assinado e diferente de zero.
- RN-02: Todo modelo financeiro carrega `userId`; nenhuma unique cruza usuários (uniques sempre incluem `userId` ou chave filha de registro já escopado).
- RN-03: Transferência e pagamento de fatura são **pares ligados** por `transferId` (ADR-004), uma perna por conta (`@@unique([transferId, accountId])`).
- RN-04: `importHash` é único por usuário e `occurrenceKey` é único por usuário: garantem idempotência de importação e de previstos.
- RN-05: `AccountBalance` é cache; a fonte de verdade é a soma de `Transaction` (ADR-019).
- RN-06: Nenhum dado real, nenhum seed, nenhum CNPJ/CPF/número de conta em colunas ou comentários; exemplos nos comentários do schema usam valores fictícios.
- RN-07: O reset do banco exige confirmação humana explícita e validação do ambiente pelo `dados-prisma` (ver plano).

## Critérios de aceitação
- [ ] CA-01: `npx prisma validate` e `npx prisma generate` passam; `src/generated/prisma` contém todos os modelos listados em "Modelos" (inclui `Transaction`, `AccountBalance`, `Loan`, `IncomeRule`, `MeiLedger`, `TelegramLink`).
- [ ] CA-02: `prisma/migrations/` contém exatamente `migration_lock.toml` e **uma** pasta de migration (`AAAAMMDDHHMMSS_init_fc2`); as 12 migrations 1.x não existem mais.
- [ ] CA-03: O `migration.sql` inicial contém as 5 `CHECK` constraints acima (verificável por `grep -c "CHECK" prisma/migrations/*_init_fc2/migration.sql` >= 5).
- [ ] CA-04: Teste de contrato `prisma/schema.contract.test.ts` (Vitest, lê o texto do schema) falha se: faltar `@@unique([userId, importHash])`; faltar `@@unique([transferId, accountId])`; existir qualquer campo de dinheiro (`*Cents`, `amount`, `*Limit`, `*Amount`, `balance*`) com tipo diferente de `Int`; existir `@db.Date`; existir `Float`.
- [ ] CA-05: Após o reset autorizado, `npx prisma migrate status` informa "Database schema is up to date" e `\dt` (ou `mcp Neon get_database_tables`) lista as tabelas novas sem nenhuma tabela 1.x (`wishlist_items`, `dashboards`, `forecast_snapshots`, `recurring_rules`...).
- [ ] CA-06: `npx next build` passa (o código mantido após a F0-01 não referencia modelos removidos; ajustar `src/server/auth/*` para `Session.tokenHash` mantendo comportamento até a F0-06 — ver plano etapa 6).
- [ ] CA-07: Nenhum arquivo de seed existe e `package.json`/`prisma.config.ts` não definem `seed`.
- [ ] CA-08: O "Registro de execução" traz: host do banco (sem credenciais), nome do database, a pergunta de confirmação feita ao humano e a resposta literal, o horário e o resultado do reset.

## Impacto técnico
### Backend
`src/server/auth/session.ts` passa a gravar/consultar `tokenHash` (SHA-256 do token) em vez do token em claro, e `lastSeenAt`; o cookie continua com o token bruto. É a única alteração de código de aplicação desta task (a renovação deslizante e o resto do auth ficam na F0-06).
### Frontend
Nenhum.
### Banco de dados
Schema novo; pasta de migrations nova; reset do Neon. `DATABASE_URL` (pooled) para a app e, se necessário para migrate, `DIRECT_URL` — confirmar no painel do Neon qual string o `prisma.config.ts` deve usar para migrations (o 1.x usa só `DATABASE_URL`; manter se `migrate dev` funcionar).
### Integrações
Neon. Antes do reset, criar um branch/snapshot de segurança do Neon (MCP `create_branch`/`create_snapshot` ou console) para permitir rollback, mesmo com o dono tendo autorizado zerar.
### Segurança
Token de sessão não fica em claro no banco (hash). CHECK constraints impedem estados inválidos mesmo com bug de aplicação. Nenhum segredo no repositório.

## Plano de implementação
- [ ] Etapa 1 — Ler `docs/product/especificacao-fc2.md` §6, ADR-016/019/020/028/029 em `.agents/decisions/` e o schema 1.x. Criar branch `feat/f0-02-schema`.
- [ ] Etapa 2 — Reescrever `prisma/schema.prisma` do zero (`generator`/`datasource` iguais ao 1.x: `provider = "prisma-client"`, `output = "../src/generated/prisma"`). Organizar por seções com comentários curtos (Auth, Contas, Ledger, Cartões, Séries/Renda, Dívidas, Orçamento, Regras/Importação, IA/Telegram).
- [ ] Etapa 3 — `npx prisma validate && npx prisma format && npx prisma generate`.
- [ ] Etapa 4 — Teste de contrato `prisma/schema.contract.test.ts` (CA-04). Rodar `npm test`.
- [ ] Etapa 5 — Apagar `prisma/migrations/*` (`git rm -r prisma/migrations`). Gerar a migration **sem aplicar**: `npx prisma migrate dev --create-only --name init_fc2` contra um banco descartável (Neon branch `dev-schema` ou Postgres local); editar o `migration.sql` anexando o bloco SQL manual; conferir que o `migration_lock.toml` está presente.
- [ ] Etapa 6 — Ajustar `src/server/auth/session.ts` (hash do token, `lastSeenAt`) e `src/server/auth/schemas.ts` se algo referenciar campos removidos; rodar `npx next build`.
- [ ] Etapa 7 — **Portão de confirmação (veto do `dados-prisma`)**:
  1. Mostrar ao humano, em texto: host do `DATABASE_URL` (sem usuário/senha), nome do database, e a lista de tabelas atuais com contagem de linhas (`mcp Neon get_database_tables` / `run_sql`).
  2. Perguntar literalmente: "Confirma apagar TODOS os dados deste banco (host X, database Y) e recriar o schema 2.0?" e **aguardar resposta afirmativa no chat**. O consentimento anterior do dono (registrado na especificação) não substitui esta pergunta.
  3. Recusar se o host/database não for o esperado ou se a resposta for ambígua.
  4. Criar branch/snapshot de segurança no Neon e registrar o id.
- [ ] Etapa 8 — Após confirmação: `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="TEXTO-LITERAL-DA-CONFIRMACAO-DO-HUMANO" npx prisma migrate reset --force --skip-seed`. (O Prisma bloqueia `migrate reset` chamado por agente de IA sem esse consentimento; a variável só pode conter a resposta real do humano.) Se o reset pelo CLI não for possível, aplicar `npx prisma migrate deploy` após `DROP SCHEMA public CASCADE; CREATE SCHEMA public;` executado via `run_sql` — também apenas após a confirmação.
- [ ] Etapa 9 — `npx prisma migrate status`; listar tabelas (CA-05); registrar tudo no "Registro de execução".
- [ ] Etapa 10 — Remover referências a seed (CA-07), atualizar `docs/data/` (dicionário de dados: resumo de cada modelo), `.agents/context/CONTEXT.md`, `PLANS.md`; commit `feat(f0-02): schema prisma 2.0 e migration inicial`.

## Estratégia de testes
- [ ] Unitários: `schema.contract.test.ts` com os casos da CA-04 mais: `Transaction` tem os 3 uniques; todo modelo com `userId` tem índice iniciando por `userId` ou é filho com FK escopada (lista de exceções explícita no teste); enums obrigatórios existem com os valores exatos (ex.: `TxnStatus` = PLANNED, PENDING, CLEARED, RECONCILED).
- [ ] Integração (manual, banco descartável): inserir via SQL duas pernas de transferência com mesmo `transfer_id` e mesma `account_id` → viola unique; inserir `amount = 0` → viola CHECK; inserir `kind = 'TRANSFER'` sem `transfer_id` → viola CHECK; inserir duas transações com mesmo `(user_id, import_hash)` → viola unique; duas com `import_hash` nulo → permitido.
- [ ] E2E: não aplicável.
- [ ] Manual: `npx prisma studio` abre sem erro e mostra todas as tabelas vazias.

## Riscos e rollback
- **Perda irreversível de dados**: mitigada pelo portão de confirmação e pelo snapshot/branch Neon. Rollback do reset: restaurar o snapshot (`restore_snapshot`) ou promover o branch de segurança.
- **Banco compartilhado entre dev e produção** (um único Neon): o reset afeta a produção da Vercel; avisar o humano no portão.
- **Decimal no Prisma** devolve `Decimal.js`; esquecer `.toNumber()` na borda vaza o tipo para o domínio. Mitigação: o teste de contrato exige que só existam 3 colunas `Decimal` (`monthly_rate`, `late_fee_pct`, `late_interest_monthly_pct`).
- **Schema grande demais para uma task**: se estourar, dividir em dois commits (núcleo: Auth/Account/Ledger/Cartões; resto) mantendo uma única migration.
- Rollback de código: `git revert` do commit; o schema 1.x continua acessível em `fc-1.x-final`.

## Registro de execução
### Alterações realizadas
### Arquivos principais
### Decisões
### Divergências
### Pendências

## Validação
Comandos e resultados.

## Handoff
Link para o handoff ativo, quando aplicável.

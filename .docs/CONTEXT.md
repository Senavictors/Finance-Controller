# Finance Controller — Current Context

> This file is the living state of the project. Read it before starting any task. Update it after completing any task.

## Current Phase

**Phase 31: Progressive Disclosure And List Scaling** — Concluido. Novo componente `CategoryListCard` em `src/app/(app)/categories/category-list-card.tsx` exibe os 5 primeiros pais com seus filhos em cada card de categorias e abre a lista completa em `Dialog` via botao `Ver todas (N)`, preservando edicao/exclusao ao reusar o `CategoryList`. `RecurringList` passou a controlar visibilidade com state local (`INITIAL_VISIBLE=10`, `PAGE_SIZE=10`) e expoe `Carregar mais (N restantes)` no rodape. O detalhe de fatura foi refatorado para usar o client component `StatementTransactionsList`, que recebe as movimentacoes do server e aplica o mesmo padrao `carregar mais` incremental. A pagina de transacoes ja tem paginacao server-side por `page/limit` e ficou inalterada, em linha com a decisao da task de atacar apenas onde o problema existia.

## Next Planned Step

**Phase 32: Settings, Profile And Confirmation UX** — evoluir tela de settings/perfil e substituir `confirm()` nativo por componente proprio de confirmacao conforme `.docs/tasks/phase-32-settings-profile-and-confirmation-ux.md`.

**Validacao manual e curadoria visual** — continua recomendada como trilha paralela para revisar em light/dark/mobile as superficies que consomem `BrandIcon`/`BrandDot` (contas, categorias, transacoes, recorrencias, metas, cartoes/faturas, dashboard), especialmente agora que o polish do dashboard tambem precisa ser verificado visualmente (auto-placement, placeholder tematizado e scroll interno).

## What Exists

- Next.js 16 App Router + TypeScript + Inter font
- Tailwind CSS v4 com tema Apex Holdings
- shadcn/ui (Base UI)
- Prisma 7 + PostgreSQL
- **Auth**: bcrypt, sessions, cookies, rate limiting
- **Financeiro**: Account, Category, Transaction, Transfer
- **Dashboard customizavel**: react-grid-layout, 10 tipos de widget registrados, 5 widgets default e layout persistido
- **Recorrencias**: RecurringRule + RecurringLog + apply idempotente
- **Analytics core compartilhado**: `resolveMonthPeriod` + `getMonthlyAnalyticsSummary` reutilizados por dashboard, analytics API e transactions page
- **Test foundation**: Vitest configurado com suites para analytics core, invalidation, statement cycle, goals, forecast, score e insights
- **Credit card billing**: configuracao de limite/fechamento/vencimento, faturas, pagina de leitura e pagamento de fatura
- **Snapshot and invalidation base**: tags por usuario/modulo/mes e invalidação central de analytics em mutacoes financeiras
- **Demo hardening**: seed/reset demo agora montam um cartao com fatura paga e outra em aberto, e a UI de faturas/transacoes ficou mais demonstravel
- **Goal Engine**: modulo de metas com SAVING, EXPENSE_LIMIT, INCOME_TARGET e ACCOUNT_LIMIT; calculo de progresso com projecao; snapshots; pagina `/goals`; widget `goal-progress` no dashboard; 3 metas demo no seed
- **Forecast Engine**: previsao mensal com saldo previsto, nivel de risco (LOW/MEDIUM/HIGH), projecao de recorrencias futuras, media movel de despesa variavel e snapshot persistido; widget `forecast` no dashboard; APIs `GET /api/analytics/forecast` e `POST /api/analytics/forecast/recalculate`
- **Financial Score**: pontuacao 0-100 com 5 fatores explicaveis e redistribuicao por ausencia de dados; status CRITICAL/ATTENTION/GOOD/EXCELLENT; snapshot persistido com delta vs mes anterior; widget `score` no dashboard; APIs `GET /api/analytics/score` e `GET /api/analytics/score/history`
- **Automatic Insights**: motor deterministico com 6 heuristicas (variacao por categoria, concentracao, metas em risco, forecast negativo, fatura vencendo/vencida, utilizacao alta de cartao), dedupe por fingerprint, cap de 8 por periodo, dismiss persistente; widget `insights` no dashboard; APIs `GET /api/analytics/insights`, `POST /recalculate`, `PATCH /[id]/dismiss`
- **Documentation foundation**: nova estrutura de documentacao em `.docs/domain/`, `.docs/api/`, `.docs/data/` e `.docs/architecture/`, com templates obrigatorios por camada e base pronta para expansao faseada
- **Documentation backlog**: roadmap formalizado com specs `06` a `18` e tasks `14` a `26` para dominio, logica, API, dados e arquitetura
- **Domain Docs: goals**: documento `.docs/domain/goals.md` criado com conceitos, regras, estados, formulas de negocio, edge cases e limitacoes atuais do modulo de metas
- **Domain Docs: forecast**: documento `.docs/domain/forecast.md` criado com conceitos de previsao mensal, snapshot, `referenceDate`, `riskLevel`, premissas e limites conhecidos do motor de forecast
- **Logic Docs: forecast calculation**: `.docs/domain/forecast.md` enriquecido com entradas do calculo, sequencia de composicao, media movel de 2 meses, comportamento de `assumptions`, classificacao de risco e trade-offs do algoritmo atual
- **Domain Docs: financial score**: documento `.docs/domain/financial-score.md` criado com conceito de score 0-100, fatores explicaveis, status qualitativos, comparativo historico e limites conhecidos do modulo
- **Logic Docs: financial score calculation**: `.docs/domain/financial-score.md` enriquecido com pesos-base, neutralidade, comportamento weightless, regras detalhadas por fator, geracao de insights, delta historico e trade-offs do algoritmo atual
- **Domain Docs: insights**: documento `.docs/domain/insights.md` criado com conceito de insight automatico, severidade, CTA, `fingerprint`, dedupe, `dismiss` e persistencia por periodo
- **Logic Docs: insights engine**: `.docs/domain/insights.md` enriquecido com metric pipeline, ordem de execucao das regras, thresholds/prioridades do MVP, dedupe por fingerprint, ciclo de dismiss e persistencia do feed
- **API Docs: transactions**: documento `.docs/api/transactions.md` criado com contratos de `GET/POST /api/transactions`, `PATCH/DELETE /api/transactions/[id]` e `POST /api/transactions/transfer`, incluindo filtros, payloads, erros e side effects
- **API Docs: analytics**: documento `.docs/api/analytics.md` criado com contratos de summary, forecast, score e insights, incluindo `month`, cache, recalculate, history e dismiss
- **API Docs: goals**: documento `.docs/api/goals.md` criado com contratos de `GET/POST /api/goals` e `GET/PATCH/DELETE /api/goals/[id]`, incluindo progresso on-demand, soft delete, validacoes e regras de ownership atuais
- **Data Docs: data dictionary**: documento `.docs/data/data-dictionary.md` criado com todos os models e enums atuais do Prisma, ownership multi-tenant, relacionamentos, snapshots e limites de integridade do schema
- **Architecture Docs: flows**: documento `.docs/architecture/flows.md` criado com traversal real entre UI, API, application, Prisma, billing e invalidation nos fluxos criticos do sistema
- **Architecture Docs: sequence**: documento `.docs/architecture/sequence.md` criado com diagramas Mermaid e sequencias operacionais para transacoes, recorrencias, recalculate analitico e pagamento de fatura
- **Design bundle de marcas**: `design_system/finance-controller-design-system/` inclui prototipo com registry `BRANDS`, helper `matchBrand()` e componente `BrandIcon` como referencia para substituir dots/color-only por logos SVG em contas, categorias, transacoes e recorrencias
- **Brand registry em producao**: `src/lib/brands/` portou o registry para TypeScript com `BRANDS`, `getBrand`, `listBrands`, `matchBrand` e `resolveBrand`; `BrandIcon`, `BrandDot` e `BrandPicker` padronizam o visual em contas, categorias, transacoes, recorrencias, metas, faturas de cartao e widgets do dashboard; seed/reset-demo ja populam `icon` para Nubank e Itau; testes unitarios do registry cobrem matching, fallback e normalizacao de acento
- **Extracted logo inventory**: `system-images/logos/` concentra 33 logos reais extraidas para o proximo ciclo de substituicao visual (24 `jpeg`, 9 `png`, 0 `svg`), cobrindo 33/35 marcas do registry atual; faltam `Neon` e `Pix`, e alguns arquivos exigem normalizacao de naming (`bradeco`, `google`, `microsoft`, `hbo`, etc.)
- **Brand assets em producao (Phase 28)**: 33 assets promovidos para `public/brands/<brandKey>.<ext>` com naming estavel; a registry passou a expor `BrandAsset` (`src`, `kind`, `fit`, `padding`, `border?`) e `svg` virou opcional; `BrandIcon`/`BrandDot` renderizam `<img>` para `png`/`jpeg` e `<svg>` inline apenas como fallback (Neon, Pix); suite de testes cobre existencia do arquivo no disco, kind suportado e fallback explicito
- **Dashboard polish (Phase 29)**: helper `findPlacement` em `src/app/(app)/dashboard/lib/auto-placement.ts` guia o `addWidget` para o primeiro slot livre sem sobreposicao (coberto por `auto-placement.test.ts`); `.react-grid-item.react-grid-placeholder` em `globals.css` usa `var(--primary)` com baixa opacidade e mesmo `border-radius` dos cards; `RecentTransactionsWidget` virou flex column com scroll interno (`min-h-0 overflow-y-auto`) para conter listas longas dentro do card
- **Form hardening (Phase 30)**: `src/lib/money.ts` expoe `parseMoneyToCents`/`formatCentsToInput` com 9 testes; `src/components/ui/money-input.tsx` entrega `MoneyInput` e `IntegerInput` bloqueando `e/+/-`, wheel e spinners; transacoes, recorrencias, metas, pagamento de fatura e contas usam o padrao compartilhado; filtros de `/transactions` ganharam container com contraste (`bg-card` + borda + shadow); recorrencias pausadas usam fundo ambar, descricao riscada e badge com icone `Pause` para leitura rapida do estado
- **Progressive disclosure (Phase 31)**: `CategoryListCard` mostra 5 pais com filhos e abre `Dialog` com a lista completa preservando edicao; `RecurringList` passou a renderizar 10 + `Carregar mais`; `StatementTransactionsList` aplica o mesmo padrao no detalhe de fatura; `/transactions` continua usando a paginacao server-side existente
- **UX backlog formalizado**: feedback externo de uso foi convertido nas tasks `phase-29` a `phase-32`, cobrindo polish do dashboard, hardening de formularios/status, divulgacao progressiva de listas densas e fundacao de settings/perfil com confirmacoes customizadas
- **Documentation process hardening**: `README.md` passou a ser artefato obrigatorio tanto na criacao quanto na conclusao de tasks, com foco explicito em roadmap, backlog aberto, phases concluidas e proximo passo
- **Documentation sync**: README, CONTEXT, architecture overview e flows alinhados ao codigo atual (`dashboards`, `recurring-rules`, Node >= 20.9, apply manual de recorrencias e registry atual de widgets)
- **README roadmap sync**: roadmap do README agora reflete explicitamente as phases 13 a 28 concluidas, registra o sistema visual de marcas/logos reais e alinha o proximo passo com a curadoria visual dos assets
- **Repo hygiene**: `.gitignore` ajustado para ignorar configs locais de tooling em `.claude/`, logs genericos e artefatos comuns de chave/certificado (`*.key`, `*.crt`, `*.p12`, `*.pfx`)
- **Seed demo**: script com dados ficticios (demo@finance.com / demo1234)
- **Reset demo**: botao em /settings que recria dados
- **Landing page**: hero + features + tech stack + footer
- **CI**: GitHub Actions (lint + format:check + build)
- **README**: overview alinhado ao codigo atual, com setup, stack, arquitetura alvo vs realidade e estrutura de rotas atual
- **Future feature specs**: `.docs/future-features/` com Goal Engine, Forecast Engine, Score Financeiro, Insights Automaticos, Documentation Foundation e o roadmap documental das fases 14 a 26
- **Execution backlog**: tasks formais criadas para as phases 8.5 a 32 em `.docs/tasks/`, incluindo as novas phases 29 a 32 para polish de dashboard, hardening de formularios, listas densas e settings/perfil
- **Technical plan**: task documentada para a fundacao analitica e ciclo de fatura de cartao
- **31 API routes**, 15 models, 13 ADRs

## Database Models

User, Session, Account, Category, Transaction, CreditCardStatement, Dashboard, DashboardWidget, RecurringRule, RecurringLog, Goal, GoalSnapshot, ForecastSnapshot, FinancialScoreSnapshot, InsightSnapshot

## Current Architectural Reality

- A arquitetura alvo em camadas continua sendo a direcao do projeto
- Na implementacao atual, boa parte das regras e agregacoes ainda vive em `src/app/api/**/route.ts` e em server pages com Prisma direto
- As specs em `.docs/future-features/` assumem uma extracao gradual de uma camada analitica/use case antes de expandir metas, forecast, score e insights
- O produto passou a assumir explicitamente suporte futuro a cartao de credito com limite, fechamento, vencimento e faturas
- A fundacao da camada analitica server-side comecou a sair de `route.ts` e foi centralizada em `src/server/modules/finance/application/analytics/`
- A mesma camada agora possui convencoes de snapshot e invalidação para summary, goals, forecast, score, insights e billing de cartao
- O dominio de cartao agora possui ciclo de fatura em `src/server/modules/finance/application/credit-card/` e superfice inicial em `/credit-cards`
- A Phase 8.5 esta refinando demonstrabilidade: demo mais forte, faturas mais legiveis e navegação mais clara entre compra e fatura

## Documentation Layers

- Domain Docs
- API Docs
- Data Docs
- Architecture Deep Dive

## Documentation Roadmap

- Phase 14: Domain Docs - Goals
- Phase 15: Domain Docs - Forecast
- Phase 16: Domain Docs - Financial Score
- Phase 17: Domain Docs - Insights
- Phase 18: Logic Docs - Forecast Calculation
- Phase 19: Logic Docs - Financial Score Calculation
- Phase 20: Logic Docs - Insights Engine
- Phase 21: API Docs - Transactions
- Phase 22: API Docs - Analytics
- Phase 23: API Docs - Goals
- Phase 24: Data Docs - Data Dictionary
- Phase 25: Architecture Docs - Flows
- Phase 26: Architecture Docs - Sequence
- Phase 27: SVG Brand Icons
- Phase 28: Real Brand Logo Assets
- Phase 29: Dashboard Layout And Widget Polish

## Key Decisions

- [ADR-001](decisions/ADR-001-tech-stack.md): Tech stack
- [ADR-002](decisions/ADR-002-amount-in-cents.md): Amounts in cents
- [ADR-003](decisions/ADR-003-auth-approach.md): Custom auth
- [ADR-004](decisions/ADR-004-transfer-strategy.md): Transfers as linked pairs
- [ADR-005](decisions/ADR-005-customizable-dashboard.md): Customizable dashboard
- [ADR-006](decisions/ADR-006-recurring-rules.md): Recurring rules
- [ADR-007](decisions/ADR-007-demo-seed.md): Demo seed data
- [ADR-008](decisions/ADR-008-credit-card-billing-cycle.md): Credit card billing cycle
- [ADR-009](decisions/ADR-009-analytics-snapshot-invalidation.md): Analytics snapshot and invalidation strategy
- [ADR-010](decisions/ADR-010-goal-engine.md): Goal Engine
- [ADR-011](decisions/ADR-011-forecast-engine.md): Forecast Engine
- [ADR-012](decisions/ADR-012-financial-score.md): Financial Score
- [ADR-013](decisions/ADR-013-automatic-insights.md): Automatic Insights

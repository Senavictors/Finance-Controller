# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Conventional Commits](https://www.conventionalcommits.org/).

## [Unreleased]

### Added

- Phase 31: componente `CategoryListCard` em `src/app/(app)/categories/category-list-card.tsx` com preview de 5 pais + filhos e `Dialog` `Ver todas (N)` que reusa `CategoryList` para edicao/exclusao
- Phase 31: padrao `Carregar mais (N restantes)` em `RecurringList` (`INITIAL_VISIBLE=10`, `PAGE_SIZE=10`) para reduzir renderizacao inicial de listas densas
- Phase 31: client component `StatementTransactionsList` em `src/app/(app)/credit-cards/[id]/statement-transactions-list.tsx` aplicando o mesmo padrao de divulgacao progressiva no detalhe de fatura
- Phase 30: helper `parseMoneyToCents` / `formatCentsToInput` em `src/lib/money.ts` com testes (`src/lib/money.test.ts`) cobrindo virgula, ponto, sub-centavo, clamp negativo e valores nulos
- Phase 30: componentes reutilizaveis `MoneyInput` e `IntegerInput` em `src/components/ui/money-input.tsx` bloqueando `e/+/-`, desarmando wheel e escondendo spinners nativos
- Phase 30: padrao de input monetario aplicado em transacoes, recorrencias, metas, pagamento de fatura e contas (incluindo `IntegerInput` para dias de fechamento/vencimento de cartao)
- Phase 30: container com contraste (`bg-card` + borda + shadow) na barra de filtros de `/transactions`
- Phase 30: estado pausado de recorrencias reforcado com fundo ambar, descricao riscada e badge com icone `Pause` no lugar do antigo `opacity-50`

### Changed

- Phase 31: `.docs/CONTEXT.md`, `README.md` e `.docs/tasks/phase-31-progressive-disclosure-and-list-scaling.md` atualizados para refletir a conclusao da phase e apontar a Phase 32 como proximo passo
- Phase 30: `.docs/CONTEXT.md`, `README.md` e `.docs/tasks/phase-30-form-hardening-and-status-feedback.md` atualizados com a conclusao da phase e novo proximo passo apontando para a Phase 31

### Added (earlier)

- Phase 29: helper `findPlacement` em `src/app/(app)/dashboard/lib/auto-placement.ts` com testes (`auto-placement.test.ts`) para posicionamento automatico de widgets sem sobreposicao
- Phase 29: override do placeholder de drag da react-grid-layout em `src/app/globals.css` usando `var(--primary)` com baixa opacidade e `border-radius` alinhado aos widgets
- Phase 29: scroll interno em `RecentTransactionsWidget` via `flex flex-col` + `min-h-0` + `overflow-y-auto` para conter listas longas dentro do card
- Phase 29 task for dashboard layout and widget polish in `.docs/tasks/phase-29-dashboard-layout-and-widget-polish.md`
- Phase 30 task for form hardening and status feedback in `.docs/tasks/phase-30-form-hardening-and-status-feedback.md`
- Phase 31 task for progressive disclosure and list scaling in `.docs/tasks/phase-31-progressive-disclosure-and-list-scaling.md`
- Phase 32 task for settings, profile and confirmation UX in `.docs/tasks/phase-32-settings-profile-and-confirmation-ux.md`
- Phase 27: biblioteca de marcas SVG (`src/lib/brands/`) com `BRANDS`, `getBrand`, `listBrands`, `matchBrand` e `resolveBrand`
- Componentes `BrandIcon`, `BrandDot` e `BrandPicker` para renderizar logos ou fallback colorido com iniciais
- Seletor de marca em `AccountForm` (bancos + bandeiras) e `CategoryForm` (assinaturas + pagamentos)
- Logos sincronizados em transacoes, recorrencias, metas, faturas de cartao e widgets de dashboard com inferencia via `matchBrand(description)`
- Seed e reset-demo atribuindo icones `nubank`/`itau` as contas e cartao para ilustrar o novo visual
- Testes unitarios do registry de marcas cobrindo `matchBrand`, `resolveBrand` e fallbacks (`src/lib/brands/registry.test.ts`)
- Phase 27 task for SVG brand logos/icons in `.docs/tasks/phase-27-svg-brand-icons.md`
- Architecture sequence documentation in `.docs/architecture/sequence.md`
- Architecture flows documentation in `.docs/architecture/flows.md`
- Data dictionary documentation in `.docs/data/data-dictionary.md`
- Goals API documentation in `.docs/api/goals.md`
- Analytics API documentation in `.docs/api/analytics.md`
- Transactions API documentation in `.docs/api/transactions.md`
- Insights domain documentation in `.docs/domain/insights.md`
- Financial score domain documentation in `.docs/domain/financial-score.md`
- Forecast domain documentation in `.docs/domain/forecast.md`
- Goals domain documentation in `.docs/domain/goals.md`
- Documentation foundation phase with `.docs/domain/`, `.docs/api/`, `.docs/data/` and `.docs/architecture/`
- Mandatory documentation templates for domain, API, data and architecture layers
- Phase 13 spec and task for phased documentation evolution
- Documentation roadmap specs `06` to `18` for phased system documentation
- Documentation backlog tasks `phase-14` to `phase-26` covering domain, logic, API, data and architecture docs
- Initial project setup with Next.js 16 (App Router) + TypeScript
- Tailwind CSS v4 with blue/teal custom theme (dark mode support)
- shadcn/ui with base components (button, card, input, label)
- Prisma 7 with PostgreSQL datasource and User model
- ESLint + Prettier configuration
- Project folder structure (route groups, server modules)
- Documentation structure (.docs/ with ADRs, tasks, vision, architecture)
- Pre-commit hook for git identity enforcement
- Custom server-side authentication (bcrypt + database sessions)
- Auth API routes: register, login, logout, me
- Zod validation schemas for auth inputs
- In-memory rate limiting on login endpoint
- Next.js middleware for route protection (auth redirects)
- Login and register pages with form validation
- Dashboard placeholder page (authenticated)
- Session model in Prisma schema
- ADR-003: Auth approach decision
- Financial models: Account (6 types), Category (hierarchical), Transaction
- Account CRUD API with create/read/update/delete
- Category CRUD API with hierarchy validation and transaction protection
- Transaction CRUD API with filters, pagination, and search
- Transfer endpoint creating atomic linked transaction pairs
- Zod validation schemas for all financial entities
- App layout with sidebar navigation and period selector (month)
- Accounts page with card grid and create/edit dialog
- Categories page with hierarchical list and INCOME/EXPENSE sections
- Transactions page with table, filters, pagination, and create/transfer dialog
- Dashboard with summary cards (accounts, categories, transactions count)
- Currency formatting utilities (formatCurrency, parseCents)
- ADR-004: Transfer strategy (linked transaction pairs)
- Analytics API endpoint (/api/analytics/summary) with income/expense aggregation
- Dashboard completo: hero card com saldo, stat cards com variacao, graficos Recharts
- Grafico de barras receitas x despesas (Recharts BarChart)
- Grafico donut de gastos por categoria (Recharts PieChart)
- Saldo por conta e ultimas transacoes no dashboard
- Landing page com hero, branding e CTAs

### Changed

- README documentation flow now treats `README.md` as mandatory on both task creation and task conclusion
- README roadmap updated to show the open phases 29 to 32 and recommend starting with Phase 29
- AGENTS, CLAUDE, docs foundation references and task template updated so `README.md` is no longer optional in the documentation ritual
- README roadmap atualizado para refletir as phases concluidas ate a Phase 26 e separar proximo passo documental do backlog de produto
- README, CONTEXT, architecture overview e architecture flows alinhados ao codigo atual (`dashboards`, `recurring-rules`, Node >= 20.9, apply manual de recorrencias e 10 widgets registrados)
- `.docs/domain/insights.md` enriquecido com o deep dive da logica real do engine: metricas, heuristicas, dedupe, persistencia, dismiss e trade-offs
- `.docs/domain/financial-score.md` enriquecido com o deep dive da logica real de calculo: pesos, fatores, redistribuicao, insights, delta historico e trade-offs
- `.docs/domain/forecast.md` enriquecido com o deep dive da logica real de calculo: entradas, sequencia de composicao, media movel de 2 meses, risco, snapshot/invalidation e trade-offs
- `.gitignore` atualizado para ignorar `.claude/`, logs genericos e artefatos comuns de chave/certificado
- Architecture overview moved from `.docs/architecture.md` to `.docs/architecture/README.md`
- README, AGENTS, CLAUDE and CONTEXT updated to reflect the new documentation structure
- Redesign visual completo inspirado em Apex Holdings dashboard
- Theme atualizado: radius 1rem, sombras suaves, gradientes sutis, background warm gray
- Sidebar refinada: active state primary com sombra, icone/logo, separador
- Topbar: period pill com estilo toggle, avatar placeholder
- Cards com cantos mais arredondados e sombras
- Empty states com icones grandes e mensagens descritivas
- Auth pages com logo e visual mais sofisticado
- Tipografia tracking-tight em toda a interface
- Dashboard customizavel com react-grid-layout (drag-and-drop + resize)
- 6 widgets independentes: saldo, receitas/despesas, categorias donut, contas, transacoes recentes, contagem
- Modo edicao com drag handle, botao remover e dialog adicionar widget
- Modelos Dashboard + DashboardWidget no Prisma para persistencia de layout
- API routes para dashboard: GET/PUT layout, POST/DELETE widgets
- Widget registry extensivel para adicionar novos tipos
- Fonte trocada de Geist para Inter (weights 300-700)
- ADR-005: Dashboard customizavel
- Regras recorrentes: RecurringRule (DAILY/WEEKLY/MONTHLY/YEARLY) + RecurringLog
- CRUD de regras recorrentes com validacao de frequencia
- Endpoint apply idempotente que cria transacoes pendentes automaticamente
- Pagina de recorrencias com lista, form, toggle ativar/pausar, botao aplicar
- Item "Recorrencias" na sidebar com icone RefreshCw
- ADR-006: Recurring rules with manual apply
- Seed script com dados demo realistas (prisma/seed.ts)
- Usuario demo: demo@finance.com / demo1234 (5 contas, 12 categorias, ~80 transacoes)
- Pagina de configuracoes com botao "Resetar dados demo"
- API reset-demo que recria dados ficticios para o usuario atual
- Landing page completa: hero, 6 feature cards, tech stack badges, footer
- GitHub Actions CI (lint + format:check + build)
- README.md com setup, tech stack, roadmap, estrutura de pastas
- ADR-007: Demo seed data
- Phase 8: Fundacao da camada analitica server-side em `src/server/modules/finance/application/analytics/`
- `resolveMonthPeriod`, `getMonthlyAnalyticsSummary` e `isValidMonthParam` reutilizados por dashboard, analytics API e pagina de transacoes
- Vitest configurado com primeiros testes do analytics core
- Ciclo de fatura de cartao de credito: `CreditCardStatement` + sync em mutacoes de transacao
- Pagina `/credit-cards` com leitura de fatura e pagamento parcial/total
- ADR-008: Credit card billing cycle
- Estrategia de snapshot/invalidation com tags por usuario/modulo/mes e entidades
- `invalidateAnalyticsSnapshots` centralizado, usado por todas as mutacoes financeiras
- Snapshot cacheavel do monthly summary via `unstable_cache`
- ADR-009: Analytics snapshot and invalidation strategy
- Phase 8.5: Demo hardening — seed/reset demo montam cartao com fatura paga e outra em aberto
- Phase 9: Goal Engine — modulo de metas com `Goal` + `GoalSnapshot`
- 4 metricas: SAVING, EXPENSE_LIMIT, INCOME_TARGET, ACCOUNT_LIMIT
- 3 escopos: GLOBAL, CATEGORY, ACCOUNT (subcategorias incluidas por padrao)
- Calculo de progresso com projecao, status e alertas
- `ACCOUNT_LIMIT` em cartao usa fatura em aberto, nao mes calendario
- API `GET/POST /api/goals`, `PATCH/DELETE /api/goals/[id]`
- Pagina `/goals` com cards de progresso agrupados por status e formulario de criacao
- Widget `goal-progress` no dashboard
- 3 metas demo no seed e no reset-demo
- ADR-010: Goal Engine
- Phase 10: Forecast Engine — `ForecastSnapshot` + enum `ForecastRiskLevel`
- `calculateForecast` combina realizado + recorrencias futuras + projecao variavel (media de 2 meses) + faturas em aberto
- Classificacao de risco LOW/MEDIUM/HIGH e trilha audit em `assumptions`
- API `GET /api/analytics/forecast` e `POST /api/analytics/forecast/recalculate`
- Widget `forecast` no dashboard com saldo previsto, badge de risco e premissas principais
- ADR-011: Forecast Engine
- Phase 11: Financial Score — `FinancialScoreSnapshot` + enum `FinancialScoreStatus`
- `calculateFinancialScore` combina 5 fatores explicaveis (economia, estabilidade, renda, cartao, metas) com redistribuicao por ausencia de dados
- Status CRITICAL/ATTENTION/GOOD/EXCELLENT, delta vs mes anterior e insights acionaveis
- API `GET /api/analytics/score` e `GET /api/analytics/score/history`
- Widget `score` no dashboard com pontuacao, delta, breakdown de fatores e insights
- Testes unitarios cobrindo faixas de status e cada fator isolado
- ADR-012: Financial Score
- Phase 12: Automatic Insights — `InsightSnapshot` + enum `InsightSeverity`
- Motor deterministico com `buildInsightMetrics` + `runInsightRules` + `dedupeInsights`
- 6 heuristicas MVP: category_spike, category_concentration, goal_at_risk, forecast_negative, statement_due_soon/overdue e credit_utilization_high
- Dedupe por fingerprint e cap de 8 insights por periodo
- Persistencia que preserva `isDismissed` entre recalculos e remove insights obsoletos
- API `GET /api/analytics/insights`, `POST /api/analytics/insights/recalculate` e `PATCH /api/analytics/insights/[id]/dismiss`
- Widget `insights` no dashboard com badges por severidade, CTA contextual e botao dismiss
- Testes unitarios cobrindo cada regra + dedupe por fingerprint
- ADR-013: Automatic Insights

# Índice de Decisões (ADRs) — Finance Controller 2.0

Mantido automaticamente por `bootstrap-audit` a cada execução — não edite esta tabela manualmente, edite os ADRs individuais. ADRs 001–015 são do FC 1.x (migrados de `.docs/decisions/` em 2026-10-05, com status revisado); ADRs 016+ são do FC 2.0.

| ID | Título | Status | Data | Arquivo |
|---|---|---|---|---|
| ADR-001 | Tech Stack Selection | accepted | 2026-04-14 | [ADR-001-tech-stack.md](ADR-001-tech-stack.md) |
| ADR-002 | Store Monetary Amounts as Integers (Cents) | accepted | 2026-04-14 | [ADR-002-amount-in-cents.md](ADR-002-amount-in-cents.md) |
| ADR-003 | Custom Server-Side Session Authentication | accepted | 2026-04-14 | [ADR-003-auth-approach.md](ADR-003-auth-approach.md) |
| ADR-004 | Transferencias como Par de Transacoes Vinculadas | accepted | 2026-04-14 | [ADR-004-transfer-strategy.md](ADR-004-transfer-strategy.md) |
| ADR-005 | Dashboard Customizavel com react-grid-layout | superseded | 2026-04-15 | [ADR-005-customizable-dashboard.md](ADR-005-customizable-dashboard.md) |
| ADR-006 | Regras Recorrentes com Aplicacao Manual | superseded | 2026-04-15 | [ADR-006-recurring-rules.md](ADR-006-recurring-rules.md) |
| ADR-007 | Seed de Dados Demo | superseded | 2026-04-15 | [ADR-007-demo-seed.md](ADR-007-demo-seed.md) |
| ADR-008 | Cartao de Credito com Ciclo de Fatura, Fechamento e Vencimento | accepted | 2026-04-16 | [ADR-008-credit-card-billing-cycle.md](ADR-008-credit-card-billing-cycle.md) |
| ADR-009 | Estrategia Inicial de Snapshot e Invalidacao de Analytics | deprecated | 2026-04-16 | [ADR-009-analytics-snapshot-invalidation.md](ADR-009-analytics-snapshot-invalidation.md) |
| ADR-010 | Goal Engine — Modulo de Metas Financeiras | superseded | 2026-04-17 | [ADR-010-goal-engine.md](ADR-010-goal-engine.md) |
| ADR-011 | Forecast Engine — Previsao Mensal Auditavel | superseded | 2026-04-17 | [ADR-011-forecast-engine.md](ADR-011-forecast-engine.md) |
| ADR-012 | Score Financeiro Pessoal — Pontuacao Explicavel | deprecated | 2026-04-17 | [ADR-012-financial-score.md](ADR-012-financial-score.md) |
| ADR-013 | Insights Automaticos — Motor Deterministico de Regras | deprecated | 2026-04-17 | [ADR-013-automatic-insights.md](ADR-013-automatic-insights.md) |
| ADR-014 | Wishlist Dedicada Com Conversao Atomica Em Compra | superseded | 2026-04-21 | [ADR-014-wishlist-purchase-conversion.md](ADR-014-wishlist-purchase-conversion.md) |
| ADR-015 | Credit Card Purchases Modeled As An Aggregate Over Ledger Transactions | accepted | 2026-04-22 | [ADR-015-credit-card-installment-purchases.md](ADR-015-credit-card-installment-purchases.md) |
| ADR-016 | Reescrita do FC 2.0 no mesmo repositório com banco zerado e uso single-user | accepted | 2026-10-05 | [ADR-016-reescrita-fc2-in-place-banco-zerado-single-user.md](ADR-016-reescrita-fc2-in-place-banco-zerado-single-user.md) |
| ADR-017 | Arquitetura de informação mobile-first com 4 abas e captura global | accepted | 2026-10-05 | [ADR-017-arquitetura-informacao-4-abas-captura-global.md](ADR-017-arquitetura-informacao-4-abas-captura-global.md) |
| ADR-018 | Design system Dark Glass com tokens únicos | accepted | 2026-10-05 | [ADR-018-design-system-dark-glass-tokens.md](ADR-018-design-system-dark-glass-tokens.md) |
| ADR-019 | Ledger como fonte de verdade do saldo, cache AccountBalance e reconciliação | accepted | 2026-10-05 | [ADR-019-ledger-fonte-verdade-saldo-reconciliacao.md](ADR-019-ledger-fonte-verdade-saldo-reconciliacao.md) |
| ADR-020 | Recorrências como série RRULE com lançamentos PLANNED e matching | accepted | 2026-10-05 | [ADR-020-recorrencias-rrule-planned-matching.md](ADR-020-recorrencias-rrule-planned-matching.md) |
| ADR-021 | Engine Disponível — ciclo de renda, caixa × flex e modo Aperto | accepted | 2026-10-05 | [ADR-021-engine-disponivel-ciclo-renda-aperto.md](ADR-021-engine-disponivel-ciclo-renda-aperto.md) |
| ADR-022 | Orçamento Flex em 3 baldes | accepted | 2026-10-05 | [ADR-022-orcamento-flex-tres-baldes.md](ADR-022-orcamento-flex-tres-baldes.md) |
| ADR-023 | Importação de extratos (PDF/OFX/CSV) com ImportBatch, importHash e Inbox | accepted | 2026-10-05 | [ADR-023-importacao-extratos-importbatch-inbox.md](ADR-023-importacao-extratos-importbatch-inbox.md) |
| ADR-024 | Parser quick-add e categorização em camadas com override do usuário | accepted | 2026-10-05 | [ADR-024-parser-quick-add-categorizacao-camadas.md](ADR-024-parser-quick-add-categorizacao-camadas.md) |
| ADR-025 | Camada única de tools sobre use-cases (UI, bot, MCP, agentes) | accepted | 2026-10-05 | [ADR-025-camada-unica-tools-sobre-use-cases.md](ADR-025-camada-unica-tools-sobre-use-cases.md) |
| ADR-026 | OpenAI com orçamento fixo, redaction e registro de custo | accepted | 2026-10-05 | [ADR-026-openai-orcamento-redaction-custo.md](ADR-026-openai-orcamento-redaction-custo.md) |
| ADR-027 | Bot Telegram single-user por webhook | accepted | 2026-10-05 | [ADR-027-bot-telegram-webhook-single-user.md](ADR-027-bot-telegram-webhook-single-user.md) |
| ADR-028 | Dívidas e juros como módulo de primeira classe | accepted | 2026-10-05 | [ADR-028-dividas-juros-modulo-primeira-classe.md](ADR-028-dividas-juros-modulo-primeira-classe.md) |
| ADR-029 | Renda MEI com regra base + dia presencial, DAS e teto anual | accepted | 2026-10-05 | [ADR-029-renda-mei-regra-base-dia-presencial-das-teto.md](ADR-029-renda-mei-regra-base-dia-presencial-das-teto.md) |
| ADR-030 | Jobs agendados via Vercel Cron idempotentes | accepted | 2026-10-05 | [ADR-030-jobs-vercel-cron-idempotentes.md](ADR-030-jobs-vercel-cron-idempotentes.md) |
| ADR-031 | Orquestração do desenvolvimento — Opus orquestrador e subagentes Sonnet em ondas | accepted | 2026-10-05 | [ADR-031-orquestracao-opus-sonnet-ondas.md](ADR-031-orquestracao-opus-sonnet-ondas.md) |
<!-- bootstrap-audit preenche uma linha por arquivo em .agents/decisions/*.md, lendo o frontmatter (id, title, status, date). Não remova este comentário — é o marcador de onde a regeneração insere as linhas. -->

## Status possíveis

- `proposed` — decisão registrada, ainda não confirmada em execução.
- `accepted` — decisão vigente, deve ser respeitada por qualquer papel/ferramenta.
- `superseded` — substituída por uma decisão mais recente (referenciar o ID novo).
- `deprecated` — não vale mais, mantida só para histórico.

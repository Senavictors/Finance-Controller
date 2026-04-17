# Task: Phase 8 - Foundation for Analytics and Credit Card Billing

## Status

- [x] Todo
- [ ] In Progress
- [ ] Done

## Context

As proximas features de alto impacto do produto dependem de uma base mais forte do que a implementacao atual oferece. Hoje o projeto ja possui dashboard, analytics mensal, recorrencias e seletor de periodo, mas boa parte das regras ainda esta distribuida entre `route.ts` e server pages com Prisma direto.

O usuario tambem confirmou uma nova direcao de produto: contas `CREDIT_CARD` devem suportar ciclo de fatura, fechamento e vencimento. Isso afeta nao apenas a area de contas, mas tambem o significado de saldo, limite, previsao, score, metas e insights.

## Objective

Preparar o sistema para implementar Goal Engine, Forecast Engine, Score Financeiro e Insights Automaticos com uma fundacao consistente, testavel e alinhada ao dominio financeiro real.

## Scope

- Extrair uma camada analitica server-side reutilizavel
- Criar infraestrutura minima de testes para calculos financeiros
- Modelar cartao de credito com limite, fechamento, vencimento e faturas
- Definir contratos de invalidacao e snapshot para analytics futuros
- Ajustar documentacao e dados demo para refletir a nova base

## Out of Scope

- Implementar Goal Engine
- Implementar Forecast Engine final
- Implementar Score Financeiro final
- Implementar feed completo de Insights
- Open Finance ou sincronizacao bancaria
- Notificacoes push, e-mail ou cron automatico

## Decisions

- [ADR-008](../decisions/ADR-008-credit-card-billing-cycle.md): cartao de credito continua sendo um `Account`, mas passa a ter configuracao de ciclo e entidade de fatura
- As proximas features analiticas devem nascer sobre uma camada compartilhada em `src/server/modules/finance/application/`
- `TRANSFER` continua fora das agregacoes analiticas de gasto/receita, mas pode ser usado para pagamento de fatura
- Snapshot/cache para analytics futuros deve usar persistencia em banco no inicio, nao Redis

## Contracts

### Internal contracts

- `resolvePeriodRange(input)`:
  - Entrada: mes de referencia ou datas explicitas
  - Saida: `from`, `to`, `prevFrom`, `prevTo`, `label`

- `calculatePeriodSummary(userId, range)`:
  - Saida: receitas, despesas, saldo, contagem, categorias, contas

- `assignCreditCardStatement(accountId, transactionDate)`:
  - Saida: fatura correspondente ao lancamento

- `buildCreditCardStatementSnapshot(statementId)`:
  - Saida: total de compras, total pago, saldo em aberto, status

- `invalidateAnalyticsSnapshots(context)`:
  - Entrada: evento de mutacao relevante
  - Saida: marcacao de snapshots stale

### Planned HTTP contracts

- `GET /api/analytics/summary`
  - Mantido, mas passando a consumir camada analitica compartilhada

- `GET /api/credit-cards/statements`
  - Lista faturas por conta e status

- `GET /api/credit-cards/statements/[id]`
  - Detalhe de fatura com compras, pagamentos, fechamento e vencimento

- `POST /api/credit-cards/statements/[id]/payments`
  - Registra pagamento da fatura a partir de uma conta de origem

## Migrations

### Phase 8.1 - Analytics core

- Sem mudanca obrigatoria de schema

### Phase 8.2 - Test foundation

- Sem mudanca de schema

### Phase 8.3 - Credit card billing

- Adicionar campos opcionais em `Account`:
  - `creditLimit`
  - `statementClosingDay`
  - `statementDueDay`

- Criar `CreditCardStatement`
- Adicionar `creditCardStatementId` opcional em `Transaction`

### Phase 8.4 - Snapshot strategy

- Sem snapshot tables finais nesta fase
- Apenas convencao e hooks de invalidacao para as proximas fases

## UI

### Accounts

- Formulario de conta passa a exibir campos extras quando `type === CREDIT_CARD`
- Validacoes especificas para limite, fechamento e vencimento

### Transactions

- Transacoes em conta `CREDIT_CARD` devem mostrar a qual fatura pertencem
- Transferencia para conta `CREDIT_CARD` deve poder ser tratada como pagamento de fatura

### New billing surface

- Tela ou secao inicial de faturas:
  - fatura aberta
  - proxima fatura
  - valor pago
  - saldo em aberto
  - vencimento

## Tests

### Infra de testes recomendada

- Adotar `Vitest` para unit e integration tests de dominio/use cases

### Casos minimos

- Resolucao de periodo mensal
- Agregacao financeira ignorando `TRANSFER`
- Categoria pai incluindo subcategorias
- Recorrencia projetada no periodo correto
- Determinacao de fatura correta para compra no cartao
- Vencimento calculado pela proxima ocorrencia valida apos o fechamento
- Pagamento parcial e total de fatura

## Recommended execution plan

### Phase 8.1 - Shared analytics core

- Criar `src/server/modules/finance/application/analytics/`
- Extrair calculos hoje duplicados em:
  - `src/app/api/analytics/summary/route.ts`
  - `src/app/(app)/dashboard/page.tsx`
  - `src/app/(app)/transactions/page.tsx`
- Introduzir helpers de periodo e agregacoes por conta/categoria

### Phase 8.2 - Test foundation

- Instalar e configurar runner de testes
- Cobrir regras financeiras essenciais antes de aumentar a complexidade

### Phase 8.3 - Credit card billing domain

- Implementar campos de configuracao no modelo `Account`
- Criar geracao e leitura de `CreditCardStatement`
- Associar compras do cartao a faturas
- Registrar pagamento de fatura com base em transferencia

### Phase 8.4 - Snapshot and invalidation base

- Definir convencao de snapshot analitico por modulo
- Marcar pontos de invalidacao em mutacoes de:
  - transacao
  - transferencia
  - recorrencia
  - conta
  - categoria
  - pagamento de fatura

### Phase 8.5 - Demo and portfolio hardening

- Atualizar seed/reset demo com conta de cartao configurada
- Exibir pelo menos uma fatura aberta e uma paga
- Atualizar README apenas depois da implementacao real

## Dependency order for future features

1. Phase 8 - Shared analytics core + billing foundation
2. Goal Engine
3. Forecast Engine
4. Financial Score
5. Automatic Insights

## Why this order

- Goal Engine passa a usar periodo consolidado e limites reais de cartao
- Forecast Engine pode projetar vencimentos e pagamentos de fatura
- Score deixa de usar heuristica simplificada de cartao e passa a usar utilizacao real
- Insights ficam mais uteis quando conseguem alertar fechamento, vencimento e risco de estourar limite

## Checklist

- [ ] Camada analitica compartilhada implementada
- [ ] Runner de testes configurado
- [ ] Testes base de calculo implementados
- [ ] Billing cycle de cartao implementado
- [ ] Faturas com fechamento e vencimento implementadas
- [ ] Pagamento de fatura suportado
- [ ] Estrategia de snapshot/invalidation documentada no codigo
- [ ] `.docs/CONTEXT.md` updated
- [ ] ADR created/updated (if applicable)
- [ ] Manual validation done

## Notes for AI (next step)

Quando esta task começar de verdade, priorize primeiro a extracao da camada analitica e os testes. So depois avance para a modelagem de fatura, porque as proximas features vao depender dessa base ser confiavel.

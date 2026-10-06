---
id: FC2-F3-07
title: Metas (Reserva, Prioridade, Desejo, Quitação)
status: backlog
type: feature
phase: F3
wave: 1
owner: api-servidor
depends_on: [FC2-F1-05]
created_at: 2026-10-05
updated_at: 2026-10-05
affected_modules: [goals, debts, ledger]
related_use_cases: []
related_adrs: [ADR-002, ADR-025, ADR-028]
---

# FC2-F3-07 — Metas (Reserva, Prioridade, Desejo, Quitação)

## Contexto
Metas (spec §4.4) têm quatro tipos: Reserva (RESERVE), Prioridade (PRIORITY), Desejo (WISH, a antiga wishlist) e Quitação de dívida (DEBT_PAYOFF, ligada a um `Loan` da F1-05). Elas aparecem na tela Planejar (FC2-F3-05) e alimentam o Disponível apenas pela "reserva" na barra de alocação. Esta task entrega o backend (use-cases e rotas finas); a UI fica na F3-05.

## Problema
O 1.x tem dois conceitos separados e inadequados:
- `Goal` (`prisma/schema.prisma`, `src/server/modules/finance/application/goals/`): metas de orçamento por métrica (`SAVING`, `EXPENSE_LIMIT`, `INCOME_TARGET`, `ACCOUNT_LIMIT`) e escopo (global, categoria, conta), com `GoalSnapshot`; tela em `src/app/(app)/goals/`. Esse modelo é de limite/orçamento, não de objetivo de poupar ou quitar.
- Wishlist (`WishlistItem`, `WishlistCategory`, `src/server/modules/finance/application/wishlist/use-cases.ts`, `src/app/api/wishlist/**`, `src/app/(app)/wishlist/`): lista de desejos com prioridade, status (DESIRED, MONITORING, READY_TO_BUY, PURCHASED, CANCELED), preço desejado e `purchaseWishlistItem` que cria a compra (inclusive no cartão com `source: 'WISHLIST'`).
Dois módulos, duas telas e nenhuma ligação com dívidas.

## Objetivo
Unificar em um módulo `goals` com tipos RESERVE, PRIORITY, WISH e DEBT_PAYOFF, progresso calculado a partir do ledger/dívida, aportes e conversão de um desejo em compra, reaproveitando o que for bom da wishlist (status e `purchaseWishlistItem`) e descartando o resto do `Goal` do 1.x.

## Fora de escopo
- UI (FC2-F3-05).
- Orçamento por categoria (é o Flex, FC2-F3-03).
- Upload de imagem (`src/app/api/wishlist/upload/route.ts`) e categorias de wishlist; só `imageUrl` opcional como texto.
- Projeções de quitação com amortização extra (usa o que a F1-05 expõe).

## Comportamento atual
Ver Problema. Reaproveitar como referência: `purchaseWishlistItem` (cria transação ou compra no cartão e liga ao item) e as regras de status do item; descartar `calculate-progress.ts` (progresso de orçamento) e `GoalSnapshot`.

## Comportamento esperado

### Modelo (FC2-F0-02; conferir)
`Goal`: `id, userId, type (RESERVE | PRIORITY | WISH | DEBT_PAYOFF), name, targetCents, savedCents, targetDate?, priorityOrder?, status (ACTIVE | ACHIEVED | ARCHIVED | PURCHASED), accountId? (onde a reserva fica), loanId? (DEBT_PAYOFF), url?, imageUrl?, notes?, createdAt, updatedAt`.
`GoalContribution`: `id, userId, goalId, amountCents (positivo aporte, negativo retirada), date, transactionId?, note?`.

### Progresso (`src/server/modules/goals/domain/progress.ts`, puro)
```ts
export type GoalProgress = {
  goalId: string
  percent: number              // 0..100, 1 casa
  remainingCents: number
  monthlyNeededCents: number | null   // para atingir até targetDate; null sem data
  etaDate: string | null       // com base no ritmo médio de aportes dos últimos 90 dias
  onTrack: boolean | null      // etaDate <= targetDate
}
```
- RESERVE/PRIORITY/WISH: `saved = Σ contribuições`; `remaining = max(0, target − saved)`.
- DEBT_PAYOFF: `target = principal original` e `saved = principal − saldoDevedor` do `Loan` (F1-05); `etaDate` vem da data de quitação prevista pela engine de dívidas.
- `monthlyNeededCents = ceil(remaining / mesesAteTargetDate)` (mínimo 1 mês).

### Use-cases (`src/server/modules/goals/application/`)
`createGoal`, `updateGoal`, `archiveGoal`, `listGoals` (com progresso), `addContribution` (opcionalmente liga a uma transferência para a conta da reserva), `removeContribution`, `reorderPriorities`, `convertWishToPurchase` (cria o lançamento, inclusive em cartão, via `createFromDraft` da F2-03 com `description = name` e marca o desejo PURCHASED, mantendo o vínculo `transactionId`). Rotas finas: `src/app/api/goals/route.ts`, `[id]/route.ts`, `[id]/contributions/route.ts`, `[id]/purchase/route.ts`, `reorder/route.ts`.

## Regras de negócio
- RN-01: centavos inteiros (ADR-002).
- RN-02: aporte positivo soma; retirada nunca deixa `saved` negativo (erro de domínio `INSUFFICIENT_SAVED`).
- RN-03: ao atingir `saved >= target`, o status vira ACHIEVED (reversível se houver retirada).
- RN-04: `DEBT_PAYOFF` exige `loanId` do usuário; `savedCents` é derivado, não editável manualmente.
- RN-05: `PRIORITY` tem ordem única por usuário (`priorityOrder`); `reorderPriorities` reescreve a ordem de forma atômica.
- RN-06: converter desejo em compra é permitido só em WISH ACTIVE; cria um único lançamento (idempotência por `clientRequestId`) e muda o status para PURCHASED.
- RN-07: todas as consultas filtram por `userId`; `accountId` e `loanId` devem pertencer ao usuário.
- RN-08: reserva em conta: `accountId` da meta indica a conta (ex.: poupança); o aporte pode ser uma transferência real (par ligado, ADR-004) ou apenas registro lógico, conforme `linkTransfer` no pedido.
- RN-09: sem dados reais em exemplos e testes.

## Critérios de aceitação
- [ ] CA-01: criar metas dos 4 tipos; `DEBT_PAYOFF` sem `loanId` é rejeitada.
- [ ] CA-02: aportes atualizam `savedCents`, `percent`, `remainingCents` e status ACHIEVED ao atingir a meta.
- [ ] CA-03: `monthlyNeededCents` e `etaDate` corretos nos casos abaixo.
- [ ] CA-04: `DEBT_PAYOFF` deriva o progresso do saldo devedor do `Loan`.
- [ ] CA-05: `convertWishToPurchase` cria o lançamento (em conta ou cartão) e marca PURCHASED; repetir com o mesmo `clientRequestId` não duplica.
- [ ] CA-06: `reorderPriorities` é atômico e sem ordens duplicadas.
- [ ] CA-07: rotas exigem sessão e isolam por `userId`.
- [ ] CA-08: `npm run lint`, `npm test`, `npx next build` passam; código antigo `finance/application/goals/**` e `wishlist/**` não é importado.

## Impacto técnico
### Backend
`src/server/modules/goals/domain/progress.ts` (+ teste), `application/*.ts` (acima), `infra/goal-repository.ts`, `http/schemas.ts` (Zod) e as rotas. Substitui `src/app/api/goals/**` e `src/app/api/wishlist/**` do 1.x (reescrever o conteúdo; remover a wishlist).
### Frontend
Nenhum aqui. Remover `src/app/(app)/goals/` e `src/app/(app)/wishlist/` do 1.x se a F0-01 não removeu (a UI nova vive na F3-05).
### Banco de dados
`Goal` e `GoalContribution` conforme o schema 2.0 (F0-02); migration aditiva se faltarem `GoalContribution`, `loanId` ou `priorityOrder`. Índices `@@index([userId, type, status])`.
### Integrações
Nenhuma. Registro como tools na F5-01.
### Segurança
`requireAuth`, validação Zod, `userId` em tudo.

## Plano de implementação
- [ ] Etapa 1: confirmar o schema; migration aditiva se necessário.
- [ ] Etapa 2: `progress.ts` e testes.
- [ ] Etapa 3: repositório e use-cases de CRUD e aportes.
- [ ] Etapa 4: `DEBT_PAYOFF` integrado ao `Loan` (F1-05).
- [ ] Etapa 5: `convertWishToPurchase` usando `createFromDraft`.
- [ ] Etapa 6: `reorderPriorities`.
- [ ] Etapa 7: rotas finas; remover wishlist/goals antigos; docs e `.agents/context/CONTEXT.md`.

## Estratégia de testes
Fixture: `today = 2026-10-05`.
- [ ] Unitários, progresso: meta R$ 6.000,00 (600000) com R$ 1.500,00 (150000) poupados: 25%, `remaining = 450000`; com `targetDate = 2027-04-05` (6 meses): `monthlyNeeded = 75000`; sem data: `null`. Ritmo médio de R$ 500,00/mês: `etaDate` em 9 meses (2027-07-05), `onTrack = false` para a data 2027-04-05 e `true` para 2027-10-05. Meta atingida: 100%, status ACHIEVED. Retirada maior que o poupado: erro.
- [ ] Unitários, `DEBT_PAYOFF`: principal 1.000.000, saldo devedor 700000: `saved = 300000`, 30%; quitação prevista vem da F1-05.
- [ ] Integração: CRUD e aportes; `convertWishToPurchase` em conta e em cartão (3x), idempotência; `reorderPriorities` com 3 metas; isolamento por `userId`; `loanId` de outro usuário rejeitado.
- [ ] E2E: não aplicável.
- [ ] Manual: criar uma meta de cada tipo via `curl` e listar.

Edge cases: meta com `targetCents = 0` (rejeitar); `targetDate` no passado (`monthlyNeeded = remaining`, `onTrack = false`); meta ARCHIVED não aparece na listagem padrão; aporte em data futura (rejeitar ou marcar como previsto; padrão: rejeitar).

## Riscos e rollback
- Risco: perder histórico da wishlist do 1.x. Mitigação: o banco é zerado por decisão do dono (ADR-016); nada a migrar.
- Risco: aporte lógico divergir do saldo real da conta de reserva. Mitigação: preferir `linkTransfer` com transferência real; reconciliação (F1-04) é a fonte de verdade.
- Rollback: módulo novo; reverter o commit remove as rotas sem afetar o ledger.

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

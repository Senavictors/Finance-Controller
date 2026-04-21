# Task: Phase 35 - Wishlist Module And Purchase Conversion

## Status

- [ ] Todo
- [ ] In Progress
- [x] Done

## Context

O produto ja possuia transacoes, metas, recorrencias, forecast, score e insights, mas faltava um modulo para representar compras desejadas concretas. Usar `Goal` para isso geraria um acoplamento conceitual ruim: metas lidam com desempenho financeiro agregado, enquanto a wishlist precisa lidar com itens, links, prioridades, datas e um fluxo operacional de compra.

Referencias principais:

- `.docs/future-features/21-wishlist-module-and-purchase-conversion.md`
- `prisma/schema.prisma`
- `src/server/modules/finance/http/schemas.ts`
- `src/server/modules/finance/application/wishlist/`
- `src/app/(app)/wishlist/`
- `src/app/api/wishlist/`
- `src/app/api/transactions/route.ts`

## Objective

Entregar um modulo dedicado `/wishlist` com categorias proprias, cards agrupados por status e fluxo de compra que converte o item em uma despesa real nas transacoes.

## Scope

- Novos models `WishlistCategory` e `WishlistItem`
- Novos enums de prioridade e status da wishlist
- CRUD basico de categorias proprias e itens
- Fluxo de compra atomico com criacao de `Transaction`
- Integracao com invalidacao analitica e sync de billing de cartao
- Nova rota autenticada `/wishlist`
- Seed/reset demo com exemplos reais do modulo
- Documentacao da feature e da task

## Out of Scope

- Widget de dashboard para wishlist
- Alertas de preco
- Historico detalhado de variacoes de preco
- Kanban com drag-and-drop
- Relatorios/exportacoes do modulo

## Decisions

- Wishlist e um modulo proprio, separado de `goals`
- Categorias da wishlist vivem em tabela propria, nao reaproveitam `Category`
- `PURCHASED` so nasce pelo endpoint de compra, nao por edicao arbitraria
- A compra acontece dentro do proprio card via modal curto, sem redirecionamento para `/transactions`
- A transacao gerada pelo fluxo de compra e sempre do tipo `EXPENSE`

## Contracts

- `GET /api/wishlist/categories`
- `POST /api/wishlist/categories`
- `GET /api/wishlist/items`
- `POST /api/wishlist/items`
- `PATCH /api/wishlist/items/[id]`
- `DELETE /api/wishlist/items/[id]`
- `POST /api/wishlist/items/[id]/purchase`

Payload de compra:

- `accountId: string`
- `categoryId?: string`
- `amount: number` em centavos
- `date: Date`
- `notes?: string`

## Migrations

- Migration `20260421103000_add_wishlist_module`
- Novos enums:
  - `wishlist_item_priority`
  - `wishlist_item_status`
- Novas tabelas:
  - `wishlist_categories`
  - `wishlist_items`

## UI

Superficies entregues:

- `src/app/(app)/wishlist/page.tsx`
- `wishlist-filters.tsx`
- `wishlist-form.tsx`
- `wishlist-card.tsx`
- `wishlist-purchase-dialog.tsx`
- entrada `Desejos` na sidebar

## Tests

- `src/server/modules/finance/http/schemas.test.ts`
- `src/server/modules/finance/application/wishlist/use-cases.test.ts`

Checks executados:

- `npx prisma generate`
- `npm run format`
- `npm test`
- `npm run lint`
- `npm run build`

## Checklist

- [x] Code implemented
- [x] Tests passing
- [x] `.docs/CONTEXT.md` updated
- [x] `README.md` updated (roadmap/backlog/phases/proximo passo when applicable)
- [x] ADR created/updated (if applicable)
- [ ] Manual validation done

## Result

- `prisma/schema.prisma` ganhou `WishlistCategory` e `WishlistItem`, incluindo ligacao opcional para `Transaction` via `purchaseTransactionId`
- O modulo server-side nasceu em `src/server/modules/finance/application/wishlist/` com CRUD de itens/categorias e compra atomica
- As rotas `src/app/api/wishlist/` expoem leitura, criacao, edicao, exclusao e purchase conversion
- A rota `/wishlist` entrega filtros leves, cards por status, criacao/edicao por modal e compra sem sair da tela
- O fluxo de compra cria `Transaction` `EXPENSE`, sincroniza billing de cartao quando necessario e invalida analytics
- Seed e reset demo agora incluem categorias proprias da wishlist e itens em status diferentes, inclusive um item comprado com transacao vinculada
- `README.md`, `.docs/CONTEXT.md`, `.docs/CHANGELOG.md`, a spec da feature e esta task foram sincronizados

## Notes for AI (next step)

O proximo passo natural e validar manualmente `/wishlist` em browser real, principalmente o contraste dos badges/cards em `light/dark`, o comportamento dos filtros e a experiencia do modal de compra em contas comuns e cartao de credito.

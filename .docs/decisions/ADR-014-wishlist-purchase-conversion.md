# ADR-014: Wishlist Dedicada Com Conversao Atomica Em Compra

## Status

Accepted

## Context

O produto precisava cobrir uma camada de planejamento mais concreta: itens que o usuario quer comprar no futuro. `Goal` ja resolve metas financeiras agregadas, mas nao representa bem produtos individuais com link, prioridade, datas e fluxo de compra.

Ao mesmo tempo, a compra real precisava continuar obedecendo a arquitetura financeira existente:

- `Transaction` segue como fonte de verdade da despesa
- contas e categorias financeiras continuam sendo validadas por ownership
- billing de cartao precisa continuar sincronizado
- snapshots analiticos devem ser invalidados apos a compra

## Decision

### Modelagem

- Criar `WishlistCategory` para taxonomia propria do modulo
- Criar `WishlistItem` com campos de planejamento e realizado
- Relacionar compra concluida a `Transaction` por `purchaseTransactionId`

### Separacao de responsabilidade

- Wishlist nao reutiliza `Goal`
- Categorias da wishlist nao reutilizam `Category`
- `PURCHASED` nao deve ser um status arbitrario de edicao; ele nasce do fluxo operacional de compra

### Fluxo de compra

Quando o usuario compra um item:

1. o modulo abre um modal curto dentro do proprio card;
2. a API valida `accountId` e `categoryId` financeiro;
3. o sistema cria uma `Transaction` `EXPENSE`;
4. o item e atualizado com `paidPrice`, `purchasedAt`, `status = PURCHASED` e `purchaseTransactionId`;
5. billing de cartao e analytics sao sincronizados como em qualquer despesa nova.

### Superficie externa

- rota autenticada `/wishlist`
- filtros leves por status, prioridade, categoria e busca
- CRUD basico de itens e categorias proprias
- CTA de compra direto no card

## Consequences

- O produto ganha um modulo claro de planejamento de consumo sem contaminar o dominio de metas
- A compra concluida continua consistente com o resto do sistema financeiro
- O usuario passa a ter rastreabilidade entre desejo, compra e despesa registrada
- Seed/reset demo ficam mais fortes para portfolio, mostrando itens ativos e um item ja comprado
- O modulo abre caminho futuro para widget de dashboard, alertas de preco e historico de diferenca entre preco desejado e pago

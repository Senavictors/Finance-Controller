# Task: Phase 31 - Progressive Disclosure And List Scaling

## Status

- [ ] Todo
- [ ] In Progress
- [x] Done

## Context

O feedback de uso apontou que listas muito grandes comecam a degradar a experiencia, tanto visualmente quanto em performance.

Ha um detalhe importante no estado atual do projeto: a tela de `Transacoes` ja possui paginacao por `page`/`limit`, entao a critica sobre "todas as transferencias vindo de uma vez" nao deve virar uma task redundante nessa rota.

O problema, porem, continua valido em outras superficies que ainda carregam e renderizam tudo de uma vez, por exemplo:

- pagina de categorias, que lista tudo dentro de dois cards;
- pagina de recorrencias, que nao limita o volume inicial;
- detalhe de fatura, que renderiza todas as movimentacoes vinculadas sem progressao.

Referencias principais:

- `src/app/(app)/categories/page.tsx`
- `src/app/(app)/categories/category-list.tsx`
- `src/app/(app)/recurring/page.tsx`
- `src/app/(app)/recurring/recurring-list.tsx`
- `src/app/(app)/credit-cards/[id]/page.tsx`
- `src/app/(app)/transactions/page.tsx`
- `src/app/(app)/transactions/pagination.tsx`

## Objective

Introduzir padroes de divulgacao progressiva para listas densas, melhorando legibilidade inicial e evitando renderizacao sem limite nas telas com maior tendencia de crescimento.

## Scope

- Limitar os cards de categorias a uma previa curta, como 5 itens, com CTA `Ver mais`.
- Abrir a lista completa de categorias em modal ou sheet com edicao/exclusao preservadas.
- Escolher um padrao simples de escalabilidade para colecoes grandes: `carregar mais`, paginacao ou combinacao dependendo da tela.
- Aplicar a primeira rodada desse padrao nas superficies de maior risco real no estado atual do repo.
- Reaproveitar a paginacao de `Transacoes` como referencia de contrato quando fizer sentido.

## Out of Scope

- Virtualizacao para todo o app.
- Busca e ordenacao avancada em todas as listas nesta mesma fase.
- Reescrever todas as paginas de listagem ao mesmo tempo.
- Mudar a arquitetura de dados apenas para suportar infinite scroll.

## Decisions

- O problema deve ser atacado onde ele realmente existe hoje, e nao onde o projeto ja tem paginacao.
- Listas com valor de descoberta rapida podem abrir com preview curto + `Ver mais`.
- Listas com historico operacional e crescimento continuo tendem a se beneficiar mais de `page/limit` ou `carregar mais`.
- Evitar uma abstracao global prematura; aplicar o padrao em 1 a 3 superficies primeiro e consolidar depois.

## Contracts

Contrato ja existente que pode servir de base:

- `transactionQuerySchema` com `page` e `limit` em `src/server/modules/finance/http/schemas.ts`.

Se novas rotas ou query params forem criados nesta fase, preferir nomenclatura consistente com o padrao atual:

- `page`
- `limit`

## Migrations

- Nenhuma migration de banco e necessaria.

## UI

Superficies candidatas para a primeira implementacao:

- `/categories`
- `/recurring`
- `/credit-cards/[id]`

Pontos de atencao:

- preview curta deve continuar util e editavel;
- CTA `Ver mais` ou `Carregar mais` precisa ser claro;
- listas longas nao devem bloquear leitura da pagina principal;
- experiencia mobile precisa continuar simples.

## Tests

- Manual
  - validar categorias com volume alto;
  - validar listas de recorrencias e movimentacoes de fatura com dataset maior;
  - validar que a pagina de transacoes nao regrediu.
- Integracao, se aplicavel
  - query params ou API de pagina adicional.

## Checklist

- [x] Preview curta de categorias implementada
- [x] Modal ou sheet de lista completa de categorias implementado
- [x] Padrao de divulgacao progressiva aplicado nas listas prioritarias
- [x] Testes passando
- [x] `.docs/CONTEXT.md` updated
- [ ] ADR created/updated (if applicable)
- [x] Manual validation done

## Outcome

- Novo componente `CategoryListCard` em `src/app/(app)/categories/category-list-card.tsx` renderiza os primeiros 5 pais com seus filhos e expoe um `Ver todas (N)` que abre um `Dialog` com a lista completa reutilizando `CategoryList` (edicao/exclusao preservadas).
- `RecurringList` agora controla visibilidade com state local (`INITIAL_VISIBLE=10`, `PAGE_SIZE=10`) e expoe um botao `Carregar mais (N restantes)` abaixo da lista.
- Detalhe de fatura migrou as movimentacoes para `StatementTransactionsList` (client component) que aplica o mesmo `carregar mais` incremental sobre a lista passada pelo server component.
- Pagina de transacoes permanece com paginacao server-side inalterada.

## Notes for AI (next step)

Sequencia recomendada:

1. comecar por categorias, porque o ganho visual e imediato;
2. depois aplicar o mesmo raciocinio em uma lista operacional de maior volume;
3. so entao decidir se vale padronizar tudo em um componente compartilhado.

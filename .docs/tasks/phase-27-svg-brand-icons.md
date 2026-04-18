# Task: Phase 27 - SVG Brand Icons

## Status

- [ ] Todo
- [ ] In Progress
- [x] Done

## Context

O design bundle em `design_system/finance-controller-design-system/` introduz uma biblioteca de marcas SVG em `project/ui_kits/web/brands.js` e um componente hibrido `BrandIcon` em `project/ui_kits/web/index.html`.

Hoje o sistema real ainda depende principalmente de `color` para representar contas e categorias em formularios, selects, tabelas e cards, apesar de `Account.icon` e `Category.icon` ja existirem no schema Prisma e nos contratos HTTP.

Principais referencias levantadas:

- `design_system/finance-controller-design-system/project/ui_kits/web/brands.js`
- `design_system/finance-controller-design-system/project/ui_kits/web/index.html`
- `src/app/(app)/accounts/account-form.tsx`
- `src/app/(app)/categories/category-form.tsx`
- `src/app/(app)/transactions/transaction-form.tsx`
- `src/app/(app)/recurring/recurring-form.tsx`
- `src/app/(app)/accounts/account-card.tsx`
- `src/app/(app)/categories/category-list.tsx`
- `src/app/(app)/transactions/transaction-table.tsx`
- `src/app/(app)/recurring/recurring-list.tsx`

## Objective

Substituir o uso exclusivamente cromatico por logos/icones SVG para bancos, bandeiras, meios de pagamento e assinaturas, mantendo fallback visual por cor quando a marca nao for reconhecida ou nao tiver sido configurada.

## Scope

- Extrair a biblioteca de marcas do design system para um modulo TypeScript reutilizavel no app real.
- Criar um componente compartilhado para renderizar logos SVG por chave sem salvar SVG bruto no banco.
- Passar a persistir e consumir `icon` em contas e categorias.
- Mostrar logos nos principais fluxos de escolha e leitura:
  - contas
  - categorias
  - transacoes
  - recorrencias
  - metas
  - credit cards / faturas onde houver conta ou categoria associada
- Preservar `color` como fallback visual e como suporte a graficos/listagens que continuam dependentes de cor.
- Popular seed/reset demo com chaves de icone coerentes com as marcas do design system.

## Out of Scope

- Upload manual de SVG pelo usuario.
- Buscar logos em APIs/CDNs externas.
- Trocar os graficos analiticos por logos.
- Introduzir edicao vetorial ou customizacao livre de icones.
- Criar neste momento campos novos em `Transaction` ou `RecurringRule` so para armazenar SVG bruto.

## Decisions

- `icon` deve armazenar apenas uma chave semantica da marca, por exemplo `nubank`, `itau`, `visa`, `netflix`, `spotify`.
- Os SVGs permanecem versionados no frontend em uma registry central; o banco nunca guarda markup SVG.
- `color` continua existindo como fallback para estados sem marca reconhecida e para superficies analiticas orientadas por cor.
- Para recorrencias e transacoes, seguir o modelo do design system:
  - primeiro tentar resolver marca pelo texto (`description` / nome)
  - se nao houver match, usar icone da conta ou categoria
  - se ainda assim nao houver icone, cair para chip/color dot
- Se a equipe quiser override manual por recorrencia em vez de inferencia por descricao, isso vira um follow-up separado com avaliacao de schema.

## Contracts

- `POST/PATCH /api/accounts`
  - continuar aceitando `icon?: string`
  - UI deve passar `icon` junto com `color`
- `POST/PATCH /api/categories`
  - continuar aceitando `icon?: string`
  - UI deve passar `icon` junto com `color`
- Reads de contas/categorias em pages e route handlers devem incluir `icon` nos `select`
- Novo contrato interno sugerido para componente compartilhado:
  - `brandKey?: string | null`
  - `fallbackLabel: string`
  - `fallbackColor?: string | null`
  - `size?: number`
  - `radius?: 'sm' | 'md' | 'lg' | number`

## Migrations

- Nenhuma migration obrigatoria para a primeira iteracao.
- `Account.icon` e `Category.icon` ja existem em `prisma/schema.prisma`.
- Avaliar script de backfill para dados existentes com base em nome/descricao:
  - contas bancarias e cartoes a partir do nome
  - categorias de assinatura conhecidas, quando fizer sentido

## UI

Superficies a ajustar na implementacao:

- Biblioteca compartilhada
  - criar `brand-registry` tipado a partir do `BRANDS` do design system
  - criar `matchBrand()` utilitario inspirado no prototipo
  - criar componente `BrandIcon`
- Contas
  - trocar color picker isolado por seletor de banco/bandeira + preview SVG
  - manter cor como fallback opcional
  - atualizar cards e listas de conta para renderizar logo
- Categorias
  - permitir escolher icone/marca SVG em categorias, principalmente despesas do tipo assinatura/servico
  - atualizar lista hierarquica para usar `BrandIcon` no lugar do dot simples quando houver `icon`
- Formularios de escolha
  - `TransactionForm`: mostrar icones em selects de conta/categoria
  - `RecurringForm`: mostrar icones em selects de conta/categoria
  - `GoalForm`: mostrar icones em selects de conta/categoria
  - filtros de transacao e demais selects relacionados: mostrar icones no item selecionado e na lista
- Leitura operacional
  - `TransactionTable`: trocar dots de conta/categoria por logos/fallbacks
  - `RecurringList`: mostrar logo inferido pela descricao e logos de conta/categoria
  - paginas de fatura e credit cards: mostrar logos da conta/cartao e categorias relacionadas
  - widgets/listas do dashboard que exibem contas ou ultimas transacoes devem consumir o novo componente

## Tests

- Unitarios
  - cobertura para `matchBrand()` com bancos, bandeiras, pagamentos e assinaturas
  - fallback para label/cor quando nao houver marca
  - normalizacao sem acentos e aliases principais
- Integracao/UI
  - submit de conta persiste `icon`
  - submit de categoria persiste `icon`
  - tabela/lista renderiza logo quando `icon` existir
  - recorrencia/transacao renderizam logo inferido pela descricao quando aplicavel
- Manual
  - criar conta Nubank, Itau e cartao com bandeira
  - criar/editar categoria `Assinaturas` com icone
  - verificar selects em transacoes, recorrencias e metas
  - validar fallback quando nao houver marca cadastrada

## Checklist

- [x] Extrair `BRANDS` e `matchBrand` para modulo TypeScript compartilhado
- [x] Criar componente reutilizavel `BrandIcon`
- [x] Atualizar tipos e `select`s de leitura para incluir `icon`
- [x] Evoluir `AccountForm` para selecionar marca SVG
- [x] Evoluir `CategoryForm` para selecionar marca SVG
- [x] Mostrar icones nos selects de transacoes, recorrencias, metas e filtros
- [x] Atualizar cards/listas/tabelas para preferir logo em vez de dot por cor
- [x] Ajustar seed e reset demo com icones coerentes
- [x] Cobrir match/fallback com testes
- [ ] Validar visualmente light/dark e mobile
- [x] `.docs/CONTEXT.md` updated
- [ ] ADR created/updated (if applicable)
- [ ] Manual validation done

## Notes for AI (next step)

Recomendacao de execucao em ordem:

1. Implementar registry + `BrandIcon` + `matchBrand`.
2. Conectar `icon` em contas e categorias antes de tocar nas telas derivadas.
3. Atualizar formularios/selects compartilhados para suportar item com logo + label.
4. Ajustar leitura operacional (`TransactionTable`, `RecurringList`, credit cards, dashboard).
5. Fechar com seed/reset demo, testes e validacao visual.

Atencao principal: o design system usa uma estrategia hibrida. O app real nao deve abandonar `color`; ele deve rebaixar `color` para fallback e para cenarios analiticos, enquanto o SVG passa a ser a pista visual primaria nos fluxos operacionais.

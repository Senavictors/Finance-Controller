# Task: Phase 37 - Categories Page Redesign

## Status

- [x] Todo
- [x] In Progress
- [x] Done

## Context

A pagina de categorias (`/categories`) funciona mas tem visual basico: header simples, lista flat sem collapse, sem busca e sem stats. O route handler (`app/api/categories/route.ts`) usa Prisma direto — essa divida tecnica fica fora do escopo desta fase.

Esta fase e puramente de UI/UX: nenhuma mudanca de schema, nenhuma nova API, nenhuma nova rota. Os dados ja existem (categorias pai/filho, count de transacoes). O objetivo e reorganizar a apresentacao para ficar mais rica e navegavel.

Referencias:
- `src/app/(app)/categories/page.tsx`
- `src/app/(app)/categories/category-list-card.tsx`
- `src/app/(app)/categories/category-list.tsx`
- `src/app/(app)/categories/category-form.tsx`
- `src/app/api/categories/route.ts` (nao sera alterado)
- `src/app/api/categories/[id]/route.ts` (nao sera alterado)

## Objective

Redesenhar a pagina de categorias com header informativo (titulo + subtitulo + busca client-side + botao de criar), stats row com 4 cards de resumo, cards de secao com header colorido e expand/collapse de subcategorias por chevron, e botao inline de adicionar categoria por tipo no rodape de cada card.

## Scope

### O que entra
- Novo layout do header (titulo + subtitulo + busca + botao)
- Stats row com 4 cards (Total, Receitas, Despesas, Subcategorias)
- Redesign dos cards de secao (header com icone circular colorido, botao "+ Adicionar" por tipo)
- Expand/collapse de subcategorias por chevron (colapsadas por padrao)
- Icone circular maior nas linhas de categoria (~32px)
- Busca client-side por nome (filtra pais e filhos, pai aparece se qualquer filho bate)
- Botao "Adicionar categoria de receita/despesa" inline no rodape do card
- Botao "Ver todas (N categorias)" quando mais de 5 pais

### O que NAO entra
- Extracao do route.ts para `application/categories/` (divida tecnica separada)
- Mudancas no schema Prisma
- Novas APIs ou rotas
- Mudancas no CategoryForm alem de aceitar `defaultType` prop

## Decisions

- Busca e 100% client-side (sem request) — filtra o array ja carregado pelo server component
- Cores dos cards de secao: teal/cyan para Receitas, amber/laranja para Despesas — consistente com o padrao verde=receita, vermelho=despesa do sistema
- Subcategorias colapsadas por padrao para manter a pagina limpa
- `CategoryForm` recebe prop opcional `defaultType?: "INCOME" | "EXPENSE"` para pre-selecionar tipo ao criar via botao inline

## Schema Prisma

Nenhuma alteracao.

## Implementation Checklist

### 1. Componente de Stats (`src/app/(app)/categories/category-stats.tsx`)
- [ ] Novo Client Component que recebe as categorias e computa os 4 stats
- [ ] Card "Total de categorias" — icone `Layers` — total + sublabel "X principais - Y subcategorias"
- [ ] Card "Receitas" — icone `TrendingUp` (verde) — count de pais INCOME
- [ ] Card "Despesas" — icone `TrendingDown` (vermelho) — count de pais EXPENSE
- [ ] Card "Subcategorias" — icone `GitBranch` — count total de filhos + sublabel

### 2. Wrapper Client Component (`src/app/(app)/categories/categories-content.tsx`)
- [ ] Novo Client Component que recebe categorias do server e gerencia estado de busca
- [ ] Estado `searchQuery` com input controlado
- [ ] Logica de filtragem: pai aparece se nome do pai OU nome de qualquer filho bate na query
- [ ] Renderiza `<CategoryStats>`, cards de Receitas e Despesas com categorias filtradas

### 3. Page Server Component (`src/app/(app)/categories/page.tsx`)
- [ ] Manter query Prisma existente (findMany com _count)
- [ ] Novo header: titulo "Categorias" + subtitulo descritivo
- [ ] Delegar busca, stats e cards para `<CategoriesContent>`
- [ ] Botao "+ Nova categoria" no header (usando `<CategoryForm>` existente)

### 4. Card de Secao (`src/app/(app)/categories/category-list-card.tsx`)
- [ ] Header redesenhado: icone circular grande colorido + titulo + sublabel "X categorias principais"
- [ ] Botao "+ Adicionar" outline com cor da secao no header — abre `<CategoryForm defaultType={tipo}>`
- [ ] Menu "..." no header (placeholder para futuras opcoes)
- [ ] Footer com link "Adicionar categoria de [receita/despesa]" + "Ver todas (N) ->"
- [ ] Passa prop `defaultType` para o form de criacao

### 5. Linhas de Categoria (`src/app/(app)/categories/category-list.tsx`)
- [ ] Icone circular maior (~32px) usando BrandDot existente
- [ ] Nome em font-medium + badge com count de transacoes
- [ ] Chevron a direita para expand/collapse subcategorias (estado local por pai)
- [ ] Subcategorias colapsadas por padrao
- [ ] Subcategorias: indentadas com linha vertical, bullet menor + nome + badge + menu
- [ ] Menu "..." por linha (Editar, Excluir) — manter comportamento existente

### 6. CategoryForm (`src/app/(app)/categories/category-form.tsx`)
- [ ] Aceitar prop `defaultType?: "INCOME" | "EXPENSE"`
- [ ] Pre-selecionar tipo no formulario quando `defaultType` e fornecido
- [ ] Nenhuma outra mudanca funcional

### 7. Documentacao
- [ ] `.docs/CONTEXT.md` — atualizar apos conclusao
- [ ] `README.md` — atualizar roadmap
- [ ] `.docs/CHANGELOG.md` — adicionar entrada

## Ordem de Implementacao

1. `category-stats.tsx` — componente isolado, sem dependencias
2. `category-list.tsx` — redesign das linhas com expand/collapse
3. `category-form.tsx` — adicionar prop `defaultType`
4. `category-list-card.tsx` — redesign do card de secao com novo header/footer
5. `categories-content.tsx` — wrapper client com busca e filtragem
6. `page.tsx` — novo header, delegar para wrapper client
7. Validacao visual e documentacao

## Modulos Impactados

| Arquivo | Tipo de mudanca |
|---|---|
| `src/app/(app)/categories/page.tsx` | Refatorar layout, delegar para wrapper client |
| `src/app/(app)/categories/category-list-card.tsx` | Redesign completo (header, footer, cores) |
| `src/app/(app)/categories/category-list.tsx` | Expand/collapse, icone maior, linha vertical |
| `src/app/(app)/categories/category-form.tsx` | Nova prop `defaultType` |
| `src/app/(app)/categories/categories-content.tsx` | **Novo arquivo** — wrapper client com busca |
| `src/app/(app)/categories/category-stats.tsx` | **Novo arquivo** — stats row |

## Armadilhas e Riscos

- **Server vs Client boundary**: a page.tsx e Server Component e faz a query Prisma. A busca client-side precisa de um wrapper Client Component que receba os dados como props. Nao mover a query para o client.
- **Filtragem de busca com hierarquia**: quando a busca bate num filho, o pai precisa aparecer tambem (mesmo que o nome do pai nao bata). Implementar logica de "pai visivel se qualquer filho bate".
- **Estado de collapse por pai**: usar `Record<string, boolean>` ou `Set<string>` para rastrear quais pais estao expandidos. Ao buscar, considerar expandir automaticamente pais que tem filhos que batem na query.
- **BrandDot tamanho**: verificar se o componente BrandDot aceita prop de tamanho ou se precisa de CSS override para 32px.
- **Dark mode**: todos os novos componentes devem usar tokens semanticos Tailwind e classes `.dark` — nao hardcodar cores claras.
- **Sem roxo**: cores dos cards devem ser teal/cyan (receita) e amber/laranja (despesa), nunca roxo.

## Criterios de Aceite

- [ ] Header exibe titulo, subtitulo, campo de busca e botao de criar categoria
- [ ] Stats row mostra 4 cards com contagens corretas (total, receitas, despesas, subcategorias)
- [ ] Cards de secao tem header com icone circular colorido e botao "+ Adicionar" por tipo
- [ ] Subcategorias colapsam/expandem ao clicar no chevron
- [ ] Subcategorias estao colapsadas por padrao
- [ ] Busca filtra categorias por nome client-side (pai aparece se filho bate)
- [ ] Botao "Adicionar categoria de receita" abre form com tipo pre-selecionado INCOME
- [ ] Botao "Adicionar categoria de despesa" abre form com tipo pre-selecionado EXPENSE
- [ ] Dark mode funciona em todos os novos componentes
- [ ] Nenhuma cor roxa em nenhum lugar
- [ ] `npm run build` passa sem erros
- [ ] `npm run lint` passa sem erros

## Validacao Manual

1. Acessar `/categories` — verificar que o header tem titulo, subtitulo, busca e botao
2. Conferir que os 4 cards de stats mostram numeros corretos comparando com o banco
3. Clicar no chevron de uma categoria pai — subcategorias devem expandir/colapsar
4. Digitar nome de uma subcategoria na busca — o pai deve aparecer junto
5. Clicar em "+ Adicionar" no card de Receitas — form deve abrir com tipo INCOME pre-selecionado

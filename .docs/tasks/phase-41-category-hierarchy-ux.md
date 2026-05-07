# Phase 41 — Hierarquia de Categorias (Pai/Filho)

## Objetivo

Melhorar a UX de seleção e cadastro de categorias para respeitar a hierarquia pai/filho. Hoje o seletor de categorias exibe tudo em uma lista plana misturando categorias pai e subcategorias. O schema já suporta hierarquia (`parentId`), falta apenas expor isso corretamente na interface.

## Escopo

### 1. API — Parâmetros de filtragem hierárquica

**Arquivo**: `src/app/api/categories/route.ts`

- Suportar `?rootOnly=true` → retorna apenas categorias sem `parentId`
- Suportar `?parentId=<id>` → retorna filhos de uma categoria pai específica
- Ambos os parâmetros combinam com o filtro de `type` existente
- Atualizar `categoryQuerySchema` em `src/server/modules/finance/http/schemas.ts` para aceitar os novos campos

### 2. Componente `CategoryPicker` — Seletor em 2 etapas

**Novo arquivo**: `src/components/category-picker.tsx`

Componente reutilizável que encapsula a lógica de seleção hierárquica:

```
Props:
  - value: string | null          (categoryId selecionado)
  - onChange: (id: string | null) => void
  - type: CategoryType            (filtra por tipo)
  - categories: Category[]        (lista completa — pai + filhos)
  - name?: string                 (para uso em formulários não-controlados)
```

Comportamento:
1. **Etapa 1**: exibe `<Select>` com categorias **pai** (`parentId == null`), filtradas por `type`
2. Ao selecionar uma pai:
   - Se ela tiver filhos → exibe segundo `<Select>` com as subcategorias
   - Se não tiver filhos → define `value` como o id da própria pai
3. O `categoryId` final submetido é sempre o da subcategoria (quando existe) ou da pai (quando não há filhos)
4. Em modo de edição: pré-preencher ambos os selects com base no `categoryId` atual (buscar a pai via `category.parentId`)

### 3. Formulário de Transação

**Arquivo**: `src/app/(app)/transactions/transaction-form.tsx`

- Substituir o `<Select>` plano de categorias pelo novo `<CategoryPicker>`
- A prop `categories` já existe — apenas trocar o componente
- O campo hidden `categoryId` continua sendo submetido no `FormData`

### 4. Formulário de Recorrências

**Arquivo**: localizar em `src/app/(app)/recurring*` ou similar

- Mesmo padrão: substituir seletor plano pelo `<CategoryPicker>`

### 5. Formulário de Metas

**Arquivo**: `src/app/(app)/goals/goal-form.tsx`

- Mesmo padrão: substituir seletor plano pelo `<CategoryPicker>`

### 6. Formulário de Categorias — Fluxo Pai/Filho

**Arquivo**: `src/app/(app)/categories/category-form.tsx`

Separar o fluxo em dois modos claros:

**Modo "Categoria Pai"** (padrão):
- Campos: Nome, Tipo, Ícone, Cor
- Sem campo de parentId

**Modo "Subcategoria"**:
- Campos: Nome, Ícone, Cor + seletor de Categoria Pai (obrigatório)
- Tipo é herdado da categoria pai selecionada (readonly)
- Se não houver nenhuma categoria pai cadastrada: mostrar aviso e desabilitar a criação de subcategoria

**Na página de categorias** (`categories-content.tsx` ou similar):
- Dois botões de ação: `"+ Categoria"` e `"+ Subcategoria"`
- Cada um abre o `CategoryForm` no modo correspondente

### 7. Listagem de Categorias

**Arquivo**: `src/app/(app)/categories/category-list.tsx`

- Verificar se já exibe hierarquia; se não, agrupar subcategorias indentadas sob cada pai
- Categorias pai sem filhos: exibir normalmente
- Categorias pai com filhos: exibir com indicador de expansão (ou já expandidas inline)

## Ordem de Implementação

1. Atualizar `categoryQuerySchema` + `GET /api/categories` (habilita rootOnly/parentId)
2. Criar `CategoryPicker` com lógica das 2 etapas
3. Integrar `CategoryPicker` em `transaction-form.tsx`
4. Integrar em `goal-form.tsx` e formulário de recorrências
5. Reformular `category-form.tsx` (modo pai vs subcategoria)
6. Revisar listagem de categorias para hierarquia visual

## Arquivos Impactados

| Arquivo | Mudança |
|---|---|
| `src/server/modules/finance/http/schemas.ts` | `categoryQuerySchema` — novos campos |
| `src/app/api/categories/route.ts` | filtros `rootOnly` e `parentId` |
| `src/components/category-picker.tsx` | **novo** |
| `src/app/(app)/transactions/transaction-form.tsx` | usa `CategoryPicker` |
| `src/app/(app)/goals/goal-form.tsx` | usa `CategoryPicker` |
| `src/app/(app)/recurring*/` (localizar) | usa `CategoryPicker` |
| `src/app/(app)/categories/category-form.tsx` | fluxo pai/filho |
| `src/app/(app)/categories/categories-content.tsx` | botões separados |
| `src/app/(app)/categories/category-list.tsx` | hierarquia visual |

## Critérios de Aceite

- [ ] Seletor de categoria em transações mostra pai primeiro, depois filhos
- [ ] Categorias pai sem filhos funcionam diretamente como categoria final
- [ ] Formulário de subcategoria exige pai vinculada
- [ ] Botão "Nova Subcategoria" fica desabilitado se não há categorias pai do tipo
- [ ] Modo edição pré-preenche ambos os selects corretamente
- [ ] Nenhum campo de banco de dados alterado (zero migrações necessárias)
- [ ] Filtros de transação também usam `CategoryPicker` (verificar `transaction-filters.tsx`)

## Notas

- Nenhuma migração de banco necessária — o schema já tem `parentId` e a relação hierárquica
- A prop `categories` nos formulários já recebe a lista completa; basta separar pai/filho no componente
- Manter compatibilidade com categorias existentes que não têm `parentId` (continuam funcionando como categorias pai)

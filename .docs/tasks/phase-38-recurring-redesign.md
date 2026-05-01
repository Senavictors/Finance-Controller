# Phase 38 — Redesign da Página de Recorrências

## Objetivo

Redesenhar completamente a página `/recurring` para uma experiência mais rica e informativa: 4 cards de sumário no topo, barra de filtros integrada com busca e pills de status/frequência, e tabela com colunas claras (serviço com brand icon, categoria com badge colorida, conta com logo do banco, frequência, próxima data, status e valor). A lógica de negócio e os endpoints de API permanecem intactos — esta phase é exclusivamente de UI/UX e cálculo de `nextDate` server-side.

## Escopo

### O que entra

- Novo componente `RecurringStats` com 4 cards de sumário (total mensal, próxima cobrança, regras ativas, categorias recorrentes)
- Refatoração de `RecurringList` para tabela com colunas: Serviço/Descrição, Categoria, Conta/Cartão, Frequência, Próxima Data, Status, Valor, Ações
- Barra de filtros com busca client-side, pills de status (Todas / Ativas / Pausadas) e pills de frequência (Mensais / Anuais)
- Migração dos botões "Aplicar regras" e "Nova recorrência" para dentro da barra de filtros
- Brand icons circulares na coluna Serviço (usando assets existentes em `public/brands/`)
- Logo do banco na coluna Conta/Cartão
- Badge colorida de categoria com ícone de tag
- Coluna Próxima Data com ícone de calendário (calculada server-side)
- Badge de status (Ativa / Pausada)
- Paginação com contador "Exibindo X de Y recorrências"
- Função `getNextOccurrence(rule): Date | null` em utilitário separado

### O que NÃO entra

- Mudanças no schema Prisma
- Novos endpoints de API
- Mudanças funcionais no `RecurringForm` (modal de create/edit permanece)
- Extração dos route handlers para camada `application/`
- Filtros de período ou date range

## Módulos Impactados

| Arquivo | Tipo de mudança |
|---|---|
| `src/app/(app)/recurring/page.tsx` | Calcular stats e nextDate, passar props serializáveis |
| `src/app/(app)/recurring/recurring-list.tsx` | Refatoração completa: tabela, filtros, busca, paginação |
| `src/app/(app)/recurring/recurring-stats.tsx` | **Novo** — 4 cards de sumário |
| `src/app/(app)/recurring/recurring-utils.ts` | **Novo** — função `getNextOccurrence` |
| `src/app/(app)/recurring/apply-button.tsx` | Sem mudança funcional (integrado na barra de filtros) |
| `src/app/(app)/recurring/recurring-form.tsx` | Sem mudança |
| `src/app/api/recurring-rules/route.ts` | Sem mudança |

## Implementação

### Passo 1 — Utilitário `getNextOccurrence`

Criar `src/app/(app)/recurring/recurring-utils.ts` com a função pura que calcula a próxima ocorrência futura de uma regra.

Reutilizar a mesma lógica de `src/server/modules/finance/application/forecast/project-recurrences.ts`.

```ts
type RecurringRuleInput = {
  frequency: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY"
  dayOfMonth: number | null
  dayOfWeek: number | null
  startDate: Date
  endDate: Date | null
  isActive: boolean
}

export function getNextOccurrence(rule: RecurringRuleInput): Date | null
```

Lógica:
- Se `!rule.isActive`, retorna `null`
- Se `rule.endDate` já passou de hoje, retorna `null`
- Define `from` como `max(amanhã, rule.startDate)`
- Itera dia a dia (guard de 400 iterações) procurando o primeiro dia que satisfaz a frequência:
  - `DAILY`: primeiro dia a partir de `from`
  - `WEEKLY`: primeiro dia onde `date.getDay() === rule.dayOfWeek`
  - `MONTHLY`: primeiro dia onde `date.getDate() === rule.dayOfMonth`
  - `YEARLY`: primeiro dia onde `date.getDate() === rule.dayOfMonth && date.getMonth() === rule.startDate.getMonth()`
- Retorna o `Date` encontrado ou `null`

### Passo 2 — Cálculo de stats no `page.tsx`

No Server Component `page.tsx`, após buscar as regras do banco, calcular:

```ts
import { getNextOccurrence } from "./recurring-utils"

const rulesWithNext = rules.map(rule => ({
  ...rule,
  nextDateIso: getNextOccurrence(rule)?.toISOString() ?? null,
}))

const activeRules = rulesWithNext.filter(r => r.isActive)

const totalMonthly = activeRules.reduce((sum, r) => {
  if (r.type !== "EXPENSE") return sum
  const monthly =
    r.frequency === "MONTHLY" ? r.amount :
    r.frequency === "YEARLY"  ? Math.round(r.amount / 12) :
    r.frequency === "WEEKLY"  ? Math.round(r.amount * 4.33) :
    r.frequency === "DAILY"   ? r.amount * 30 : 0
  return sum + monthly
}, 0)

const nextCharge = [...activeRules]
  .filter(r => r.nextDateIso !== null)
  .sort((a, b) => a.nextDateIso!.localeCompare(b.nextDateIso!))
  [0] ?? null

const activeCount = activeRules.length

const categoriesCount = new Set(
  activeRules.map(r => r.categoryId).filter(Boolean)
).size
```

Passar para os componentes filhos valores serializáveis (sem `Date` puro — usar `nextDateIso: string | null`).

### Passo 3 — Componente `RecurringStats`

Criar `src/app/(app)/recurring/recurring-stats.tsx` seguindo o mesmo padrão de `src/app/(app)/categories/category-stats.tsx`.

Props:
```ts
type RecurringStatsProps = {
  totalMonthly: number       // em centavos
  nextCharge: { description: string; nextDateIso: string } | null
  activeCount: number
  categoriesCount: number
}
```

4 cards com `shadcn/ui Card`:

| Card | Ícone | Valor | Sublabel |
|---|---|---|---|
| Total mensal recorrente | `TrendingDown` (rose) | `formatCurrency(totalMonthly)` | "Valor total por mês" |
| Próxima cobrança | `Calendar` (amber) | data abreviada pt-BR ("23 de mai.") | `nextCharge.description` ou "—" |
| Regras ativas | `CheckCircle2` (green) | `activeCount` | "Regras em execução" |
| Categorias recorrentes | `Tag` (blue) | `categoriesCount` | "Categorias utilizadas" |

Layout: `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6`

### Passo 4 — Refatoração de `RecurringList`

Client Component com estado interno de filtros e paginação.

**Estado:**
```ts
const [search, setSearch] = useState("")
const [statusFilter, setStatusFilter] = useState<"all" | "active" | "paused">("all")
const [freqFilter, setFreqFilter] = useState<"all" | "MONTHLY" | "YEARLY">("all")
const [page, setPage] = useState(1)
const PAGE_SIZE = 10
```

**Filtro derivado (sem useEffect):**
```ts
const filtered = rules
  .filter(r => !search || r.description.toLowerCase().includes(search.toLowerCase()))
  .filter(r => statusFilter === "all" ? true : statusFilter === "active" ? r.isActive : !r.isActive)
  .filter(r => freqFilter === "all" ? true : r.frequency === freqFilter)

const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
```

Resetar `page` para 1 ao mudar qualquer filtro.

**Layout da barra de filtros:**
```
[🔍 Buscar recorrência...]  [Todas][Ativas][Pausadas]  [Mensais][Anuais]    [▶ Aplicar regras] [+ Nova recorrência]
```

**Colunas da tabela:**

| Coluna | Conteúdo |
|---|---|
| Serviço / Descrição | `<ServiceIcon>` circular + `description` bold + `notes` muted |
| Categoria | `<Badge variant="outline">` com ícone `Tag` + `category.name` |
| Conta / Cartão | `<BankIcon>` + `account.name` |
| Frequência | "Mensal" / "Anual" / "Semanal" / "Diária" |
| Próxima data | `CalendarDays` icon + data "dd/MM/yyyy" ou "—" |
| Status | Badge verde "Ativa" ou cinza "Pausada" |
| Valor | `formatCurrency(amount)` alinhado à direita |
| Ações | `<DropdownMenu>` "..." → Editar / Pausar·Ativar / Excluir |

**`ServiceIcon`:** normalizar `description` para slug e tentar match contra arquivos em `public/brands/`. Fallback: círculo com inicial.

**`BankIcon`:** normalizar `account.name` para slug e tentar match contra bancos conhecidos (`nubank`, `itau`, `bradesco`, `santander`, `bb`, `caixa`, `inter`, `c6`, `btg`, `sicredi`). Fallback: ícone `CreditCard`.

**Paginação:**
```
Exibindo {paginated.length} de {filtered.length} recorrências    [<] [1] [2] [>]
```

### Passo 5 — Integração no `page.tsx`

Substituir renderização atual por:

```tsx
<div>
  <div className="mb-6">
    <h1 className="text-2xl font-bold">Recorrências</h1>
    <p className="text-muted-foreground text-sm">
      Gerencie suas cobranças recorrentes de forma simples e eficiente.
    </p>
  </div>
  <RecurringStats
    totalMonthly={totalMonthly}
    nextCharge={nextCharge}
    activeCount={activeCount}
    categoriesCount={categoriesCount}
  />
  <RecurringList
    rules={rulesWithNext}
    accounts={accounts}
    categories={categories}
  />
</div>
```

Remover import de `ApplyButton` do `page.tsx` (o botão agora vive dentro de `RecurringList`).

## Verificação

```bash
npm run build   # deve passar sem erros de tipo
npm run lint    # deve passar sem warnings
```

**Checklist manual:**

- [ ] 4 cards de stats aparecem com valores corretos
- [ ] "Total mensal" bate com a soma manual das regras EXPENSE ativas
- [ ] "Próxima cobrança" aponta para a regra com `nextDate` mais próxima
- [ ] Busca filtra por descrição (case-insensitive)
- [ ] Pill "Ativas" mostra apenas `isActive = true`
- [ ] Pill "Pausadas" mostra apenas `isActive = false`
- [ ] Pill "Mensais" mostra apenas `frequency = "MONTHLY"`
- [ ] Mudar filtro reseta para página 1
- [ ] Ação "Pausar/Ativar" faz toggle e atualiza a tabela
- [ ] Ação "Editar" abre `RecurringForm` com dados preenchidos
- [ ] Ação "Excluir" confirma e remove da tabela
- [ ] Brand icons aparecem para serviços conhecidos (Netflix, Disney+, etc.)
- [ ] Fallback de inicial funciona para descrições sem match
- [ ] Dark mode correto em todos os novos componentes
- [ ] `npm run build` passa sem erros

## Armadilhas

- **Serialização de `Date`**: Next.js App Router lança erro ao passar `Date` de Server para Client Component. Sempre usar `nextDateIso: string | null` (`.toISOString()`) e reconstruir com `new Date(iso)` no client.
- **`getNextOccurrence` sem diretiva**: manter `recurring-utils.ts` sem `"use client"` para poder importar tanto em Server Components quanto em Client Components.
- **Match de brand icon**: usar match parcial (slug contém o nome da marca), nunca lançar erro — sempre ter fallback visual.
- **Coluna Conta sem dígitos**: o schema atual de `Account` não tem campo de últimos 4 dígitos. Exibir apenas o nome da conta; não inventar dados.
- **Dark mode**: usar tokens semânticos Tailwind (`bg-card`, `text-muted-foreground`, `border`) — não hardcodar `bg-white`.
- **Paginação com filtros**: ao mudar qualquer filtro, resetar `page` para 1 para evitar páginas inexistentes.

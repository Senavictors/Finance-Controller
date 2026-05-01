'use client'

import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  MoreVertical,
  Pencil,
  Trash2,
  Pause,
  Play,
  Search,
  CalendarDays,
  CreditCard,
  Tag,
} from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useState } from 'react'
import { RecurringForm } from './recurring-form'
import { BrandIcon, matchBrand, getBrand } from '@/lib/brands'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { ApplyButton } from './apply-button'
import { freqLabels } from './recurring-utils'

const PAGE_SIZE = 10

const BANK_SLUGS = [
  'nubank',
  'itau',
  'bradesco',
  'santander',
  'bb',
  'caixa',
  'inter',
  'c6',
  'btg',
  'sofisa',
  'original',
  'pagbank',
]

type Rule = {
  id: string
  accountId: string
  categoryId: string | null
  type: string
  amount: number
  description: string
  notes: string | null
  frequency: string
  dayOfMonth: number | null
  dayOfWeek: number | null
  startDate: string
  endDate: string | null
  isActive: boolean
  nextDateIso: string | null
  account: { name: string; color: string | null; icon: string | null }
  category: { name: string; color: string | null; icon: string | null } | null
  _count: { logs: number }
}

type Account = { id: string; name: string; color: string | null; icon: string | null }
type Category = { id: string; name: string; type: string; color: string | null; icon: string | null }

function normalize(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function ServiceIcon({ description }: { description: string }) {
  const brandKey = matchBrand(description)
  const brand = brandKey ? getBrand(brandKey) : null

  if (brand) {
    return (
      <BrandIcon brandKey={brand.key} fallbackLabel={description} size={36} radius="full" />
    )
  }

  return (
    <div className="bg-muted text-muted-foreground flex size-9 items-center justify-center rounded-full text-sm font-semibold">
      {description[0]?.toUpperCase() ?? '?'}
    </div>
  )
}

function BankIcon({ accountName, accountIcon }: { accountName: string; accountIcon: string | null }) {
  const slug = normalize(accountName)
  const match = BANK_SLUGS.find((b) => slug.includes(b))
  const iconKey = match ?? accountIcon

  if (iconKey) {
    const brand = getBrand(iconKey)
    if (brand) {
      return <BrandIcon brandKey={brand.key} fallbackLabel={accountName} size={28} radius="full" />
    }
  }

  return (
    <div className="bg-muted text-muted-foreground flex size-7 items-center justify-center rounded-full">
      <CreditCard className="size-3.5" />
    </div>
  )
}

export function RecurringList({
  rules,
  accounts,
  categories,
}: {
  rules: Rule[]
  accounts: Account[]
  categories: Category[]
}) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'paused'>('all')
  const [freqFilter, setFreqFilter] = useState<'all' | 'MONTHLY' | 'YEARLY'>('all')
  const [page, setPage] = useState(1)
  const [createOpen, setCreateOpen] = useState(false)

  const filtered = rules
    .filter((r) => !search || r.description.toLowerCase().includes(search.toLowerCase()))
    .filter((r) =>
      statusFilter === 'all' ? true : statusFilter === 'active' ? r.isActive : !r.isActive,
    )
    .filter((r) => (freqFilter === 'all' ? true : r.frequency === freqFilter))

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function setFilter<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v)
      setPage(1)
    }
  }

  return (
    <div className="bg-card border-border/50 rounded-2xl border shadow-sm">
      {/* Barra de filtros */}
      <div className="border-border/50 flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-3 size-3.5 -translate-y-1/2" />
          <Input
            placeholder="Buscar recorrência..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            className="h-8 rounded-full pl-8 text-sm"
          />
        </div>

        <div className="flex items-center gap-1">
          {(['all', 'active', 'paused'] as const).map((s) => (
            <Button
              key={s}
              size="sm"
              variant={statusFilter === s ? 'default' : 'outline'}
              className="h-7 rounded-full px-3 text-xs"
              onClick={() => setFilter(setStatusFilter)(s)}
            >
              {s === 'all' ? 'Todas' : s === 'active' ? 'Ativas' : 'Pausadas'}
            </Button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          {(['MONTHLY', 'YEARLY'] as const).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={freqFilter === f ? 'default' : 'outline'}
              className="h-7 rounded-full px-3 text-xs"
              onClick={() => setFilter(setFreqFilter)(freqFilter === f ? 'all' : f)}
            >
              {f === 'MONTHLY' ? 'Mensais' : 'Anuais'}
            </Button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <ApplyButton />
          <Button
            size="sm"
            className="h-8 rounded-full px-4 text-xs"
            onClick={() => setCreateOpen(true)}
          >
            + Nova recorrência
          </Button>
        </div>
      </div>

      {/* Tabela */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-border/50 border-b">
              <th className="text-muted-foreground px-6 py-3 text-left text-xs font-medium">
                Serviço / Descrição
              </th>
              <th className="text-muted-foreground px-4 py-3 text-left text-xs font-medium">
                Categoria
              </th>
              <th className="text-muted-foreground px-4 py-3 text-left text-xs font-medium">
                Conta / Cartão
              </th>
              <th className="text-muted-foreground px-4 py-3 text-left text-xs font-medium">
                Frequência
              </th>
              <th className="text-muted-foreground px-4 py-3 text-left text-xs font-medium">
                Próxima data
              </th>
              <th className="text-muted-foreground px-4 py-3 text-left text-xs font-medium">
                Status
              </th>
              <th className="text-muted-foreground px-4 py-3 text-right text-xs font-medium">
                Valor
              </th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-border/40 divide-y">
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-muted-foreground px-6 py-12 text-center text-sm">
                  Nenhuma recorrência encontrada
                </td>
              </tr>
            ) : (
              paginated.map((rule) => (
                <RecurringRow
                  key={rule.id}
                  rule={rule}
                  accounts={accounts}
                  categories={categories}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      <div className="border-border/50 flex items-center justify-between border-t px-6 py-3">
        <span className="text-muted-foreground text-xs">
          Exibindo {paginated.length} de {filtered.length} recorrência
          {filtered.length !== 1 ? 's' : ''}
        </span>
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="outline"
              className="size-7 rounded-full p-0"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              ‹
            </Button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <Button
                key={p}
                size="sm"
                variant={page === p ? 'default' : 'outline'}
                className="size-7 rounded-full p-0 text-xs"
                onClick={() => setPage(p)}
              >
                {p}
              </Button>
            ))}
            <Button
              size="sm"
              variant="outline"
              className="size-7 rounded-full p-0"
              disabled={page === totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              ›
            </Button>
          </div>
        )}
      </div>

      <RecurringForm
        open={createOpen}
        onOpenChange={setCreateOpen}
        accounts={accounts}
        categories={categories}
      />
    </div>
  )
}

function RecurringRow({
  rule,
  accounts,
  categories,
}: {
  rule: Rule
  accounts: Account[]
  categories: Category[]
}) {
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)
  const { confirm, ConfirmDialog } = useConfirm()

  async function handleToggle() {
    await fetch(`/api/recurring-rules/${rule.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !rule.isActive }),
    })
    router.refresh()
  }

  async function handleDelete() {
    const ok = await confirm({
      title: `Excluir regra "${rule.description}"?`,
      description: 'A regra recorrente e seu histórico de execuções serão removidos.',
      destructive: true,
    })
    if (!ok) return
    await fetch(`/api/recurring-rules/${rule.id}`, { method: 'DELETE' })
    router.refresh()
  }

  const nextDate = rule.nextDateIso ? new Date(rule.nextDateIso) : null
  const nextDateLabel = nextDate
    ? nextDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '—'

  return (
    <>
      <tr className={cn('transition-colors hover:bg-muted/30', !rule.isActive && 'opacity-60')}>
        {/* Serviço */}
        <td className="px-6 py-3">
          <div className="flex items-center gap-3">
            <ServiceIcon description={rule.description} />
            <div>
              <p className={cn('font-medium', !rule.isActive && 'line-through decoration-muted-foreground/50')}>
                {rule.description}
              </p>
              {rule.notes && (
                <p className="text-muted-foreground text-xs">{rule.notes}</p>
              )}
            </div>
          </div>
        </td>

        {/* Categoria */}
        <td className="px-4 py-3">
          {rule.category ? (
            <Badge variant="outline" className="gap-1 text-xs font-medium">
              <Tag className="size-2.5" />
              {rule.category.name}
            </Badge>
          ) : (
            <span className="text-muted-foreground text-xs">—</span>
          )}
        </td>

        {/* Conta */}
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <BankIcon accountName={rule.account.name} accountIcon={rule.account.icon} />
            <span className="text-sm">{rule.account.name}</span>
          </div>
        </td>

        {/* Frequência */}
        <td className="px-4 py-3">
          <span className="text-sm">{freqLabels[rule.frequency] ?? rule.frequency}</span>
        </td>

        {/* Próxima data */}
        <td className="px-4 py-3">
          <div className="text-muted-foreground flex items-center gap-1.5 text-sm">
            <CalendarDays className="size-3.5 flex-shrink-0" />
            {nextDateLabel}
          </div>
        </td>

        {/* Status */}
        <td className="px-4 py-3">
          {rule.isActive ? (
            <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-xs font-medium">
              Ativa
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-xs font-medium">
              Pausada
            </Badge>
          )}
        </td>

        {/* Valor */}
        <td className="px-4 py-3 text-right">
          <span
            className={cn(
              'font-semibold',
              rule.type === 'INCOME' ? 'text-emerald-600' : 'text-foreground',
            )}
          >
            {formatCurrency(rule.amount)}
          </span>
        </td>

        {/* Ações */}
        <td className="px-4 py-3">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button className="text-muted-foreground hover:bg-muted flex size-8 items-center justify-center rounded-full" />
              }
            >
              <MoreVertical className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setEditOpen(true)}>
                <Pencil className="mr-2 size-3.5" />
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleToggle}>
                {rule.isActive ? (
                  <>
                    <Pause className="mr-2 size-3.5" />
                    Pausar
                  </>
                ) : (
                  <>
                    <Play className="mr-2 size-3.5" />
                    Ativar
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDelete} className="text-destructive">
                <Trash2 className="mr-2 size-3.5" />
                Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </td>
      </tr>

      <RecurringForm
        open={editOpen}
        onOpenChange={setEditOpen}
        rule={rule}
        accounts={accounts}
        categories={categories}
      />
      {ConfirmDialog}
    </>
  )
}

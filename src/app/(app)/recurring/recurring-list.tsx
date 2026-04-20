'use client'

import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreVertical, Pencil, Trash2, Pause, Play, ChevronDown } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useState } from 'react'
import { RecurringForm } from './recurring-form'
import { BrandDot, BrandIcon, getBrand, matchBrand } from '@/lib/brands'
import { useConfirm } from '@/components/ui/confirm-dialog'

const INITIAL_VISIBLE = 10
const PAGE_SIZE = 10

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
  startDate: string | Date
  endDate: string | Date | null
  isActive: boolean
  account: { name: string; color: string | null; icon: string | null }
  category: { name: string; color: string | null; icon: string | null } | null
  _count: { logs: number }
}

type Account = { id: string; name: string }
type Category = { id: string; name: string; type: string }

const freqLabels: Record<string, string> = {
  DAILY: 'Diaria',
  WEEKLY: 'Semanal',
  MONTHLY: 'Mensal',
  YEARLY: 'Anual',
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
  const [visible, setVisible] = useState(INITIAL_VISIBLE)
  const visibleRules = rules.slice(0, visible)
  const remaining = rules.length - visibleRules.length

  return (
    <div className="fc-panel">
      <div className="divide-border/60 divide-y">
        {visibleRules.map((rule) => (
          <RecurringRow key={rule.id} rule={rule} accounts={accounts} categories={categories} />
        ))}
      </div>
      {remaining > 0 && (
        <div className="border-border/60 flex justify-center border-t p-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setVisible((current) => current + PAGE_SIZE)}
          >
            <ChevronDown className="mr-1.5 size-4" />
            Carregar mais ({remaining} restantes)
          </Button>
        </div>
      )}
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
  const inferredBrandKey = matchBrand(rule.description) ?? rule.category?.icon ?? rule.account.icon
  const inferredBrand = getBrand(inferredBrandKey)

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
      description: 'A regra recorrente e seu historico de execucoes serao removidos.',
      destructive: true,
    })
    if (!ok) return
    await fetch(`/api/recurring-rules/${rule.id}`, { method: 'DELETE' })
    router.refresh()
  }

  return (
    <>
      <div
        className={cn(
          'flex items-center justify-between px-6 py-4 transition-colors',
          !rule.isActive && 'bg-amber-50/60 dark:bg-amber-950/20',
        )}
      >
        <div className="flex items-center gap-4">
          {inferredBrand ? (
            <BrandIcon
              brandKey={inferredBrand.key}
              fallbackLabel={rule.description}
              size={40}
              radius="md"
            />
          ) : (
            <div
              className={cn(
                'flex size-10 items-center justify-center rounded-xl',
                rule.type === 'INCOME' ? 'bg-emerald-100' : 'bg-red-100',
              )}
            >
              <span
                className={cn(
                  'text-xs font-bold',
                  rule.type === 'INCOME' ? 'text-emerald-600' : 'text-red-600',
                )}
              >
                {rule.type === 'INCOME' ? '+' : '-'}
              </span>
            </div>
          )}
          <div>
            <p
              className={cn(
                'text-foreground text-sm font-medium',
                !rule.isActive && 'text-muted-foreground line-through decoration-amber-500/60',
              )}
            >
              {rule.description}
            </p>
            <div className="text-muted-foreground mt-0.5 flex items-center gap-2 text-xs">
              <div className="flex items-center gap-1">
                <BrandDot
                  brandKey={rule.account.icon}
                  fallbackText={rule.account.name}
                  fallbackColor={rule.account.color}
                  fallbackLabel={rule.account.name}
                  size={10}
                />
                <span>{rule.account.name}</span>
              </div>
              {rule.category && (
                <>
                  <span>&middot;</span>
                  <div className="flex items-center gap-1">
                    <BrandDot
                      brandKey={rule.category.icon}
                      fallbackText={rule.category.name}
                      fallbackColor={rule.category.color}
                      fallbackLabel={rule.category.name}
                      size={10}
                    />
                    <span>{rule.category.name}</span>
                  </div>
                </>
              )}
              <span>&middot;</span>
              <Badge variant="secondary" className="text-[10px]">
                {freqLabels[rule.frequency] ?? rule.frequency}
              </Badge>
              {!rule.isActive && (
                <Badge
                  variant="secondary"
                  className="gap-1 border border-amber-300 bg-amber-100 text-[10px] font-semibold text-amber-800 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-200"
                >
                  <Pause className="size-2.5" />
                  Pausada
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span
            className={cn(
              'text-sm font-semibold',
              rule.type === 'INCOME' ? 'text-emerald-600' : 'text-red-600',
              !rule.isActive && 'opacity-60',
            )}
          >
            {formatCurrency(rule.amount)}
          </span>
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
        </div>
      </div>
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

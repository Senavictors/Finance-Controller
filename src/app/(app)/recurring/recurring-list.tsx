'use client'

import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreVertical, Pencil, Trash2, Pause, Play } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useState } from 'react'
import { RecurringForm } from './recurring-form'

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
  account: { name: string; color: string | null }
  category: { name: string; color: string | null } | null
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
  return (
    <div className="rounded-[2rem] border border-white/50 bg-gradient-to-br from-white to-gray-50 shadow-sm">
      <div className="divide-y divide-gray-100">
        {rules.map((rule) => (
          <RecurringRow key={rule.id} rule={rule} accounts={accounts} categories={categories} />
        ))}
      </div>
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

  async function handleToggle() {
    await fetch(`/api/recurring-rules/${rule.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !rule.isActive }),
    })
    router.refresh()
  }

  async function handleDelete() {
    if (!confirm(`Excluir regra "${rule.description}"?`)) return
    await fetch(`/api/recurring-rules/${rule.id}`, { method: 'DELETE' })
    router.refresh()
  }

  return (
    <>
      <div
        className={cn(
          'flex items-center justify-between px-6 py-4',
          !rule.isActive && 'opacity-50',
        )}
      >
        <div className="flex items-center gap-4">
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
          <div>
            <p className="text-sm font-medium text-gray-900">{rule.description}</p>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-400">
              <span>{rule.account.name}</span>
              {rule.category && (
                <>
                  <span>&middot;</span>
                  <span>{rule.category.name}</span>
                </>
              )}
              <span>&middot;</span>
              <Badge variant="secondary" className="text-[10px]">
                {freqLabels[rule.frequency] ?? rule.frequency}
              </Badge>
              {!rule.isActive && (
                <Badge variant="secondary" className="text-muted-foreground text-[10px]">
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
            )}
          >
            {formatCurrency(rule.amount)}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button className="flex size-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100" />
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
    </>
  )
}

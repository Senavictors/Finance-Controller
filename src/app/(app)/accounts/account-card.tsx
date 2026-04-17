'use client'

import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreVertical, Pencil, Trash2 } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import { useState } from 'react'
import { AccountForm } from './account-form'

type Account = {
  id: string
  name: string
  type: string
  initialBalance: number
  creditLimit: number | null
  statementClosingDay: number | null
  statementDueDay: number | null
  color: string | null
  icon: string | null
  isArchived: boolean
}

const typeLabels: Record<string, string> = {
  WALLET: 'Carteira',
  CHECKING: 'Corrente',
  SAVINGS: 'Poupanca',
  CREDIT_CARD: 'Cartao',
  INVESTMENT: 'Investimento',
  OTHER: 'Outro',
}

export function AccountCard({ account }: { account: Account }) {
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)

  async function handleDelete() {
    if (!confirm('Excluir esta conta? As transacoes vinculadas tambem serao removidas.')) return
    await fetch(`/api/accounts/${account.id}`, { method: 'DELETE' })
    router.refresh()
  }

  return (
    <>
      <div className="group relative overflow-hidden rounded-[1.5rem] border border-white/50 bg-gradient-to-b from-white to-gray-50 p-6 shadow-sm transition-all hover:shadow-md">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div
              className="flex size-10 items-center justify-center rounded-xl"
              style={{ backgroundColor: `${account.color ?? '#3b82f6'}20` }}
            >
              <div
                className="size-3 rounded-full"
                style={{ backgroundColor: account.color ?? '#3b82f6' }}
              />
            </div>
            <div>
              <h3 className="text-sm font-semibold tracking-tight text-gray-900">{account.name}</h3>
              <Badge variant="secondary" className="mt-1 text-[11px]">
                {typeLabels[account.type] ?? account.type}
              </Badge>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button className="flex size-8 items-center justify-center rounded-full text-gray-400 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-gray-100" />
              }
            >
              <MoreVertical className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setEditOpen(true)}>
                <Pencil className="mr-2 size-3.5" />
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDelete} className="text-destructive">
                <Trash2 className="mr-2 size-3.5" />
                Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="mt-6">
          {account.type === 'CREDIT_CARD' ? (
            <>
              <p className="text-xs text-gray-400">Limite do cartao</p>
              <p className="mt-0.5 text-xl font-semibold tracking-tight text-gray-900">
                {account.creditLimit ? formatCurrency(account.creditLimit) : 'Nao configurado'}
              </p>
              <p className="mt-2 text-xs text-gray-500">
                Fechamento dia {account.statementClosingDay ?? '-'} • Vencimento dia{' '}
                {account.statementDueDay ?? '-'}
              </p>
            </>
          ) : (
            <>
              <p className="text-xs text-gray-400">Saldo inicial</p>
              <p className="mt-0.5 text-xl font-semibold tracking-tight text-gray-900">
                {formatCurrency(account.initialBalance)}
              </p>
            </>
          )}
        </div>
      </div>
      <AccountForm open={editOpen} onOpenChange={setEditOpen} account={account} />
    </>
  )
}

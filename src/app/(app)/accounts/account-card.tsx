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
import { BrandIcon } from '@/lib/brands'
import { useConfirm } from '@/components/ui/confirm-dialog'

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
  const { confirm, ConfirmDialog } = useConfirm()

  async function handleDelete() {
    const ok = await confirm({
      title: `Excluir conta "${account.name}"?`,
      description: 'Todas as transacoes vinculadas a esta conta serao removidas.',
      destructive: true,
    })
    if (!ok) return
    await fetch(`/api/accounts/${account.id}`, { method: 'DELETE' })
    router.refresh()
  }

  return (
    <>
      <div className="group border-border/60 from-card via-card to-muted/40 relative overflow-hidden rounded-[1.5rem] border bg-gradient-to-b p-6 shadow-sm transition-all hover:shadow-md">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <BrandIcon
              brandKey={account.icon}
              fallbackLabel={account.name}
              fallbackText={account.name}
              fallbackColor={account.color}
              size={40}
              radius="md"
            />
            <div>
              <h3 className="text-foreground text-sm font-semibold tracking-tight">
                {account.name}
              </h3>
              <Badge variant="secondary" className="mt-1 text-[11px]">
                {typeLabels[account.type] ?? account.type}
              </Badge>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button className="text-muted-foreground hover:bg-muted flex size-8 items-center justify-center rounded-full opacity-0 transition-opacity group-hover:opacity-100" />
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
              <p className="text-muted-foreground text-xs">Limite do cartao</p>
              <p className="text-foreground mt-0.5 text-xl font-semibold tracking-tight">
                {account.creditLimit ? formatCurrency(account.creditLimit) : 'Nao configurado'}
              </p>
              <p className="text-muted-foreground mt-2 text-xs">
                Fechamento dia {account.statementClosingDay ?? '-'} • Vencimento dia{' '}
                {account.statementDueDay ?? '-'}
              </p>
            </>
          ) : (
            <>
              <p className="text-muted-foreground text-xs">Saldo inicial</p>
              <p className="text-foreground mt-0.5 text-xl font-semibold tracking-tight">
                {formatCurrency(account.initialBalance)}
              </p>
            </>
          )}
        </div>
      </div>
      <AccountForm open={editOpen} onOpenChange={setEditOpen} account={account} />
      {ConfirmDialog}
    </>
  )
}

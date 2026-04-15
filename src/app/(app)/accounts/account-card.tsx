'use client'

import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {account.color && (
                <span className="size-3 rounded-full" style={{ backgroundColor: account.color }} />
              )}
              <CardTitle>{account.name}</CardTitle>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger>
                <Button variant="ghost" size="icon-xs">
                  <MoreVertical className="size-4" />
                </Button>
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
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <Badge variant="secondary">{typeLabels[account.type] ?? account.type}</Badge>
            <span className="text-lg font-semibold">{formatCurrency(account.initialBalance)}</span>
          </div>
        </CardContent>
      </Card>
      <AccountForm open={editOpen} onOpenChange={setEditOpen} account={account} />
    </>
  )
}

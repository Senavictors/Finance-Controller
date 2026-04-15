'use client'

import { useRouter } from 'next/navigation'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreVertical, Trash2 } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'

type Transaction = {
  id: string
  type: string
  amount: number
  description: string
  date: string | Date
  transferId: string | null
  account: { name: string; color: string | null }
  category: { name: string; color: string | null } | null
}

export function TransactionTable({ transactions }: { transactions: Transaction[] }) {
  const router = useRouter()

  async function handleDelete(id: string, hasTransfer: boolean) {
    const msg = hasTransfer
      ? 'Excluir esta transferencia? Ambas transacoes serao removidas.'
      : 'Excluir esta transacao?'
    if (!confirm(msg)) return
    await fetch(`/api/transactions/${id}`, { method: 'DELETE' })
    router.refresh()
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Data</TableHead>
          <TableHead>Descricao</TableHead>
          <TableHead>Categoria</TableHead>
          <TableHead>Conta</TableHead>
          <TableHead className="text-right">Valor</TableHead>
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {transactions.map((tx) => (
          <TableRow key={tx.id}>
            <TableCell className="text-muted-foreground">{formatDate(tx.date)}</TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                {tx.description}
                {tx.transferId && (
                  <Badge variant="secondary" className="text-xs">
                    Transfer
                  </Badge>
                )}
              </div>
            </TableCell>
            <TableCell>
              {tx.category ? (
                <div className="flex items-center gap-1.5">
                  {tx.category.color && (
                    <span
                      className="size-2.5 rounded-full"
                      style={{ backgroundColor: tx.category.color }}
                    />
                  )}
                  <span className="text-sm">{tx.category.name}</span>
                </div>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-1.5">
                {tx.account.color && (
                  <span
                    className="size-2.5 rounded-full"
                    style={{ backgroundColor: tx.account.color }}
                  />
                )}
                <span className="text-sm">{tx.account.name}</span>
              </div>
            </TableCell>
            <TableCell
              className={cn(
                'text-right font-medium',
                tx.type === 'INCOME' && 'text-success',
                tx.type === 'EXPENSE' && 'text-destructive',
                tx.type === 'TRANSFER' && 'text-muted-foreground',
              )}
            >
              {tx.type === 'EXPENSE' ? '- ' : tx.type === 'INCOME' ? '+ ' : ''}
              {formatCurrency(tx.amount)}
            </TableCell>
            <TableCell>
              <DropdownMenu>
                <DropdownMenuTrigger>
                  <Button variant="ghost" size="icon-xs">
                    <MoreVertical className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => handleDelete(tx.id, !!tx.transferId)}
                    className="text-destructive"
                  >
                    <Trash2 className="mr-2 size-3.5" />
                    Excluir
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

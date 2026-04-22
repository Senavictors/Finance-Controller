'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreVertical, Trash2, TrendingUp, TrendingDown, ArrowLeftRight } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { BrandDot, BrandIcon, getBrand, matchBrand } from '@/lib/brands'
import { useConfirm } from '@/components/ui/confirm-dialog'

type Transaction = {
  id: string
  type: string
  amount: number
  description: string
  date: string | Date
  transferId: string | null
  account: { name: string; color: string | null; icon: string | null }
  category: { name: string; color: string | null; icon: string | null } | null
  creditCardStatement?: { id: string; dueDate: string | Date } | null
}

export function TransactionTable({ transactions }: { transactions: Transaction[] }) {
  const router = useRouter()
  const { confirm, ConfirmDialog } = useConfirm()

  async function handleDelete(id: string, hasTransfer: boolean) {
    const ok = await confirm({
      title: hasTransfer ? 'Excluir transferência?' : 'Excluir transação?',
      description: hasTransfer
        ? 'As duas transações da transferência serão removidas permanentemente.'
        : 'A transação será removida permanentemente.',
      destructive: true,
    })
    if (!ok) return
    await fetch(`/api/transactions/${id}`, { method: 'DELETE' })
    router.refresh()
  }

  return (
    <div className="divide-border/60 divide-y">
      {transactions.map((tx) => {
        const inferredBrandKey = matchBrand(tx.description) ?? tx.category?.icon ?? tx.account.icon
        const inferredBrand = getBrand(inferredBrandKey)
        return (
          <div key={tx.id} className="hover:bg-muted/40 px-4 py-4 transition-colors sm:px-6">
            <div className="flex items-start gap-3 sm:items-center sm:gap-4">
              {inferredBrand ? (
                <BrandIcon
                  brandKey={inferredBrand.key}
                  fallbackLabel={tx.description}
                  size={40}
                  radius="md"
                />
              ) : (
                <div
                  className={cn(
                    'flex size-10 items-center justify-center rounded-xl',
                    tx.type === 'INCOME' && 'bg-emerald-100',
                    tx.type === 'EXPENSE' && 'bg-red-100',
                    tx.type === 'TRANSFER' && 'bg-muted',
                  )}
                >
                  {tx.type === 'INCOME' ? (
                    <TrendingUp className="size-4 text-emerald-600" />
                  ) : tx.type === 'EXPENSE' ? (
                    <TrendingDown className="size-4 text-red-600" />
                  ) : (
                    <ArrowLeftRight className="text-muted-foreground size-4" />
                  )}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="space-y-2">
                  <p className="text-foreground text-sm font-medium break-words">
                    {tx.description}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    {tx.transferId && (
                      <Badge variant="secondary" className="text-[10px]">
                        Transfer
                      </Badge>
                    )}
                    {tx.creditCardStatement && (
                      <Link href={`/credit-cards/${tx.creditCardStatement.id}`}>
                        <Badge variant="outline" className="max-w-full text-[10px]">
                          Fatura {formatDate(tx.creditCardStatement.dueDate)}
                        </Badge>
                      </Link>
                    )}
                  </div>
                </div>

                <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                  <span className="shrink-0">{formatDate(tx.date)}</span>
                  <div className="flex items-center gap-1">
                    <BrandDot
                      brandKey={tx.account.icon}
                      fallbackText={tx.account.name}
                      fallbackColor={tx.account.color}
                      fallbackLabel={tx.account.name}
                      size={10}
                    />
                    <span className="break-words">{tx.account.name}</span>
                  </div>
                  {tx.category && (
                    <div className="flex items-center gap-1">
                      <BrandDot
                        brandKey={tx.category.icon}
                        fallbackText={tx.category.name}
                        fallbackColor={tx.category.color}
                        fallbackLabel={tx.category.name}
                        size={10}
                      />
                      <span className="break-words">{tx.category.name}</span>
                    </div>
                  )}
                </div>

                <div className="mt-3 flex items-center justify-between gap-3 sm:hidden">
                  <span
                    className={cn(
                      'shrink-0 text-sm font-semibold',
                      tx.type === 'INCOME' && 'text-emerald-600',
                      tx.type === 'EXPENSE' && 'text-red-600',
                      tx.type === 'TRANSFER' && 'text-muted-foreground',
                    )}
                  >
                    {tx.type === 'EXPENSE' ? '- ' : tx.type === 'INCOME' ? '+ ' : ''}
                    {formatCurrency(tx.amount)}
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <button className="text-muted-foreground hover:bg-muted flex size-8 shrink-0 items-center justify-center rounded-full" />
                      }
                    >
                      <MoreVertical className="size-4" />
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
                </div>
              </div>

              <div className="hidden shrink-0 items-center gap-3 sm:flex">
                <span
                  className={cn(
                    'text-right text-sm font-semibold',
                    tx.type === 'INCOME' && 'text-emerald-600',
                    tx.type === 'EXPENSE' && 'text-red-600',
                    tx.type === 'TRANSFER' && 'text-muted-foreground',
                  )}
                >
                  {tx.type === 'EXPENSE' ? '- ' : tx.type === 'INCOME' ? '+ ' : ''}
                  {formatCurrency(tx.amount)}
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
                    <DropdownMenuItem
                      onClick={() => handleDelete(tx.id, !!tx.transferId)}
                      className="text-destructive"
                    >
                      <Trash2 className="mr-2 size-3.5" />
                      Excluir
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        )
      })}
      {ConfirmDialog}
    </div>
  )
}

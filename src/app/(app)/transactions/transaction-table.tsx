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

  async function handleDelete(id: string, hasTransfer: boolean) {
    const msg = hasTransfer
      ? 'Excluir esta transferencia? Ambas transacoes serao removidas.'
      : 'Excluir esta transacao?'
    if (!confirm(msg)) return
    await fetch(`/api/transactions/${id}`, { method: 'DELETE' })
    router.refresh()
  }

  return (
    <div className="divide-y divide-gray-100">
      {transactions.map((tx) => {
        const inferredBrandKey = matchBrand(tx.description) ?? tx.category?.icon ?? tx.account.icon
        const inferredBrand = getBrand(inferredBrandKey)
        return (
          <div
            key={tx.id}
            className="flex items-center justify-between px-6 py-4 transition-colors hover:bg-gray-50/50"
          >
            <div className="flex items-center gap-4">
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
                    tx.type === 'TRANSFER' && 'bg-gray-100',
                  )}
                >
                  {tx.type === 'INCOME' ? (
                    <TrendingUp className="size-4 text-emerald-600" />
                  ) : tx.type === 'EXPENSE' ? (
                    <TrendingDown className="size-4 text-red-600" />
                  ) : (
                    <ArrowLeftRight className="size-4 text-gray-500" />
                  )}
                </div>
              )}
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-gray-900">{tx.description}</p>
                  {tx.transferId && (
                    <Badge variant="secondary" className="text-[10px]">
                      Transfer
                    </Badge>
                  )}
                  {tx.creditCardStatement && (
                    <Link href={`/credit-cards/${tx.creditCardStatement.id}`}>
                      <Badge variant="outline" className="text-[10px]">
                        Fatura {formatDate(tx.creditCardStatement.dueDate)}
                      </Badge>
                    </Link>
                  )}
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-400">
                  <span>{formatDate(tx.date)}</span>
                  <span>&middot;</span>
                  <div className="flex items-center gap-1">
                    <BrandDot
                      brandKey={tx.account.icon}
                      fallbackText={tx.account.name}
                      fallbackColor={tx.account.color}
                      fallbackLabel={tx.account.name}
                      size={10}
                    />
                    <span>{tx.account.name}</span>
                  </div>
                  {tx.category && (
                    <>
                      <span>&middot;</span>
                      <div className="flex items-center gap-1">
                        <BrandDot
                          brandKey={tx.category.icon}
                          fallbackText={tx.category.name}
                          fallbackColor={tx.category.color}
                          fallbackLabel={tx.category.name}
                          size={10}
                        />
                        <span>{tx.category.name}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span
                className={cn(
                  'text-sm font-semibold',
                  tx.type === 'INCOME' && 'text-emerald-600',
                  tx.type === 'EXPENSE' && 'text-red-600',
                  tx.type === 'TRANSFER' && 'text-gray-500',
                )}
              >
                {tx.type === 'EXPENSE' ? '- ' : tx.type === 'INCOME' ? '+ ' : ''}
                {formatCurrency(tx.amount)}
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
        )
      })}
    </div>
  )
}

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
import { MoreVertical, Trash2, TrendingUp, TrendingDown, ArrowLeftRight, Pencil } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { BrandDot, BrandIcon, getBrand, matchBrand } from '@/lib/brands'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { TransactionForm, type EditTransaction } from './transaction-form'
import { useState } from 'react'

type Transaction = {
  id: string
  type: string
  amount: number
  description: string
  date: string | Date
  notes: string | null
  accountId: string
  categoryId: string | null
  transferId: string | null
  account: { name: string; color: string | null; icon: string | null }
  category: { name: string; color: string | null; icon: string | null } | null
  creditCardStatement?: { id: string; dueDate: string | Date } | null
  creditCardPurchaseInstallment?: {
    id: string
    installmentNumber: number
    advanceId: string | null
    purchase: { id: string; installmentCount: number }
  } | null
}

type Account = { id: string; name: string; type: string; color: string | null; icon: string | null }
type Category = { id: string; name: string; type: string; color: string | null; icon: string | null }

export function TransactionTable({
  transactions,
  accounts,
  categories,
}: {
  transactions: Transaction[]
  accounts: Account[]
  categories: Category[]
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-border/50 border-b">
            <th className="text-muted-foreground hidden px-6 py-3 text-left text-xs font-medium sm:table-cell">
              Data
            </th>
            <th className="text-muted-foreground px-6 py-3 text-left text-xs font-medium sm:px-4">
              Descrição
            </th>
            <th className="text-muted-foreground hidden px-4 py-3 text-left text-xs font-medium md:table-cell">
              Categoria
            </th>
            <th className="text-muted-foreground hidden px-4 py-3 text-left text-xs font-medium md:table-cell">
              Conta
            </th>
            <th className="text-muted-foreground px-4 py-3 text-right text-xs font-medium">
              Valor
            </th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-border/40 divide-y">
          {transactions.map((tx) => (
            <TransactionRow
              key={tx.id}
              tx={tx}
              accounts={accounts}
              categories={categories}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TransactionRow({
  tx,
  accounts,
  categories,
}: {
  tx: Transaction
  accounts: Account[]
  categories: Category[]
}) {
  const router = useRouter()
  const { confirm, ConfirmDialog } = useConfirm()
  const [editOpen, setEditOpen] = useState(false)

  const canEdit = !tx.transferId && !tx.creditCardPurchaseInstallment

  const inferredBrandKey = matchBrand(tx.description) ?? tx.category?.icon ?? tx.account.icon
  const inferredBrand = getBrand(inferredBrandKey)

  const date = new Date(tx.date)
  const dateLabel = date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
  const weekdayLabel = date.toLocaleDateString('pt-BR', { weekday: 'short' })

  async function handleDelete() {
    const isInstallmentPurchase = (tx.creditCardPurchaseInstallment?.purchase.installmentCount ?? 0) > 0
    const ok = await confirm({
      title: tx.transferId
        ? 'Excluir transferência?'
        : isInstallmentPurchase
          ? 'Excluir compra parcelada?'
          : 'Excluir transação?',
      description: tx.transferId
        ? 'As duas transações da transferência serão removidas permanentemente.'
        : isInstallmentPurchase
          ? `Todas as ${tx.creditCardPurchaseInstallment!.purchase.installmentCount} parcelas e seus vínculos com faturas serão removidos permanentemente.`
          : 'A transação será removida permanentemente.',
      destructive: true,
    })
    if (!ok) return
    await fetch(`/api/transactions/${tx.id}`, { method: 'DELETE' })
    router.refresh()
  }

  const editTransaction: EditTransaction = {
    id: tx.id,
    type: tx.type,
    amount: tx.amount,
    description: tx.description,
    date: new Date(tx.date).toISOString().split('T')[0],
    notes: tx.notes,
    accountId: tx.accountId,
    categoryId: tx.categoryId,
    transferId: tx.transferId,
    creditCardPurchaseInstallment: tx.creditCardPurchaseInstallment
      ? { id: tx.creditCardPurchaseInstallment.id }
      : null,
  }

  return (
    <>
      <tr className="hover:bg-muted/30 transition-colors">
        {/* Data */}
        <td className="hidden px-6 py-3 sm:table-cell">
          <div className="flex flex-col">
            <span className="text-foreground text-sm font-medium">{dateLabel}</span>
            <span className="text-muted-foreground text-xs capitalize">{weekdayLabel}</span>
          </div>
        </td>

        {/* Descrição */}
        <td className="px-6 py-3 sm:px-4">
          <div className="flex items-center gap-3">
            {inferredBrand ? (
              <BrandIcon
                brandKey={inferredBrand.key}
                fallbackLabel={tx.description}
                size={36}
                radius="full"
              />
            ) : (
              <div
                className={cn(
                  'flex size-9 flex-shrink-0 items-center justify-center rounded-full',
                  tx.type === 'INCOME' && 'bg-emerald-100 dark:bg-emerald-950',
                  tx.type === 'EXPENSE' && 'bg-red-100 dark:bg-red-950',
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
            <div className="min-w-0">
              <p className="text-foreground truncate text-sm font-medium">{tx.description}</p>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                {/* Data em mobile */}
                <span className="text-muted-foreground text-xs sm:hidden">{formatDate(tx.date)}</span>
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
                {tx.creditCardPurchaseInstallment && (
                  <Link href={`/credit-card-purchases/${tx.creditCardPurchaseInstallment.purchase.id}`}>
                    <Badge variant="secondary" className="text-[10px]">
                      {tx.creditCardPurchaseInstallment.installmentNumber}/
                      {tx.creditCardPurchaseInstallment.purchase.installmentCount}
                    </Badge>
                  </Link>
                )}
                {tx.creditCardPurchaseInstallment?.advanceId && (
                  <Badge variant="outline" className="text-[10px]">
                    Adiantada
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </td>

        {/* Categoria */}
        <td className="hidden px-4 py-3 md:table-cell">
          {tx.category ? (
            <div className="flex items-center gap-1.5">
              <BrandDot
                brandKey={tx.category.icon}
                fallbackText={tx.category.name}
                fallbackColor={tx.category.color}
                fallbackLabel={tx.category.name}
                size={10}
              />
              <span className="text-sm">{tx.category.name}</span>
            </div>
          ) : (
            <span className="text-muted-foreground text-sm">—</span>
          )}
        </td>

        {/* Conta */}
        <td className="hidden px-4 py-3 md:table-cell">
          <div className="flex items-center gap-1.5">
            <BrandDot
              brandKey={tx.account.icon}
              fallbackText={tx.account.name}
              fallbackColor={tx.account.color}
              fallbackLabel={tx.account.name}
              size={10}
            />
            <span className="text-sm">{tx.account.name}</span>
          </div>
        </td>

        {/* Valor */}
        <td className="px-4 py-3 text-right">
          <span
            className={cn(
              'text-sm font-semibold',
              tx.type === 'INCOME' && 'text-emerald-600 dark:text-emerald-400',
              tx.type === 'EXPENSE' && 'text-rose-600 dark:text-rose-400',
              tx.type === 'TRANSFER' && 'text-muted-foreground',
            )}
          >
            {tx.type === 'EXPENSE' ? '- ' : tx.type === 'INCOME' ? '+ ' : ''}
            {formatCurrency(tx.amount)}
          </span>
        </td>

        {/* Ações */}
        <td className="px-4 py-3">
          <div className="flex items-center justify-end gap-1">
            {canEdit && (
              <button
                onClick={() => setEditOpen(true)}
                className="text-muted-foreground hover:bg-muted flex size-8 items-center justify-center rounded-full transition-colors"
              >
                <Pencil className="size-3.5" />
              </button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button className="text-muted-foreground hover:bg-muted flex size-8 items-center justify-center rounded-full transition-colors" />
                }
              >
                <MoreVertical className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {canEdit && (
                  <DropdownMenuItem onClick={() => setEditOpen(true)}>
                    <Pencil className="mr-2 size-3.5" />
                    Editar
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={handleDelete} className="text-destructive">
                  <Trash2 className="mr-2 size-3.5" />
                  Excluir
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </td>
      </tr>

      {canEdit && (
        <TransactionForm
          transaction={editTransaction}
          open={editOpen}
          onOpenChange={setEditOpen}
          accounts={accounts}
          categories={categories}
        />
      )}
      {ConfirmDialog}
    </>
  )
}

'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarDays, ExternalLink, Pencil, Receipt, ShoppingCart, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import { formatCurrency, formatDate } from '@/lib/format'
import { WishlistForm } from './wishlist-form'
import { WishlistPurchaseDialog } from './wishlist-purchase-dialog'

type WishlistCategory = {
  id: string
  name: string
}

type Account = {
  id: string
  name: string
  type: string
  color?: string | null
  icon?: string | null
}

type ExpenseCategory = {
  id: string
  name: string
  color?: string | null
  icon?: string | null
}

type WishlistItem = {
  id: string
  name: string
  categoryId: string | null
  desiredPrice: number
  paidPrice: number | null
  productUrl: string | null
  priority: 'LOW' | 'MEDIUM' | 'HIGH'
  status: 'DESIRED' | 'MONITORING' | 'READY_TO_BUY' | 'PURCHASED' | 'CANCELED'
  desiredPurchaseDate: Date | string | null
  purchasedAt: Date | string | null
  purchaseTransactionId: string | null
  creditCardPurchase: {
    id: string
    installmentCount: number
  } | null
  category: WishlistCategory | null
  purchaseTransaction: {
    id: string
    accountId: string
    date: Date | string
    amount: number
    description: string
  } | null
}

type Props = {
  item: WishlistItem
  categories: WishlistCategory[]
  accounts: Account[]
  expenseCategories: ExpenseCategory[]
}

const statusLabels: Record<WishlistItem['status'], string> = {
  DESIRED: 'Desejado',
  MONITORING: 'Monitorando',
  READY_TO_BUY: 'Pronto para comprar',
  PURCHASED: 'Comprado',
  CANCELED: 'Cancelado',
}

const statusClasses: Record<WishlistItem['status'], string> = {
  DESIRED: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  MONITORING: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  READY_TO_BUY: 'bg-teal-500/10 text-teal-700 dark:text-teal-300',
  PURCHASED: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  CANCELED: 'bg-zinc-500/10 text-zinc-700 dark:text-zinc-300',
}

const priorityLabels: Record<WishlistItem['priority'], string> = {
  HIGH: 'Alta',
  MEDIUM: 'Media',
  LOW: 'Baixa',
}

const priorityClasses: Record<WishlistItem['priority'], string> = {
  HIGH: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
  MEDIUM: 'bg-violet-500/10 text-violet-700 dark:text-violet-300',
  LOW: 'bg-slate-500/10 text-slate-700 dark:text-slate-300',
}

function monthKeyFromDate(date: Date | string) {
  const parsed = new Date(date)
  const month = String(parsed.getMonth() + 1).padStart(2, '0')
  return `${parsed.getFullYear()}-${month}`
}

export function WishlistCard({ item, categories, accounts, expenseCategories }: Props) {
  const router = useRouter()
  const { confirm, ConfirmDialog } = useConfirm()
  const [deleting, setDeleting] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [purchaseOpen, setPurchaseOpen] = useState(false)

  const canPurchase = item.status !== 'PURCHASED' && item.status !== 'CANCELED'
  const canEdit = item.status !== 'PURCHASED'

  async function handleDelete() {
    const ok = await confirm({
      title: `Excluir "${item.name}"?`,
      description:
        item.purchaseTransactionId || item.creditCardPurchase
          ? 'O item será removido da wishlist, mas a compra financeira já registrada continuará existindo.'
          : 'O item sera removido da sua wishlist.',
      confirmText: 'Excluir',
      destructive: true,
    })

    if (!ok) return

    setDeleting(true)
    try {
      const res = await fetch(`/api/wishlist/items/${item.id}`, { method: 'DELETE' })
      if (!res.ok) return
      router.refresh()
    } finally {
      setDeleting(false)
    }
  }

  const transactionHref =
    item.purchaseTransaction && item.purchasedAt
      ? `/transactions?month=${monthKeyFromDate(item.purchasedAt)}&q=${encodeURIComponent(item.name)}`
      : null
  const creditCardPurchaseHref = item.creditCardPurchase
    ? `/credit-card-purchases/${item.creditCardPurchase.id}`
    : null

  return (
    <Card className="fc-panel-strong rounded-[1.75rem]">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate text-base">{item.name}</CardTitle>
            <p className="text-muted-foreground mt-1 text-xs">
              {item.category?.name ?? 'Sem categoria'}
            </p>
          </div>

          <div className="flex items-center gap-1">
            {canEdit && (
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={() => setEditOpen(true)}
              >
                <Pencil className="size-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-destructive size-8"
              disabled={deleting}
              onClick={handleDelete}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-2">
          <Badge variant="outline" className={cn('border-transparent', statusClasses[item.status])}>
            {statusLabels[item.status]}
          </Badge>
          <Badge
            variant="outline"
            className={cn('border-transparent', priorityClasses[item.priority])}
          >
            Prioridade {priorityLabels[item.priority]}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="bg-background/70 rounded-2xl border p-3">
            <p className="text-muted-foreground text-xs">Preço desejado</p>
            <p className="mt-1 text-lg font-semibold">{formatCurrency(item.desiredPrice)}</p>
          </div>

          <div className="bg-background/70 rounded-2xl border p-3">
            <p className="text-muted-foreground text-xs">Preço pago</p>
            <p className="mt-1 text-lg font-semibold">
              {item.paidPrice != null ? formatCurrency(item.paidPrice) : 'Ainda não comprado'}
            </p>
          </div>
        </div>

        <div className="space-y-2 text-sm">
          <div className="text-muted-foreground flex items-center gap-2">
            <CalendarDays className="size-4" />
            <span>
              Data desejada:{' '}
              <span className="text-foreground">
                {item.desiredPurchaseDate ? formatDate(item.desiredPurchaseDate) : 'Nao definida'}
              </span>
            </span>
          </div>

          <div className="text-muted-foreground flex items-center gap-2">
            <Receipt className="size-4" />
            <span>
              Compra efetiva:{' '}
              <span className="text-foreground">
                {item.purchasedAt ? formatDate(item.purchasedAt) : 'Pendente'}
              </span>
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {item.productUrl && (
            <Button
              nativeButton={false}
              variant="outline"
              size="sm"
              render={<a href={item.productUrl} target="_blank" rel="noreferrer" />}
            >
              <ExternalLink className="mr-1.5 size-4" />
              Abrir produto
            </Button>
          )}

          {transactionHref && (
            <Button
              nativeButton={false}
              variant="outline"
              size="sm"
              render={<Link href={transactionHref} />}
            >
              <Receipt className="mr-1.5 size-4" />
              Ver transação
            </Button>
          )}

          {creditCardPurchaseHref && (
            <Button
              nativeButton={false}
              variant="outline"
              size="sm"
              render={<Link href={creditCardPurchaseHref} />}
            >
              <Receipt className="mr-1.5 size-4" />
              Ver compra parcelada
            </Button>
          )}

          {canPurchase && (
            <Button size="sm" onClick={() => setPurchaseOpen(true)}>
              <ShoppingCart className="mr-1.5 size-4" />
              Comprar
            </Button>
          )}
        </div>
      </CardContent>

      <WishlistForm
        item={item}
        categories={categories}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      <WishlistPurchaseDialog
        item={item}
        accounts={accounts}
        expenseCategories={expenseCategories}
        open={purchaseOpen}
        onOpenChange={setPurchaseOpen}
      />
      {ConfirmDialog}
    </Card>
  )
}

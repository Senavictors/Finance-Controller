'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ArrowLeftRight, ChevronDown, CreditCard } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BrandDot, BrandIcon, getBrand, matchBrand } from '@/lib/brands'
import { formatCurrency, formatDate } from '@/lib/format'

type StatementTransaction = {
  id: string
  type: string
  description: string
  date: string | Date
  amount: number
  category: { name: string; color: string | null; icon: string | null } | null
  creditCardPurchaseInstallment?: {
    id: string
    installmentNumber: number
    advanceId: string | null
    purchase: {
      id: string
      installmentCount: number
    }
  } | null
}

type Props = {
  transactions: StatementTransaction[]
  accountIcon: string | null
  initialVisible?: number
  pageSize?: number
}

export function StatementTransactionsList({
  transactions,
  accountIcon,
  initialVisible = 10,
  pageSize = 10,
}: Props) {
  const [visible, setVisible] = useState(initialVisible)
  const items = transactions.slice(0, visible)
  const remaining = transactions.length - items.length

  if (transactions.length === 0) {
    return (
      <div className="text-muted-foreground text-sm">
        Nenhuma movimentação vinculada a esta fatura.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {items.map((transaction) => {
        const inferredBrandKey =
          matchBrand(transaction.description) ?? transaction.category?.icon ?? accountIcon
        const inferredBrand = getBrand(inferredBrandKey)

        return (
          <div
            key={transaction.id}
            className="border-border/60 flex items-center justify-between rounded-2xl border px-4 py-3"
          >
            <div className="flex items-center gap-3">
              {inferredBrand ? (
                <BrandIcon
                  brandKey={inferredBrand.key}
                  fallbackLabel={transaction.description}
                  size={36}
                  radius="md"
                />
              ) : (
                <div className="bg-muted flex size-9 items-center justify-center rounded-xl">
                  {transaction.type === 'EXPENSE' ? (
                    <CreditCard className="size-4 text-red-500" />
                  ) : (
                    <ArrowLeftRight className="size-4 text-emerald-600" />
                  )}
                </div>
              )}
              <div>
                <p className="text-foreground text-sm font-medium">{transaction.description}</p>
                <div className="text-muted-foreground mt-0.5 flex items-center gap-2 text-xs">
                  <span>{formatDate(transaction.date)}</span>
                  {transaction.creditCardPurchaseInstallment && (
                    <>
                      <span>&middot;</span>
                      <Link
                        href={`/credit-card-purchases/${transaction.creditCardPurchaseInstallment.purchase.id}`}
                        className="text-foreground hover:text-primary font-medium transition-colors"
                      >
                        {transaction.creditCardPurchaseInstallment.installmentNumber}/
                        {transaction.creditCardPurchaseInstallment.purchase.installmentCount}
                      </Link>
                      {transaction.creditCardPurchaseInstallment.advanceId && (
                        <>
                          <span>&middot;</span>
                          <span>Adiantada</span>
                        </>
                      )}
                    </>
                  )}
                  {transaction.category && (
                    <>
                      <span>&middot;</span>
                      <span className="flex items-center gap-1">
                        <BrandDot
                          brandKey={transaction.category.icon}
                          fallbackText={transaction.category.name}
                          fallbackColor={transaction.category.color}
                          fallbackLabel={transaction.category.name}
                          size={10}
                        />
                        {transaction.category.name}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
            <span
              className={
                transaction.type === 'TRANSFER'
                  ? 'text-sm font-semibold text-emerald-600'
                  : 'text-sm font-semibold text-red-600'
              }
            >
              {transaction.type === 'TRANSFER' ? '+ ' : '- '}
              {formatCurrency(transaction.amount)}
            </span>
          </div>
        )
      })}

      {remaining > 0 && (
        <div className="flex justify-center pt-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setVisible((current) => current + pageSize)}
          >
            <ChevronDown className="mr-1.5 size-4" />
            Carregar mais ({remaining} restantes)
          </Button>
        </div>
      )}
    </div>
  )
}

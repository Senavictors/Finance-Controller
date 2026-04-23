'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DatePicker } from '@/components/ui/date-picker'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MoneyInput } from '@/components/ui/money-input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { BrandDot } from '@/lib/brands'
import { formatCentsToInput, parseMoneyToCents } from '@/lib/money'

type Account = {
  id: string
  name: string
  type: string
  color?: string | null
  icon?: string | null
}

type Category = {
  id: string
  name: string
  color?: string | null
  icon?: string | null
}

type WishlistItem = {
  id: string
  name: string
  desiredPrice: number
}

type Props = {
  item: WishlistItem
  accounts: Account[]
  expenseCategories: Category[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

function todayDateInput() {
  return new Date().toISOString().split('T')[0]
}

export function WishlistPurchaseDialog({
  item,
  accounts,
  expenseCategories,
  open,
  onOpenChange,
}: Props) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedAccountId, setSelectedAccountId] = useState(accounts[0]?.id ?? '')
  const [selectedCategoryId, setSelectedCategoryId] = useState('none')
  const [paymentMode, setPaymentMode] = useState<'SINGLE' | 'INSTALLMENT'>('SINGLE')
  const [installmentCount, setInstallmentCount] = useState(2)

  useEffect(() => {
    if (open) {
      setError(null)
      setSelectedAccountId(accounts[0]?.id ?? '')
      setSelectedCategoryId('none')
      setPaymentMode('SINGLE')
      setInstallmentCount(2)
    }
  }, [accounts, open])

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === selectedAccountId) ?? null,
    [accounts, selectedAccountId],
  )
  const isCreditCard = selectedAccount?.type === 'CREDIT_CARD'

  useEffect(() => {
    if (isCreditCard) return

    setPaymentMode('SINGLE')
    setInstallmentCount(2)
  }, [isCreditCard])

  const accountItems = useMemo(
    () => Object.fromEntries(accounts.map((account) => [account.id, account.name])),
    [accounts],
  )
  const categoryItems = useMemo(
    () => ({
      none: 'Sem categoria financeira',
      ...Object.fromEntries(expenseCategories.map((category) => [category.id, category.name])),
    }),
    [expenseCategories],
  )

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const body = {
      accountId: selectedAccountId,
      categoryId: selectedCategoryId === 'none' ? undefined : selectedCategoryId,
      amount: parseMoneyToCents(formData.get('amount') as string),
      date: formData.get('date') as string,
      paymentMode: isCreditCard ? paymentMode : 'SINGLE',
      installmentCount: isCreditCard
        ? paymentMode === 'INSTALLMENT'
          ? installmentCount
          : 1
        : undefined,
      notes: ((formData.get('notes') as string) || '').trim() || undefined,
    }

    try {
      const res = await fetch(`/api/wishlist/items/${item.id}/purchase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Erro ao registrar compra')
        return
      }

      onOpenChange(false)
      router.refresh()
    } catch {
      setError('Algo deu errado. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Registrar compra</DialogTitle>
          <DialogDescription>
            Essa ação cria uma despesa real nas transações e marca o item como comprado.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && <p className="text-destructive text-sm">{error}</p>}

          <div className="bg-muted/30 rounded-2xl border p-3">
            <p className="text-sm font-medium">{item.name}</p>
            <p className="text-muted-foreground mt-1 text-xs">
              Valor sugerido: {formatCentsToInput(item.desiredPrice).replace('.', ',')}
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Conta</Label>
            <Select
              items={accountItems}
              value={selectedAccountId}
              onValueChange={(value) => setSelectedAccountId(value ?? '')}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione uma conta" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    <span className="flex items-center gap-2">
                      <BrandDot
                        brandKey={account.icon}
                        fallbackText={account.name}
                        fallbackColor={account.color}
                        fallbackLabel={account.name}
                        size={14}
                      />
                      {account.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isCreditCard && (
            <div className="flex flex-col gap-3 rounded-2xl border p-3">
              <div className="flex flex-col gap-1.5">
                <Label>Pagamento no cartão</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={paymentMode === 'SINGLE' ? 'choice-active' : 'choice'}
                    size="sm"
                    onClick={() => setPaymentMode('SINGLE')}
                  >
                    À vista
                  </Button>
                  <Button
                    type="button"
                    variant={paymentMode === 'INSTALLMENT' ? 'choice-active' : 'choice'}
                    size="sm"
                    onClick={() => setPaymentMode('INSTALLMENT')}
                  >
                    Parcelado
                  </Button>
                </div>
              </div>

              {paymentMode === 'INSTALLMENT' && (
                <div className="flex flex-col gap-1.5">
                  <Label>Parcelas</Label>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="choice"
                      size="sm"
                      className="h-9 w-9 rounded-full p-0 text-lg"
                      onClick={() => setInstallmentCount((n) => Math.max(2, n - 1))}
                      disabled={installmentCount <= 2}
                    >
                      −
                    </Button>
                    <span className="w-16 text-center text-sm font-medium">
                      {installmentCount}x
                    </span>
                    <Button
                      type="button"
                      variant="choice"
                      size="sm"
                      className="h-9 w-9 rounded-full p-0 text-lg"
                      onClick={() => setInstallmentCount((n) => Math.min(24, n + 1))}
                      disabled={installmentCount >= 24}
                    >
                      +
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label>Categoria financeira</Label>
            <Select
              items={categoryItems}
              value={selectedCategoryId}
              onValueChange={(value) => setSelectedCategoryId(value ?? 'none')}
            >
              <SelectTrigger>
                <SelectValue placeholder="Sem categoria financeira" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem categoria financeira</SelectItem>
                {expenseCategories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    <span className="flex items-center gap-2">
                      <BrandDot
                        brandKey={category.icon}
                        fallbackText={category.name}
                        fallbackColor={category.color}
                        fallbackLabel={category.name}
                        size={14}
                      />
                      {category.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="amount">Valor pago (R$)</Label>
              <MoneyInput
                id="amount"
                name="amount"
                required
                defaultValue={formatCentsToInput(item.desiredPrice)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="date">Data da compra</Label>
              <DatePicker id="date" name="date" required defaultValue={todayDateInput()} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">Notas (opcional)</Label>
            <Input id="notes" name="notes" placeholder="Ex: comprado em promocao" />
          </div>

          <Button
            type="submit"
            variant="action"
            disabled={loading || !selectedAccountId}
            className="w-full"
          >
            {loading ? 'Registrando...' : 'Registrar compra'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

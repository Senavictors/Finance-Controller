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
  DialogTrigger,
} from '@/components/ui/dialog'
import { DatePicker } from '@/components/ui/date-picker'
import { Input } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/money-input'
import { Label } from '@/components/ui/label'
import { parseMoneyToCents, formatCentsToInput } from '@/lib/money'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus } from 'lucide-react'
import { BrandDot } from '@/lib/brands'

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
  type: string
  color?: string | null
  icon?: string | null
}

export type EditTransaction = {
  id: string
  type: string
  amount: number
  description: string
  date: string
  notes: string | null
  accountId: string
  categoryId: string | null
  transferId: string | null
  creditCardPurchaseInstallment: { id: string } | null
}

type Props = {
  accounts: Account[]
  categories: Category[]
  transaction?: EditTransaction
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function TransactionForm({ accounts, categories, transaction, open: externalOpen, onOpenChange: externalOnOpenChange }: Props) {
  const router = useRouter()
  const isEditMode = !!transaction
  const isControlled = externalOpen !== undefined

  const [internalOpen, setInternalOpen] = useState(false)
  const isOpen = isControlled ? externalOpen : internalOpen

  const [formKey, setFormKey] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'transaction' | 'transfer'>('transaction')
  const [txType, setTxType] = useState<'INCOME' | 'EXPENSE'>('EXPENSE')
  const [selectedAccountId, setSelectedAccountId] = useState(accounts[0]?.id ?? '')
  const [paymentMode, setPaymentMode] = useState<'SINGLE' | 'INSTALLMENT'>('SINGLE')
  const [installmentCount, setInstallmentCount] = useState(2)

  const filteredCategories = categories.filter((c) => c.type === txType)
  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === selectedAccountId) ?? null,
    [accounts, selectedAccountId],
  )
  const isCreditCardExpense =
    !isEditMode &&
    mode === 'transaction' &&
    txType === 'EXPENSE' &&
    selectedAccount?.type === 'CREDIT_CARD'

  const accountItems: Record<string, string> = Object.fromEntries(accounts.map((a) => [a.id, a.name]))
  const categoryItems: Record<string, string> = {
    none: 'Nenhuma',
    ...Object.fromEntries(filteredCategories.map((c) => [c.id, c.name])),
  }

  function handleOpenChange(v: boolean) {
    if (isControlled) {
      externalOnOpenChange?.(v)
    } else {
      setInternalOpen(v)
    }

    if (v) {
      setFormKey((k) => k + 1)
      setError(null)
      setLoading(false)

      if (isEditMode && transaction) {
        setMode('transaction')
        setTxType(transaction.type === 'INCOME' ? 'INCOME' : 'EXPENSE')
        setSelectedAccountId(transaction.accountId)
        setPaymentMode('SINGLE')
        setInstallmentCount(2)
      } else {
        setMode('transaction')
        setTxType('EXPENSE')
        setSelectedAccountId(accounts[0]?.id ?? '')
        setPaymentMode('SINGLE')
        setInstallmentCount(2)
      }
    }
  }

  useEffect(() => {
    if (!isCreditCardExpense) {
      setPaymentMode('SINGLE')
      setInstallmentCount(2)
    }
  }, [isCreditCardExpense])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const amount = parseMoneyToCents(formData.get('amount') as string)

    try {
      let res: Response

      if (isEditMode && transaction) {
        const categoryId = formData.get('categoryId') as string
        res = await fetch(`/api/transactions/${transaction.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount,
            date: formData.get('date'),
            description: formData.get('description'),
            accountId: selectedAccountId,
            type: txType,
            categoryId: categoryId === 'none' ? null : categoryId,
            notes: (formData.get('notes') as string) || undefined,
          }),
        })
      } else if (mode === 'transfer') {
        res = await fetch('/api/transactions/transfer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount,
            date: formData.get('date'),
            description: formData.get('description'),
            sourceAccountId: formData.get('sourceAccountId'),
            destinationAccountId: formData.get('destinationAccountId'),
            notes: (formData.get('notes') as string) || undefined,
          }),
        })
      } else {
        const categoryId = formData.get('categoryId') as string
        res = await fetch('/api/transactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount,
            date: formData.get('date'),
            description: formData.get('description'),
            accountId: selectedAccountId,
            type: txType,
            categoryId: categoryId === 'none' ? undefined : categoryId,
            notes: (formData.get('notes') as string) || undefined,
            paymentMode: isCreditCardExpense ? paymentMode : 'SINGLE',
            installmentCount: isCreditCardExpense
              ? paymentMode === 'INSTALLMENT'
                ? installmentCount
                : 1
              : undefined,
          }),
        })
      }

      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Erro ao salvar')
        return
      }

      handleOpenChange(false)
      router.refresh()
    } catch {
      setError('Algo deu errado. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const today = new Date().toISOString().split('T')[0]
  const defaultDate = isEditMode && transaction ? transaction.date : today
  const defaultAmount = isEditMode && transaction ? formatCentsToInput(transaction.amount) : ''
  const defaultDescription = isEditMode && transaction ? transaction.description : ''
  const defaultNotes = isEditMode && transaction ? (transaction.notes ?? '') : ''
  const defaultCategoryId = isEditMode && transaction ? (transaction.categoryId ?? 'none') : 'none'

  const dialogContent = (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{isEditMode ? 'Editar Transação' : 'Nova Transação'}</DialogTitle>
        <DialogDescription>
          {isEditMode
            ? 'Edite os dados da transação'
            : 'Registre uma receita, despesa ou transferência'}
        </DialogDescription>
      </DialogHeader>

      {!isEditMode && (
        <div className="mb-2 flex gap-2">
          <Button
            variant={mode === 'transaction' ? 'choice-active' : 'choice'}
            size="sm"
            onClick={() => setMode('transaction')}
            type="button"
          >
            Receita / Despesa
          </Button>
          <Button
            variant={mode === 'transfer' ? 'choice-active' : 'choice'}
            size="sm"
            onClick={() => setMode('transfer')}
            type="button"
          >
            Transferência
          </Button>
        </div>
      )}

      <form key={formKey} onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && <p className="text-destructive text-sm">{error}</p>}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="description">Descrição</Label>
          <Input id="description" name="description" required defaultValue={defaultDescription} />
        </div>

        <div className="flex gap-3">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="amount">Valor (R$)</Label>
            <MoneyInput id="amount" name="amount" placeholder="0,00" required defaultValue={defaultAmount} />
          </div>
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="date">Data</Label>
            <DatePicker id="date" name="date" required defaultValue={defaultDate} />
          </div>
        </div>

        {(isEditMode || mode === 'transaction') && (
          <>
            <div className="flex flex-col gap-1.5">
              <Label>Tipo</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={txType === 'EXPENSE' ? 'choice-active' : 'choice'}
                  size="sm"
                  onClick={() => setTxType('EXPENSE')}
                >
                  Despesa
                </Button>
                <Button
                  type="button"
                  variant={txType === 'INCOME' ? 'choice-active' : 'choice'}
                  size="sm"
                  onClick={() => setTxType('INCOME')}
                >
                  Receita
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="accountId">Conta</Label>
              <Select
                name="accountId"
                required
                items={accountItems}
                value={selectedAccountId}
                onValueChange={(value) => setSelectedAccountId(value ?? '')}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      <span className="flex items-center gap-2">
                        <BrandDot
                          brandKey={a.icon}
                          fallbackText={a.name}
                          fallbackColor={a.color}
                          fallbackLabel={a.name}
                          size={14}
                        />
                        {a.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isCreditCardExpense && (
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
                      A vista
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
                        variant="outline"
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
                        variant="outline"
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
              <Label htmlFor="categoryId">Categoria (opcional)</Label>
              <Select name="categoryId" defaultValue={defaultCategoryId} items={categoryItems}>
                <SelectTrigger>
                  <SelectValue placeholder="Nenhuma" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma</SelectItem>
                  {filteredCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="flex items-center gap-2">
                        <BrandDot
                          brandKey={c.icon}
                          fallbackText={c.name}
                          fallbackColor={c.color}
                          fallbackLabel={c.name}
                          size={14}
                        />
                        {c.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>
        )}

        {!isEditMode && mode === 'transfer' && (
          <>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sourceAccountId">Conta de origem</Label>
              <Select name="sourceAccountId" required items={accountItems}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      <span className="flex items-center gap-2">
                        <BrandDot
                          brandKey={a.icon}
                          fallbackText={a.name}
                          fallbackColor={a.color}
                          fallbackLabel={a.name}
                          size={14}
                        />
                        {a.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="destinationAccountId">Conta de destino</Label>
              <Select name="destinationAccountId" required items={accountItems}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      <span className="flex items-center gap-2">
                        <BrandDot
                          brandKey={a.icon}
                          fallbackText={a.name}
                          fallbackColor={a.color}
                          fallbackLabel={a.name}
                          size={14}
                        />
                        {a.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="notes">Notas (opcional)</Label>
          <Input id="notes" name="notes" defaultValue={defaultNotes} />
        </div>

        <Button type="submit" variant="action" disabled={loading} className="w-full">
          {loading ? 'Salvando...' : isEditMode ? 'Salvar alterações' : 'Criar Transação'}
        </Button>
      </form>
    </DialogContent>
  )

  if (isControlled) {
    return (
      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        {dialogContent}
      </Dialog>
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button variant="action" />}>
        <Plus className="mr-1.5 size-4 transition-transform duration-200 group-hover/button:rotate-90" />
        Nova Transação
      </DialogTrigger>
      {dialogContent}
    </Dialog>
  )
}

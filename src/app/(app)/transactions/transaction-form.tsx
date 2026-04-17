'use client'

import { useState } from 'react'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus } from 'lucide-react'

type Account = { id: string; name: string }
type Category = { id: string; name: string; type: string }

type Props = {
  accounts: Account[]
  categories: Category[]
}

export function TransactionForm({ accounts, categories }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'transaction' | 'transfer'>('transaction')
  const [txType, setTxType] = useState<'INCOME' | 'EXPENSE'>('EXPENSE')

  const filteredCategories = categories.filter((c) => c.type === txType)
  const accountItems: Record<string, string> = Object.fromEntries(
    accounts.map((a) => [a.id, a.name]),
  )
  const categoryItems: Record<string, string> = {
    none: 'Nenhuma',
    ...Object.fromEntries(filteredCategories.map((c) => [c.id, c.name])),
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const amountStr = formData.get('amount') as string
    const amount = Math.round(parseFloat(amountStr || '0') * 100)

    try {
      let res: Response

      if (mode === 'transfer') {
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
            accountId: formData.get('accountId'),
            type: txType,
            categoryId: categoryId === 'none' ? undefined : categoryId,
            notes: (formData.get('notes') as string) || undefined,
          }),
        })
      }

      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Erro ao salvar')
        return
      }

      setOpen(false)
      router.refresh()
    } catch {
      setError('Algo deu errado. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const today = new Date().toISOString().split('T')[0]

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus className="mr-1.5 size-4" />
        Nova Transacao
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova Transacao</DialogTitle>
          <DialogDescription>Registre uma receita, despesa ou transferencia</DialogDescription>
        </DialogHeader>

        <div className="mb-2 flex gap-2">
          <Button
            variant={mode === 'transaction' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMode('transaction')}
            type="button"
          >
            Receita / Despesa
          </Button>
          <Button
            variant={mode === 'transfer' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMode('transfer')}
            type="button"
          >
            Transferencia
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && <p className="text-destructive text-sm">{error}</p>}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description">Descricao</Label>
            <Input id="description" name="description" required />
          </div>

          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="amount">Valor (R$)</Label>
              <Input id="amount" name="amount" type="number" step="0.01" min="0.01" required />
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="date">Data</Label>
              <Input id="date" name="date" type="date" required defaultValue={today} />
            </div>
          </div>

          {mode === 'transaction' ? (
            <>
              <div className="flex flex-col gap-1.5">
                <Label>Tipo</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={txType === 'EXPENSE' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setTxType('EXPENSE')}
                  >
                    Despesa
                  </Button>
                  <Button
                    type="button"
                    variant={txType === 'INCOME' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setTxType('INCOME')}
                  >
                    Receita
                  </Button>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="accountId">Conta</Label>
                <Select name="accountId" required items={accountItems}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="categoryId">Categoria (opcional)</Label>
                <Select name="categoryId" defaultValue="none" items={categoryItems}>
                  <SelectTrigger>
                    <SelectValue placeholder="Nenhuma" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhuma</SelectItem>
                    {filteredCategories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          ) : (
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
                        {a.name}
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
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">Notas (opcional)</Label>
            <Input id="notes" name="notes" />
          </div>

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Salvando...' : 'Criar'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

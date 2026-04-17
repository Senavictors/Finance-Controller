'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type SourceAccount = {
  id: string
  name: string
}

type Props = {
  statementId: string
  cardName: string
  openAmount: number
  sourceAccounts: SourceAccount[]
}

export function StatementPaymentForm({ statementId, cardName, openAmount, sourceAccounts }: Props) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setLoading(true)

    const formData = new FormData(event.currentTarget)
    const amount = Math.round(parseFloat((formData.get('amount') as string) || '0') * 100)

    try {
      const response = await fetch(`/api/credit-cards/statements/${statementId}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceAccountId: formData.get('sourceAccountId'),
          amount,
          date: formData.get('date'),
          description: `Pagamento fatura ${cardName}`,
          notes: (formData.get('notes') as string) || undefined,
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        setError(data.error ?? 'Erro ao registrar pagamento')
        return
      }

      router.refresh()
    } catch {
      setError('Algo deu errado. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const today = new Date().toISOString().split('T')[0]
  const sourceAccountItems: Record<string, string> = Object.fromEntries(
    sourceAccounts.map((a) => [a.id, a.name]),
  )

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <p className="text-destructive text-sm">{error}</p>}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="sourceAccountId">Conta de origem</Label>
        <Select
          name="sourceAccountId"
          required
          items={sourceAccountItems}
          disabled={sourceAccounts.length === 0}
        >
          <SelectTrigger>
            <SelectValue placeholder="Selecione uma conta" />
          </SelectTrigger>
          <SelectContent>
            {sourceAccounts.map((account) => (
              <SelectItem key={account.id} value={account.id}>
                {account.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="amount">Valor (R$)</Label>
          <Input
            id="amount"
            name="amount"
            type="number"
            step="0.01"
            min="0.01"
            max={(openAmount / 100).toFixed(2)}
            defaultValue={(openAmount / 100).toFixed(2)}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="date">Data</Label>
          <Input id="date" name="date" type="date" defaultValue={today} required />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="notes">Notas (opcional)</Label>
        <Input id="notes" name="notes" />
      </div>

      <Button type="submit" disabled={loading || sourceAccounts.length === 0}>
        {loading ? 'Registrando...' : 'Registrar pagamento'}
      </Button>
    </form>
  )
}

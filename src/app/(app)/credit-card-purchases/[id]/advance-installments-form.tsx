'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MoneyInput } from '@/components/ui/money-input'
import { formatCentsToInput, parseMoneyToCents } from '@/lib/money'
import { formatCurrency, formatDate } from '@/lib/format'

type Installment = {
  id: string
  installmentNumber: number
  originalAmount: number
  originalDate: Date | string
  currentAmount: number
  currentDate: Date | string
  advance: {
    id: string
  } | null
}

type Props = {
  purchaseId: string
  installments: Installment[]
}

function todayDateInput() {
  return new Date().toISOString().split('T')[0]
}

export function AdvanceInstallmentsForm({ purchaseId, installments }: Props) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [paidAmounts, setPaidAmounts] = useState<Record<string, string>>(
    Object.fromEntries(
      installments.map((installment) => [
        installment.id,
        formatCentsToInput(installment.currentAmount),
      ]),
    ),
  )

  const selectedInstallments = useMemo(
    () => installments.filter((installment) => selectedIds.includes(installment.id)),
    [installments, selectedIds],
  )

  function toggleInstallment(installmentId: string, checked: boolean) {
    setSelectedIds((current) =>
      checked ? [...current, installmentId] : current.filter((id) => id !== installmentId),
    )
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (selectedInstallments.length === 0) {
      setError('Selecione ao menos uma parcela para adiantar.')
      return
    }

    const formData = new FormData(event.currentTarget)
    const installmentsPayload = selectedInstallments.map((installment) => ({
      installmentId: installment.id,
      paidAmount: parseMoneyToCents(paidAmounts[installment.id] ?? '0'),
    }))

    setLoading(true)

    try {
      const response = await fetch(`/api/credit-card-purchases/${purchaseId}/advances`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          advancedAt: formData.get('advancedAt'),
          notes: ((formData.get('notes') as string) || '').trim() || undefined,
          installments: installmentsPayload,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error ?? 'Erro ao adiantar parcelas')
        return
      }

      setSelectedIds([])
      router.refresh()
    } catch {
      setError('Algo deu errado. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <p className="text-destructive text-sm">{error}</p>}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="advancedAt">Data do adiantamento</Label>
          <Input
            id="advancedAt"
            name="advancedAt"
            type="date"
            defaultValue={todayDateInput()}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="notes">Notas (opcional)</Label>
          <Input id="notes" name="notes" placeholder="Ex: antecipado pelo app do banco" />
        </div>
      </div>

      <div className="space-y-3">
        {installments.map((installment) => {
          const checked = selectedIds.includes(installment.id)

          return (
            <div key={installment.id} className="rounded-2xl border p-3">
              <div className="flex items-start justify-between gap-3">
                <label className="flex min-w-0 flex-1 items-start gap-3">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => toggleInstallment(installment.id, event.target.checked)}
                    className="mt-1 size-4"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Parcela {installment.installmentNumber}</p>
                    <p className="text-muted-foreground text-xs">
                      Prevista para {formatDate(installment.currentDate)}
                    </p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      Valor atual: {formatCurrency(installment.currentAmount)}
                    </p>
                  </div>
                </label>

                <div className="w-32">
                  <MoneyInput
                    value={
                      paidAmounts[installment.id] ?? formatCentsToInput(installment.currentAmount)
                    }
                    onChange={(event) =>
                      setPaidAmounts((current) => ({
                        ...current,
                        [installment.id]: event.target.value,
                      }))
                    }
                    disabled={!checked || installment.advance != null}
                  />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <Button type="submit" disabled={loading || selectedInstallments.length === 0}>
        {loading ? 'Adiantando...' : 'Adiantar parcelas selecionadas'}
      </Button>
    </form>
  )
}

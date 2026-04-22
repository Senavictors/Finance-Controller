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
import { MoneyInput, IntegerInput } from '@/components/ui/money-input'
import { Label } from '@/components/ui/label'
import { formatCentsToInput, parseMoneyToCents } from '@/lib/money'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus } from 'lucide-react'
import { BrandDot } from '@/lib/brands'

type Account = { id: string; name: string; color?: string | null; icon?: string | null }
type Category = {
  id: string
  name: string
  type: string
  color?: string | null
  icon?: string | null
}

type Rule = {
  id: string
  accountId: string
  categoryId: string | null
  type: string
  amount: number
  description: string
  notes: string | null
  frequency: string
  dayOfMonth: number | null
  dayOfWeek: number | null
  startDate: string | Date
  endDate: string | Date | null
  isActive: boolean
}

type Props = {
  accounts: Account[]
  categories: Category[]
  rule?: Rule
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

const frequencies = [
  { value: 'DAILY', label: 'Diaria' },
  { value: 'WEEKLY', label: 'Semanal' },
  { value: 'MONTHLY', label: 'Mensal' },
  { value: 'YEARLY', label: 'Anual' },
]

const weekDays = [
  { value: '0', label: 'Domingo' },
  { value: '1', label: 'Segunda' },
  { value: '2', label: 'Terça' },
  { value: '3', label: 'Quarta' },
  { value: '4', label: 'Quinta' },
  { value: '5', label: 'Sexta' },
  { value: '6', label: 'Sábado' },
]

export function RecurringForm({ accounts, categories, rule, open, onOpenChange }: Props) {
  const router = useRouter()
  const [internalOpen, setInternalOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [txType, setTxType] = useState<'INCOME' | 'EXPENSE'>(
    (rule?.type as 'INCOME' | 'EXPENSE') ?? 'EXPENSE',
  )
  const [freq, setFreq] = useState(rule?.frequency ?? 'MONTHLY')

  const isControlled = open !== undefined
  const isOpen = isControlled ? open : internalOpen
  const setIsOpen = isControlled ? onOpenChange! : setInternalOpen
  const isEdit = !!rule

  const filteredCategories = categories.filter((c) => c.type === txType)

  const accountItems: Record<string, string> = Object.fromEntries(
    accounts.map((a) => [a.id, a.name]),
  )
  const categoryItems: Record<string, string> = {
    none: 'Nenhuma',
    ...Object.fromEntries(filteredCategories.map((c) => [c.id, c.name])),
  }
  const frequencyItems: Record<string, string> = Object.fromEntries(
    frequencies.map((f) => [f.value, f.label]),
  )
  const weekDayItems: Record<string, string> = Object.fromEntries(
    weekDays.map((d) => [d.value, d.label]),
  )

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const fd = new FormData(e.currentTarget)
    const categoryId = fd.get('categoryId') as string
    const dayOfMonth = fd.get('dayOfMonth') as string
    const dayOfWeek = fd.get('dayOfWeek') as string

    const body: Record<string, unknown> = {
      accountId: fd.get('accountId'),
      type: txType,
      amount: parseMoneyToCents(fd.get('amount') as string),
      description: fd.get('description'),
      notes: (fd.get('notes') as string) || undefined,
      frequency: freq,
      startDate: fd.get('startDate'),
      categoryId: categoryId === 'none' ? null : categoryId || undefined,
      dayOfMonth:
        freq === 'MONTHLY' || freq === 'YEARLY' ? parseInt(dayOfMonth) || undefined : undefined,
      dayOfWeek: freq === 'WEEKLY' ? parseInt(dayOfWeek) || undefined : undefined,
    }

    if (isEdit) {
      body.isActive = rule.isActive
    }

    try {
      const url = isEdit ? `/api/recurring-rules/${rule.id}` : '/api/recurring-rules'
      const method = isEdit ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Erro ao salvar')
        return
      }

      setIsOpen(false)
      router.refresh()
    } catch {
      setError('Algo deu errado. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const today = new Date().toISOString().split('T')[0]

  const trigger = !isControlled ? (
    <DialogTrigger render={<Button />}>
      <Plus className="mr-1.5 size-4" />
      Nova Regra
    </DialogTrigger>
  ) : null

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {trigger}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar Regra' : 'Nova Regra Recorrente'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Altere os dados da regra'
              : 'Configure uma transação que se repete automaticamente'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && <p className="text-destructive text-sm">{error}</p>}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description">Descrição</Label>
            <Input id="description" name="description" required defaultValue={rule?.description} />
          </div>

          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="amount">Valor (R$)</Label>
              <MoneyInput
                id="amount"
                name="amount"
                placeholder="0,00"
                required
                defaultValue={rule ? formatCentsToInput(rule.amount) : ''}
              />
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
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
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="accountId">Conta</Label>
            <Select name="accountId" required items={accountItems} defaultValue={rule?.accountId}>
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
            <Label htmlFor="categoryId">Categoria (opcional)</Label>
            <Select
              name="categoryId"
              items={categoryItems}
              defaultValue={rule?.categoryId ?? 'none'}
            >
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

          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label>Frequencia</Label>
              <Select
                name="frequency"
                items={frequencyItems}
                defaultValue={freq}
                onValueChange={(v) => v && setFreq(v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {frequencies.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {freq === 'MONTHLY' || freq === 'YEARLY' ? (
              <div className="flex flex-1 flex-col gap-1.5">
                <Label htmlFor="dayOfMonth">Dia do mes</Label>
                <IntegerInput
                  id="dayOfMonth"
                  name="dayOfMonth"
                  min="1"
                  max="31"
                  required
                  defaultValue={rule?.dayOfMonth ?? 1}
                />
              </div>
            ) : null}

            {freq === 'WEEKLY' ? (
              <div className="flex flex-1 flex-col gap-1.5">
                <Label>Dia da semana</Label>
                <Select
                  name="dayOfWeek"
                  items={weekDayItems}
                  defaultValue={String(rule?.dayOfWeek ?? 1)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {weekDays.map((d) => (
                      <SelectItem key={d.value} value={d.value}>
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="startDate">Data de inicio</Label>
            <Input
              id="startDate"
              name="startDate"
              type="date"
              required
              defaultValue={rule ? new Date(rule.startDate).toISOString().split('T')[0] : today}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">Notas (opcional)</Label>
            <Input id="notes" name="notes" defaultValue={rule?.notes ?? ''} />
          </div>

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Salvando...' : isEdit ? 'Salvar' : 'Criar Regra'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

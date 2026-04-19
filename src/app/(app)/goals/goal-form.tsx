'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
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

import { BrandDot } from '@/lib/brands'

type Category = {
  id: string
  name: string
  type: string
  color?: string | null
  icon?: string | null
}
type Account = {
  id: string
  name: string
  type: string
  color?: string | null
  icon?: string | null
}

type GoalFormProps = {
  categories: Category[]
  accounts: Account[]
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

const metricOptions = [
  { value: 'SAVING', label: 'Meta de Economia' },
  { value: 'EXPENSE_LIMIT', label: 'Limite de Gasto' },
  { value: 'INCOME_TARGET', label: 'Meta de Receita' },
  { value: 'ACCOUNT_LIMIT', label: 'Limite de Conta/Cartao' },
]

const metricDescriptions: Record<string, string> = {
  SAVING: 'Economia mensal: receitas menos despesas do periodo',
  EXPENSE_LIMIT: 'Limite maximo de gastos (global, por categoria ou conta)',
  INCOME_TARGET: 'Meta minima de receitas (global, por categoria ou conta)',
  ACCOUNT_LIMIT: 'Limite de gasto em uma conta ou cartao especifico',
}

const periodOptions = [
  { value: 'MONTHLY', label: 'Mensal' },
  { value: 'YEARLY', label: 'Anual' },
]

const scopeOptions = [
  { value: 'GLOBAL', label: 'Global (todas as contas/categorias)' },
  { value: 'CATEGORY', label: 'Por categoria' },
  { value: 'ACCOUNT', label: 'Por conta' },
]

export function GoalForm({ categories, accounts, open, onOpenChange }: GoalFormProps) {
  const router = useRouter()
  const [internalOpen, setInternalOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [metric, setMetric] = useState('EXPENSE_LIMIT')
  const [scopeType, setScopeType] = useState('GLOBAL')

  const isControlled = open !== undefined
  const isOpen = isControlled ? open : internalOpen
  const setIsOpen = isControlled ? onOpenChange! : setInternalOpen

  useEffect(() => {
    if (!isOpen) {
      setError(null)
      setMetric('EXPENSE_LIMIT')
      setScopeType('GLOBAL')
    }
  }, [isOpen])

  const needsAccount = metric === 'ACCOUNT_LIMIT' || scopeType === 'ACCOUNT'
  const needsCategory = scopeType === 'CATEGORY' && metric !== 'ACCOUNT_LIMIT'
  const showScope = metric !== 'ACCOUNT_LIMIT' && metric !== 'SAVING'

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const formData = new FormData(e.currentTarget)
      const amountStr = formData.get('targetAmount') as string

      const body: Record<string, unknown> = {
        name: formData.get('name') as string,
        description: (formData.get('description') as string) || undefined,
        metric,
        scopeType: metric === 'ACCOUNT_LIMIT' ? 'ACCOUNT' : scopeType,
        targetAmount: Math.round(parseFloat(amountStr || '0') * 100),
        period: formData.get('period') as string,
        warningPercent: Number(formData.get('warningPercent') ?? 80),
        dangerPercent: Number(formData.get('dangerPercent') ?? 95),
      }

      if (needsCategory) body.categoryId = formData.get('categoryId') as string
      if (needsAccount) body.accountId = formData.get('accountId') as string

      const res = await fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Erro ao criar meta')
        return
      }

      setIsOpen(false)
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  const expenseCategories = categories.filter((c) => c.type === 'EXPENSE')
  const incomeCategories = categories.filter((c) => c.type === 'INCOME')
  const relevantCategories = metric === 'INCOME_TARGET' ? incomeCategories : expenseCategories

  const metricItems: Record<string, string> = Object.fromEntries(
    metricOptions.map((o) => [o.value, o.label]),
  )
  const scopeItems: Record<string, string> = Object.fromEntries(
    scopeOptions.map((o) => [o.value, o.label]),
  )
  const periodItems: Record<string, string> = Object.fromEntries(
    periodOptions.map((o) => [o.value, o.label]),
  )
  const categoryItems: Record<string, string> = Object.fromEntries(
    relevantCategories.map((c) => [c.id, c.name]),
  )
  const accountItems: Record<string, string> = Object.fromEntries(
    accounts.map((a) => [a.id, a.name]),
  )

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {!isControlled && (
        <DialogTrigger render={<Button />}>
          <Plus className="mr-2 size-4" />
          Nova meta
        </DialogTrigger>
      )}

      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova meta financeira</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Nome</Label>
            <Input id="name" name="name" placeholder="Ex: Economizar R$ 500 em abril" required />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Descricao (opcional)</Label>
            <Input id="description" name="description" placeholder="Detalhes da meta" />
          </div>

          <div className="space-y-1.5">
            <Label>Tipo de meta</Label>
            <Select items={metricItems} value={metric} onValueChange={(v) => v && setMetric(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {metricOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500">{metricDescriptions[metric]}</p>
          </div>

          {showScope && (
            <div className="space-y-1.5">
              <Label>Escopo</Label>
              <Select
                items={scopeItems}
                value={scopeType}
                onValueChange={(v) => v && setScopeType(v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {scopeOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {needsCategory && (
            <div className="space-y-1.5">
              <Label htmlFor="categoryId">Categoria</Label>
              <Select name="categoryId" required items={categoryItems}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma categoria" />
                </SelectTrigger>
                <SelectContent>
                  {relevantCategories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      <span className="flex items-center gap-2">
                        <BrandDot
                          brandKey={cat.icon}
                          fallbackText={cat.name}
                          fallbackColor={cat.color}
                          fallbackLabel={cat.name}
                          size={14}
                        />
                        {cat.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {needsAccount && (
            <div className="space-y-1.5">
              <Label htmlFor="accountId">Conta</Label>
              <Select name="accountId" required items={accountItems}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma conta" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((acc) => (
                    <SelectItem key={acc.id} value={acc.id}>
                      <span className="flex items-center gap-2">
                        <BrandDot
                          brandKey={acc.icon}
                          fallbackText={acc.name}
                          fallbackColor={acc.color}
                          fallbackLabel={acc.name}
                          size={14}
                        />
                        {acc.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="targetAmount">Valor alvo (R$)</Label>
            <Input
              id="targetAmount"
              name="targetAmount"
              type="number"
              min="0.01"
              step="0.01"
              placeholder="0,00"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label>Periodo</Label>
            <Select name="period" items={periodItems} defaultValue="MONTHLY">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {periodOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="warningPercent">Aviso (%)</Label>
              <Input
                id="warningPercent"
                name="warningPercent"
                type="number"
                min="1"
                max="99"
                defaultValue="80"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dangerPercent">Perigo (%)</Label>
              <Input
                id="dangerPercent"
                name="dangerPercent"
                type="number"
                min="1"
                max="99"
                defaultValue="95"
              />
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Salvando...' : 'Criar meta'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

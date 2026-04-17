'use client'

import { useEffect, useState } from 'react'
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

type Account = {
  id: string
  name: string
  type: string
  initialBalance: number
  creditLimit: number | null
  statementClosingDay: number | null
  statementDueDay: number | null
  color: string | null
  icon: string | null
}

type AccountFormProps = {
  account?: Account
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

const accountTypes = [
  { value: 'WALLET', label: 'Carteira' },
  { value: 'CHECKING', label: 'Conta Corrente' },
  { value: 'SAVINGS', label: 'Poupanca' },
  { value: 'CREDIT_CARD', label: 'Cartao de Credito' },
  { value: 'INVESTMENT', label: 'Investimento' },
  { value: 'OTHER', label: 'Outro' },
]

export function AccountForm({ account, open, onOpenChange }: AccountFormProps) {
  const router = useRouter()
  const [internalOpen, setInternalOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [accountType, setAccountType] = useState(account?.type ?? 'CHECKING')

  const isControlled = open !== undefined
  const isOpen = isControlled ? open : internalOpen
  const setIsOpen = isControlled ? onOpenChange! : setInternalOpen
  const isEdit = !!account

  useEffect(() => {
    setAccountType(account?.type ?? 'CHECKING')
  }, [account?.type, isOpen])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const balanceStr = formData.get('initialBalance') as string
    const body = {
      name: formData.get('name') as string,
      type: formData.get('type') as string,
      initialBalance: Math.round(parseFloat(balanceStr || '0') * 100),
      creditLimit:
        formData.get('creditLimit') && accountType === 'CREDIT_CARD'
          ? Math.round(parseFloat((formData.get('creditLimit') as string) || '0') * 100)
          : null,
      statementClosingDay:
        formData.get('statementClosingDay') && accountType === 'CREDIT_CARD'
          ? parseInt(formData.get('statementClosingDay') as string)
          : null,
      statementDueDay:
        formData.get('statementDueDay') && accountType === 'CREDIT_CARD'
          ? parseInt(formData.get('statementDueDay') as string)
          : null,
      color: (formData.get('color') as string) || undefined,
    }

    try {
      const url = isEdit ? `/api/accounts/${account.id}` : '/api/accounts'
      const method = isEdit ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Erro ao salvar conta')
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

  const trigger = !isControlled ? (
    <DialogTrigger render={<Button />}>
      <Plus className="mr-1.5 size-4" />
      Nova Conta
    </DialogTrigger>
  ) : null

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {trigger}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar Conta' : 'Nova Conta'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Altere os dados da conta' : 'Preencha os dados para criar uma nova conta'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && <p className="text-destructive text-sm">{error}</p>}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Nome</Label>
            <Input id="name" name="name" required defaultValue={account?.name} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="type">Tipo</Label>
            <Select
              name="type"
              defaultValue={account?.type ?? 'CHECKING'}
              onValueChange={(value) => setAccountType(value ?? 'CHECKING')}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione o tipo" />
              </SelectTrigger>
              <SelectContent>
                {accountTypes.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="initialBalance">Saldo inicial (R$)</Label>
            <Input
              id="initialBalance"
              name="initialBalance"
              type="number"
              step="0.01"
              defaultValue={account ? (account.initialBalance / 100).toFixed(2) : '0.00'}
            />
          </div>

          {accountType === 'CREDIT_CARD' && (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="creditLimit">Limite (R$)</Label>
                  <Input
                    id="creditLimit"
                    name="creditLimit"
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    defaultValue={
                      account?.creditLimit ? (account.creditLimit / 100).toFixed(2) : ''
                    }
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="statementClosingDay">Fechamento</Label>
                  <Input
                    id="statementClosingDay"
                    name="statementClosingDay"
                    type="number"
                    min="1"
                    max="31"
                    required
                    defaultValue={account?.statementClosingDay ?? ''}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="statementDueDay">Vencimento</Label>
                  <Input
                    id="statementDueDay"
                    name="statementDueDay"
                    type="number"
                    min="1"
                    max="31"
                    required
                    defaultValue={account?.statementDueDay ?? ''}
                  />
                </div>
              </div>
              <p className="text-xs text-gray-500">
                O sistema usara esses dias para criar e agrupar automaticamente as faturas do
                cartao.
              </p>
            </>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="color">Cor</Label>
            <Input
              id="color"
              name="color"
              type="color"
              defaultValue={account?.color ?? '#3b82f6'}
              className="h-10 w-20"
            />
          </div>

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Salvando...' : isEdit ? 'Salvar' : 'Criar Conta'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

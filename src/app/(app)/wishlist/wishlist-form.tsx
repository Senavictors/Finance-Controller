'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
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
import { MoneyInput } from '@/components/ui/money-input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatCentsToInput, parseMoneyToCents } from '@/lib/money'

type WishlistCategory = {
  id: string
  name: string
}

type WishlistItem = {
  id: string
  name: string
  categoryId: string | null
  desiredPrice: number
  productUrl: string | null
  priority: 'LOW' | 'MEDIUM' | 'HIGH'
  status: 'DESIRED' | 'MONITORING' | 'READY_TO_BUY' | 'CANCELED' | 'PURCHASED'
  desiredPurchaseDate: Date | string | null
}

type WishlistFormProps = {
  categories: WishlistCategory[]
  item?: WishlistItem
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

const priorityOptions = [
  { value: 'HIGH', label: 'Alta' },
  { value: 'MEDIUM', label: 'Media' },
  { value: 'LOW', label: 'Baixa' },
]

const statusOptions = [
  { value: 'DESIRED', label: 'Desejado' },
  { value: 'MONITORING', label: 'Monitorando' },
  { value: 'READY_TO_BUY', label: 'Pronto para comprar' },
  { value: 'CANCELED', label: 'Cancelado' },
]

function formatDateInput(date?: Date | string | null) {
  if (!date) return ''
  return new Date(date).toISOString().split('T')[0]
}

function sortCategories(categories: WishlistCategory[]) {
  return [...categories].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}

export function WishlistForm({ categories, item, open, onOpenChange }: WishlistFormProps) {
  const router = useRouter()
  const [internalOpen, setInternalOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [creatingCategory, setCreatingCategory] = useState(false)
  const [categoriesState, setCategoriesState] = useState<WishlistCategory[]>(
    sortCategories(categories),
  )
  const [selectedCategoryId, setSelectedCategoryId] = useState(item?.categoryId ?? 'none')
  const [priority, setPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH'>(item?.priority ?? 'MEDIUM')
  const [status, setStatus] = useState<'DESIRED' | 'MONITORING' | 'READY_TO_BUY' | 'CANCELED'>(
    item?.status && item.status !== 'PURCHASED' ? item.status : 'DESIRED',
  )
  const [newCategoryName, setNewCategoryName] = useState('')

  const isControlled = open !== undefined
  const isOpen = isControlled ? open : internalOpen
  const setIsOpen = isControlled ? onOpenChange! : setInternalOpen
  const isEdit = !!item

  useEffect(() => {
    setCategoriesState(sortCategories(categories))
  }, [categories])

  useEffect(() => {
    setError(null)
    setSelectedCategoryId(item?.categoryId ?? 'none')
    setPriority(item?.priority ?? 'MEDIUM')
    setStatus(item?.status && item.status !== 'PURCHASED' ? item.status : 'DESIRED')
    setNewCategoryName('')
  }, [item?.categoryId, item?.priority, item?.status, isOpen])

  const categoryItems = useMemo(
    () => ({
      none: 'Sem categoria',
      ...Object.fromEntries(categoriesState.map((category) => [category.id, category.name])),
    }),
    [categoriesState],
  )

  async function handleCreateCategory() {
    const name = newCategoryName.trim()
    if (name.length < 2) {
      setError('A nova categoria precisa ter pelo menos 2 caracteres')
      return
    }

    setError(null)
    setCreatingCategory(true)

    try {
      const res = await fetch('/api/wishlist/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Erro ao criar categoria')
        return
      }

      const nextCategories = sortCategories([...categoriesState, data.data])
      setCategoriesState(nextCategories)
      setSelectedCategoryId(data.data.id)
      setNewCategoryName('')
    } catch {
      setError('Algo deu errado ao criar a categoria')
    } finally {
      setCreatingCategory(false)
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const body = {
      name: formData.get('name') as string,
      categoryId: selectedCategoryId === 'none' ? null : selectedCategoryId,
      desiredPrice: parseMoneyToCents(formData.get('desiredPrice') as string),
      productUrl: ((formData.get('productUrl') as string) || '').trim() || null,
      priority,
      status,
      desiredPurchaseDate: ((formData.get('desiredPurchaseDate') as string) || '').trim() || null,
    }

    try {
      const url = isEdit ? `/api/wishlist/items/${item.id}` : '/api/wishlist/items'
      const method = isEdit ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Erro ao salvar item')
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

  const priorityItems: Record<string, string> = Object.fromEntries(
    priorityOptions.map((option) => [option.value, option.label]),
  )
  const statusItems: Record<string, string> = Object.fromEntries(
    statusOptions.map((option) => [option.value, option.label]),
  )

  const trigger = !isControlled ? (
    <DialogTrigger render={<Button />}>
      <Plus className="mr-1.5 size-4" />
      Novo item
    </DialogTrigger>
  ) : null

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {trigger}
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar item desejado' : 'Novo item desejado'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Atualize os dados para continuar acompanhando essa compra.'
              : 'Cadastre um produto que você quer acompanhar e comprar depois.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && <p className="text-destructive text-sm">{error}</p>}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Nome do produto</Label>
            <Input
              id="name"
              name="name"
              required
              placeholder="Ex: Kindle Paperwhite"
              defaultValue={item?.name}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Categoria da wishlist</Label>
            <Select
              items={categoryItems}
              value={selectedCategoryId}
              onValueChange={(value) => setSelectedCategoryId(value ?? 'none')}
            >
              <SelectTrigger>
                <SelectValue placeholder="Sem categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem categoria</SelectItem>
                {categoriesState.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="bg-muted/40 rounded-2xl border p-3">
            <Label htmlFor="newCategory" className="text-sm">
              Criar nova categoria rapidamente
            </Label>
            <div className="mt-2 flex gap-2">
              <Input
                id="newCategory"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="Ex: Leitura, Casa, Tecnologia"
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleCreateCategory}
                disabled={creatingCategory}
              >
                {creatingCategory ? 'Criando...' : 'Criar'}
              </Button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="desiredPrice">Preço desejado (R$)</Label>
              <MoneyInput
                id="desiredPrice"
                name="desiredPrice"
                placeholder="0,00"
                required
                defaultValue={formatCentsToInput(item?.desiredPrice)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="desiredPurchaseDate">Data desejada</Label>
              <Input
                id="desiredPurchaseDate"
                name="desiredPurchaseDate"
                type="date"
                defaultValue={formatDateInput(item?.desiredPurchaseDate)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="productUrl">Link do produto</Label>
            <Input
              id="productUrl"
              name="productUrl"
              type="url"
              placeholder="https://..."
              defaultValue={item?.productUrl ?? ''}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>Prioridade</Label>
              <Select
                items={priorityItems}
                value={priority}
                onValueChange={(value) => setPriority((value as typeof priority) ?? 'MEDIUM')}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Prioridade" />
                </SelectTrigger>
                <SelectContent>
                  {priorityOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Status</Label>
              <Select
                items={statusItems}
                value={status}
                onValueChange={(value) => setStatus((value as typeof status) ?? 'DESIRED')}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Salvando...' : isEdit ? 'Salvar alteracoes' : 'Criar item'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

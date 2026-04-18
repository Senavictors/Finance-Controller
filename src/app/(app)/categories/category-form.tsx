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
import { BrandPicker } from '@/lib/brands'

type Category = {
  id: string
  name: string
  type: string
  icon: string | null
  color: string | null
  parentId: string | null
}

type CategoryFormProps = {
  category?: Category
  categories: Category[]
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function CategoryForm({ category, categories, open, onOpenChange }: CategoryFormProps) {
  const router = useRouter()
  const [internalOpen, setInternalOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedType, setSelectedType] = useState(category?.type ?? 'EXPENSE')
  const [brandKey, setBrandKey] = useState<string | null>(category?.icon ?? null)
  const [color, setColor] = useState<string>(category?.color ?? '#3b82f6')

  const isControlled = open !== undefined
  const isOpen = isControlled ? open : internalOpen
  const setIsOpen = isControlled ? onOpenChange! : setInternalOpen
  const isEdit = !!category

  const parentOptions = categories.filter(
    (c) => c.type === selectedType && !c.parentId && c.id !== category?.id,
  )

  const typeItems: Record<string, string> = { INCOME: 'Receita', EXPENSE: 'Despesa' }
  const parentItems: Record<string, string> = {
    none: 'Nenhuma',
    ...Object.fromEntries(parentOptions.map((p) => [p.id, p.name])),
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const parentId = formData.get('parentId') as string

    const body: Record<string, unknown> = {
      name: formData.get('name') as string,
      color: color || undefined,
      icon: brandKey ?? null,
      parentId: parentId === 'none' ? null : parentId || undefined,
    }

    if (!isEdit) {
      body.type = formData.get('type') as string
    }

    try {
      const url = isEdit ? `/api/categories/${category.id}` : '/api/categories'
      const method = isEdit ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Erro ao salvar categoria')
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
      Nova Categoria
    </DialogTrigger>
  ) : null

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {trigger}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar Categoria' : 'Nova Categoria'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Altere os dados da categoria' : 'Preencha os dados para criar uma categoria'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && <p className="text-destructive text-sm">{error}</p>}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Nome</Label>
            <Input id="name" name="name" required defaultValue={category?.name} />
          </div>

          {!isEdit && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="type">Tipo</Label>
              <Select
                name="type"
                items={typeItems}
                defaultValue={selectedType}
                onValueChange={(v) => v && setSelectedType(v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="INCOME">Receita</SelectItem>
                  <SelectItem value="EXPENSE">Despesa</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="parentId">Categoria pai (opcional)</Label>
            <Select name="parentId" items={parentItems} defaultValue={category?.parentId ?? 'none'}>
              <SelectTrigger>
                <SelectValue placeholder="Nenhuma" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhuma</SelectItem>
                {parentOptions.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Marca/icone (opcional)</Label>
            <p className="text-xs text-gray-500">
              Util para assinaturas e servicos conhecidos. A cor continua sendo fallback.
            </p>
            <BrandPicker
              value={brandKey}
              onChange={setBrandKey}
              fallbackLabel={category?.name ?? 'Categoria'}
              fallbackColor={color}
              categories={['subscription', 'payment', 'bank', 'network']}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="color">Cor de fallback</Label>
            <Input
              id="color"
              name="color"
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-10 w-20"
            />
          </div>

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Salvando...' : isEdit ? 'Salvar' : 'Criar Categoria'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

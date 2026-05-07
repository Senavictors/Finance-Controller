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
import { Plus, Layers } from 'lucide-react'
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
  defaultType?: 'INCOME' | 'EXPENSE'
  // 'parent' = creating a root category (no parentId)
  // 'child'  = creating a subcategory (parentId required)
  // undefined = auto: uses existing category data when editing
  mode?: 'parent' | 'child'
}

export function CategoryForm({
  category,
  categories,
  open,
  onOpenChange,
  defaultType,
  mode,
}: CategoryFormProps) {
  const router = useRouter()
  const [internalOpen, setInternalOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const isControlled = open !== undefined
  const isOpen = isControlled ? open : internalOpen
  const setIsOpen = isControlled ? onOpenChange! : setInternalOpen
  const isEdit = !!category

  // When editing, derive mode from existing data
  const effectiveMode: 'parent' | 'child' = isEdit
    ? category.parentId
      ? 'child'
      : 'parent'
    : (mode ?? 'parent')

  const isChildMode = effectiveMode === 'child'

  const [selectedType, setSelectedType] = useState(category?.type ?? defaultType ?? 'EXPENSE')
  const [selectedParentId, setSelectedParentId] = useState<string>(category?.parentId ?? '')
  const [brandKey, setBrandKey] = useState<string | null>(category?.icon ?? null)
  const [color, setColor] = useState<string>(category?.color ?? '#3b82f6')

  // Parent type follows selected parent when in child mode
  const selectedParent = categories.find((c) => c.id === selectedParentId)
  const inheritedType = isChildMode && selectedParent ? selectedParent.type : selectedType

  const parentOptions = categories.filter(
    (c) => c.type === selectedType && !c.parentId && c.id !== category?.id,
  )

  const hasParentOptions = parentOptions.length > 0

  const typeItems: Record<string, string> = { INCOME: 'Receita', EXPENSE: 'Despesa' }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const formData = new FormData(e.currentTarget)

    const body: Record<string, unknown> = {
      name: formData.get('name') as string,
      color: color || undefined,
      icon: brandKey ?? null,
    }

    if (isChildMode) {
      if (!selectedParentId) {
        setError('Selecione uma categoria pai')
        setLoading(false)
        return
      }
      body.parentId = selectedParentId
      if (!isEdit) body.type = inheritedType
    } else {
      body.parentId = null
      if (!isEdit) body.type = selectedType
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

  const dialogTitle = isEdit
    ? 'Editar Categoria'
    : isChildMode
      ? 'Nova Subcategoria'
      : 'Nova Categoria'

  const dialogDescription = isEdit
    ? 'Altere os dados da categoria'
    : isChildMode
      ? 'Crie uma subcategoria vinculada a uma categoria pai'
      : 'Crie uma categoria principal para organizar suas finanças'

  const trigger = !isControlled ? (
    <DialogTrigger
      render={
        <Button variant={isChildMode ? 'outline' : 'action'} />
      }
    >
      {isChildMode ? (
        <>
          <Layers className="mr-1.5 size-4" />
          Nova Subcategoria
        </>
      ) : (
        <>
          <Plus className="mr-1.5 size-4 transition-transform duration-200 group-hover/button:rotate-90" />
          Nova Categoria
        </>
      )}
    </DialogTrigger>
  ) : null

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {trigger}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription>{dialogDescription}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && <p className="text-destructive text-sm">{error}</p>}

          {/* Parent selector — shown in child mode */}
          {isChildMode && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="parentId">Categoria pai</Label>
              {!hasParentOptions ? (
                <p className="text-muted-foreground rounded-xl border px-3 py-2 text-sm">
                  Nenhuma categoria pai disponível. Crie uma categoria principal primeiro.
                </p>
              ) : (
                <Select
                  name="parentId"
                  value={selectedParentId}
                  onValueChange={(v) => setSelectedParentId(v ?? '')}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a categoria pai" />
                  </SelectTrigger>
                  <SelectContent>
                    {parentOptions.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {/* Type selector — shown in parent mode when creating */}
          {!isChildMode && !isEdit && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="type">Tipo</Label>
              <Select
                name="type"
                items={typeItems}
                defaultValue={selectedType}
                onValueChange={(v) => v && setSelectedType(v as 'INCOME' | 'EXPENSE')}
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

          {/* Inherited type badge in child mode */}
          {isChildMode && selectedParent && (
            <p className="text-muted-foreground text-xs">
              Tipo herdado da categoria pai:{' '}
              <span className="font-medium">
                {selectedParent.type === 'INCOME' ? 'Receita' : 'Despesa'}
              </span>
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Nome</Label>
            <Input id="name" name="name" required defaultValue={category?.name} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Marca/ícone (opcional)</Label>
            <p className="text-muted-foreground text-xs">
              Útil para assinaturas e serviços conhecidos. A cor continua sendo fallback.
            </p>
            <BrandPicker
              value={brandKey}
              onChange={setBrandKey}
              fallbackLabel={category?.name ?? 'Categoria'}
              fallbackColor={color}
              categories={['subscription']}
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

          <Button
            type="submit"
            variant={isEdit ? 'save' : 'action'}
            disabled={loading || (isChildMode && !hasParentOptions && !isEdit)}
            className="w-full"
          >
            {loading ? 'Salvando...' : isEdit ? 'Salvar' : isChildMode ? 'Criar Subcategoria' : 'Criar Categoria'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

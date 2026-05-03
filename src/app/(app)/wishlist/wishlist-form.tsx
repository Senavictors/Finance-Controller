'use client'

import Image from 'next/image'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, Plus, X } from 'lucide-react'
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
  imageUrl: string | null
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

const ACCEPTED_MIME = 'image/jpeg,image/png,image/webp,image/avif'
const MAX_FILE_SIZE = 5 * 1024 * 1024

function formatDateInput(date?: Date | string | null) {
  if (!date) return ''
  return new Date(date).toISOString().split('T')[0]
}

function sortCategories(categories: WishlistCategory[]) {
  return [...categories].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}

export function WishlistForm({ categories, item, open, onOpenChange }: WishlistFormProps) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  // Image state
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(item?.imageUrl ?? null)
  const [imageRemoved, setImageRemoved] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)

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
    setImageFile(null)
    setImagePreview(item?.imageUrl ?? null)
    setImageRemoved(false)
  }, [item?.categoryId, item?.priority, item?.status, item?.imageUrl, isOpen])

  // Revoke object URL on unmount or when file changes
  useEffect(() => {
    return () => {
      if (imageFile) URL.revokeObjectURL(imagePreview ?? '')
    }
  }, [imageFile, imagePreview])

  const categoryItems = useMemo(
    () => ({
      none: 'Sem categoria',
      ...Object.fromEntries(categoriesState.map((category) => [category.id, category.name])),
    }),
    [categoriesState],
  )

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > MAX_FILE_SIZE) {
      setError('Imagem muito grande. Tamanho máximo: 5 MB.')
      e.target.value = ''
      return
    }

    setError(null)
    setImageFile(file)
    setImageRemoved(false)
    const objectUrl = URL.createObjectURL(file)
    setImagePreview(objectUrl)
  }

  function handleRemoveImage() {
    setImageFile(null)
    setImagePreview(null)
    setImageRemoved(true)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function uploadImage(file: File): Promise<string> {
    setUploadingImage(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/wishlist/upload', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro ao enviar imagem')
      return data.url as string
    } finally {
      setUploadingImage(false)
    }
  }

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

    const formElement = e.currentTarget

    try {
      let resolvedImageUrl: string | null | undefined = undefined

      if (imageFile) {
        resolvedImageUrl = await uploadImage(imageFile)
      } else if (imageRemoved) {
        resolvedImageUrl = null
      }

      const formData = new FormData(formElement)
      const body: Record<string, unknown> = {
        name: formData.get('name') as string,
        categoryId: selectedCategoryId === 'none' ? null : selectedCategoryId,
        desiredPrice: parseMoneyToCents(formData.get('desiredPrice') as string),
        productUrl: ((formData.get('productUrl') as string) || '').trim() || null,
        priority,
        status,
        desiredPurchaseDate: ((formData.get('desiredPurchaseDate') as string) || '').trim() || null,
      }

      if (resolvedImageUrl !== undefined) {
        body.imageUrl = resolvedImageUrl
      }

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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Algo deu errado. Tente novamente.')
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
    <DialogTrigger render={<Button variant="action" />}>
      <Plus className="mr-1.5 size-4 transition-transform duration-200 group-hover/button:rotate-90" />
      Novo item
    </DialogTrigger>
  ) : null

  const isBusy = loading || uploadingImage

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

          {/* Image upload */}
          <div className="flex flex-col gap-1.5">
            <Label>Imagem do produto (opcional)</Label>

            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_MIME}
              className="hidden"
              onChange={handleFileChange}
            />

            {imagePreview ? (
              <div className="group relative aspect-[4/3] w-full overflow-hidden rounded-2xl border bg-muted">
                <Image
                  src={imagePreview}
                  alt="Preview"
                  fill
                  className="object-cover"
                  sizes="(max-width: 640px) 100vw, 512px"
                  unoptimized={imagePreview.startsWith('blob:')}
                />
                <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/0 transition-colors group-hover:bg-black/30">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1.5 rounded-full bg-background/90 px-3 py-1.5 text-xs font-medium opacity-0 shadow transition-opacity group-hover:opacity-100"
                  >
                    <Camera className="size-3.5" />
                    Trocar
                  </button>
                  <button
                    type="button"
                    onClick={handleRemoveImage}
                    className="flex items-center gap-1.5 rounded-full bg-destructive/90 px-3 py-1.5 text-xs font-medium text-white opacity-0 shadow transition-opacity group-hover:opacity-100"
                  >
                    <X className="size-3.5" />
                    Remover
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed bg-muted/40 text-muted-foreground transition-colors hover:bg-muted/70"
              >
                <Camera className="size-8" />
                <span className="text-sm">Clique para adicionar uma foto</span>
              </button>
            )}

            <p className="text-muted-foreground text-xs">
              JPG, PNG, WebP ou AVIF · Máx. 5 MB
            </p>
          </div>

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
              <DatePicker
                id="desiredPurchaseDate"
                name="desiredPurchaseDate"
                placeholder="Sem data definida"
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

          <Button
            type="submit"
            variant={isEdit ? 'save' : 'action'}
            disabled={isBusy}
            className="w-full"
          >
            {uploadingImage ? 'Enviando imagem...' : loading ? 'Salvando...' : isEdit ? 'Salvar alterações' : 'Criar item'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

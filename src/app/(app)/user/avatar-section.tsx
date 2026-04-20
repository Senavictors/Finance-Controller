'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { getInitials, getUserChipPalette } from '@/lib/user-chip'

const MAX_BYTES = 300_000
const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

type Props = {
  initialImage: string | null
  initialName: string
  initialEmail: string
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export function AvatarSection({ initialImage, initialName, initialEmail }: Props) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(initialImage)
  const [dirty, setDirty] = useState(false)
  const [loading, setLoading] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null,
  )

  const palette = getUserChipPalette(initialEmail)
  const initials = getInitials(initialName || initialEmail)

  async function handleFile(file: File) {
    setFeedback(null)
    if (!ACCEPTED.includes(file.type)) {
      setFeedback({ type: 'error', message: 'Formato nao suportado. Use PNG, JPEG, WebP ou GIF.' })
      return
    }
    if (file.size > MAX_BYTES) {
      setFeedback({ type: 'error', message: 'Imagem muito grande. Limite de 300KB.' })
      return
    }
    const dataUrl = await readFileAsDataUrl(file)
    setPreview(dataUrl)
    setDirty(true)
  }

  function handleRemove() {
    setPreview(null)
    setDirty(true)
    setFeedback(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  async function handleSave() {
    setLoading(true)
    setFeedback(null)
    try {
      const res = await fetch('/api/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: initialName,
          email: initialEmail,
          image: preview,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setFeedback({ type: 'error', message: data.error ?? 'Erro ao salvar imagem' })
        return
      }
      setFeedback({ type: 'success', message: 'Imagem atualizada' })
      setDirty(false)
      router.refresh()
    } catch {
      setFeedback({ type: 'error', message: 'Erro de rede' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div
        className={cn(
          'flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border',
          palette.bg,
          palette.border,
          palette.text,
        )}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Avatar" className="size-full object-cover" />
        ) : (
          <span className="text-xl font-semibold tracking-tight">{initials}</span>
        )}
      </div>

      <div className="flex-1 space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={loading}
          >
            <Camera className="mr-1.5 size-3.5" />
            Escolher imagem
          </Button>
          {preview && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleRemove}
              disabled={loading}
            >
              <Trash2 className="mr-1.5 size-3.5" />
              Remover
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={loading || !dirty}
            className="ml-auto"
          >
            {loading ? 'Salvando...' : 'Salvar imagem'}
          </Button>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED.join(',')}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void handleFile(file)
          }}
        />

        {feedback && (
          <p
            className={
              feedback.type === 'success'
                ? 'text-sm font-medium text-emerald-600'
                : 'text-sm font-medium text-red-600'
            }
          >
            {feedback.message}
          </p>
        )}
      </div>
    </div>
  )
}

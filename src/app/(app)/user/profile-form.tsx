'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Props = {
  initialName: string
  initialEmail: string
}

export function ProfileForm({ initialName, initialEmail }: Props) {
  const router = useRouter()
  const [name, setName] = useState(initialName)
  const [email, setEmail] = useState(initialEmail)
  const [loading, setLoading] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null,
  )

  const dirty = name !== initialName || email !== initialEmail

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setFeedback(null)

    try {
      const res = await fetch('/api/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email }),
      })
      const data = await res.json()

      if (!res.ok) {
        setFeedback({ type: 'error', message: data.error ?? 'Erro ao salvar' })
        return
      }

      setFeedback({ type: 'success', message: 'Dados atualizados' })
      router.refresh()
    } catch {
      setFeedback({ type: 'error', message: 'Erro de rede' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="profile-name">Nome</Label>
          <Input
            id="profile-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={2}
            maxLength={100}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="profile-email">Email</Label>
          <Input
            id="profile-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            maxLength={255}
          />
        </div>
      </div>

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

      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={loading || !dirty}>
          {loading ? 'Salvando...' : 'Salvar alteracoes'}
        </Button>
      </div>
    </form>
  )
}

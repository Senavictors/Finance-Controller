'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function PasswordForm() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null,
  )

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)

    if (newPassword !== confirmPassword) {
      setFeedback({ type: 'error', message: 'Nova senha e confirmacao nao coincidem' })
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      })
      const data = await res.json()

      if (!res.ok) {
        setFeedback({ type: 'error', message: data.error ?? 'Erro ao alterar senha' })
        return
      }

      setFeedback({
        type: 'success',
        message: 'Senha atualizada. Sessoes em outros dispositivos foram encerradas.',
      })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch {
      setFeedback({ type: 'error', message: 'Erro de rede' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="current-password">Senha atual</Label>
        <Input
          id="current-password"
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
          autoComplete="current-password"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="new-password">Nova senha</Label>
          <Input
            id="new-password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={8}
            maxLength={72}
            autoComplete="new-password"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm-password">Confirmar nova senha</Label>
          <Input
            id="confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={8}
            maxLength={72}
            autoComplete="new-password"
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
        <Button type="submit" size="sm" disabled={loading}>
          {loading ? 'Alterando...' : 'Alterar senha'}
        </Button>
      </div>
    </form>
  )
}

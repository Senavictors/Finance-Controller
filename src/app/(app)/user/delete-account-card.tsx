'use client'

import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export function DeleteAccountCard() {
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setPassword('')
    setConfirmation('')
    setError(null)
  }

  async function handleDelete(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/auth/me', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, confirmation }),
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError(data.error ?? 'Erro ao excluir conta')
        setLoading(false)
        return
      }

      window.location.href = '/login'
    } catch {
      setError('Erro de rede')
      setLoading(false)
    }
  }

  return (
    <div className="flex items-start gap-4">
      <div className="flex size-10 items-center justify-center rounded-xl bg-red-100 text-red-600">
        <Trash2 className="size-4" />
      </div>
      <div className="flex-1">
        <h3 className="text-sm font-medium text-red-700">Excluir conta</h3>
        <p className="mt-1 text-sm text-red-600/80">
          Remove permanentemente sua conta, contas financeiras, categorias, transacoes, metas,
          recorrencias, cartoes e dashboards. Esta acao nao pode ser desfeita.
        </p>
        <Button
          variant="destructive"
          size="sm"
          className="mt-3 rounded-full"
          onClick={() => {
            reset()
            setOpen(true)
          }}
        >
          <Trash2 className="mr-1.5 size-3.5" />
          Excluir minha conta
        </Button>
      </div>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) reset()
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-700">Excluir conta permanentemente</DialogTitle>
            <DialogDescription>
              Para confirmar, informe sua senha e digite <strong>EXCLUIR</strong> abaixo. Todos os
              seus dados financeiros serao apagados imediatamente.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleDelete} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="delete-password">Senha atual</Label>
              <Input
                id="delete-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="delete-confirmation">Digite EXCLUIR</Label>
              <Input
                id="delete-confirmation"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                placeholder="EXCLUIR"
                required
              />
            </div>
            {error && <p className="text-sm font-medium text-red-600">{error}</p>}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setOpen(false)}
                disabled={loading}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                variant="destructive"
                size="sm"
                disabled={loading || confirmation !== 'EXCLUIR' || !password}
              >
                {loading ? 'Excluindo...' : 'Excluir definitivamente'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

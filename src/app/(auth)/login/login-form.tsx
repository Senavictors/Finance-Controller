'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

import { Banner, Button, Field, GlassCard } from '@/components/fc'

const INPUT_CLASS =
  'fc-text-body min-h-fc-touch w-full rounded-fc-sm border border-fc-rim bg-fc-glass px-4 text-fc-text outline-none placeholder:text-fc-text-3 focus-visible:border-fc-iris aria-invalid:border-fc-out'

type FieldErrors = Partial<Record<'email' | 'password', string[]>>

export function LoginForm({ callbackUrl }: { callbackUrl: string }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setFieldErrors({})
    setLoading(true)

    const formData = new FormData(event.currentTarget)
    const body = {
      email: String(formData.get('email') ?? ''),
      password: String(formData.get('password') ?? ''),
    }

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        if (data.details) setFieldErrors(data.details)
        else setError(data.error ?? 'Não foi possível entrar')
        return
      }

      router.replace(callbackUrl)
      router.refresh()
    } catch {
      setError('Algo deu errado. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <GlassCard variant="strong" padding="lg" as="section" aria-labelledby="login-title">
      <h1 id="login-title" className="fc-text-title text-fc-text">
        Entrar
      </h1>
      <p className="fc-text-sub text-fc-text-2 mt-1">Use o e-mail e a senha do dono da conta.</p>

      <form onSubmit={handleSubmit} noValidate className="mt-6 flex flex-col gap-4">
        {error ? (
          <Banner tone="out" title="Não foi possível entrar">
            {error}
          </Banner>
        ) : null}

        <Field label="E-mail" error={fieldErrors.email?.[0]}>
          {(control) => (
            <input
              {...control}
              name="email"
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              className={INPUT_CLASS}
            />
          )}
        </Field>

        <Field label="Senha" error={fieldErrors.password?.[0]}>
          {(control) => (
            <input
              {...control}
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className={INPUT_CLASS}
            />
          )}
        </Field>

        <Button type="submit" size="lg" loading={loading} className="w-full">
          {loading ? 'Entrando...' : 'Entrar'}
        </Button>
      </form>
    </GlassCard>
  )
}

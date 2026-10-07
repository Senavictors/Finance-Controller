import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { safeCallbackUrl } from '@/server/auth/redirect'
import { validateSession } from '@/server/auth/session'

import { LoginForm } from './login-form'

export const metadata: Metadata = {
  title: 'Entrar | Finance Controller',
}

type LoginPageProps = {
  searchParams: Promise<{ callbackUrl?: string | string[] }>
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams
  const raw = Array.isArray(params.callbackUrl) ? params.callbackUrl[0] : params.callbackUrl
  const callbackUrl = safeCallbackUrl(raw)

  // O proxy só vê a existência do cookie; aqui a sessão é validada no banco. Cookie obsoleto
  // cai no formulário (e é sobrescrito no próximo login) em vez de gerar laço de redirecionamento.
  if (await validateSession()) redirect(callbackUrl)

  return <LoginForm callbackUrl={callbackUrl} />
}

import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { validateSession } from '@/server/auth'
import { getAccountsService } from '@/server/modules/accounts/service'

import { AccountsView } from './accounts-view'

export const metadata: Metadata = { title: 'Contas' }

/**
 * `Mais > Contas`. Server Component fino: lê a lista do use-case (saldos e uso do limite vêm do
 * ledger) e entrega à tela; as mutações passam pelas rotas `/api/accounts/**`.
 */
export default async function ContasPage() {
  const session = await validateSession()
  if (!session) redirect('/login')

  const { accounts, totals } = await getAccountsService().listAccounts(session.userId, {
    includeArchived: true,
  })
  return <AccountsView accounts={accounts} totals={totals} />
}

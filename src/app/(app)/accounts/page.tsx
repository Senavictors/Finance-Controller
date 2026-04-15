import { validateSession } from '@/server/auth/session'
import { prisma } from '@/server/db'
import { redirect } from 'next/navigation'
import { AccountCard } from './account-card'
import { AccountForm } from './account-form'

export default async function AccountsPage() {
  const session = await validateSession()
  if (!session) redirect('/login')

  const accounts = await prisma.account.findMany({
    where: { userId: session.userId },
    orderBy: { name: 'asc' },
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Contas</h1>
        <AccountForm />
      </div>
      {accounts.length === 0 ? (
        <p className="text-muted-foreground">Nenhuma conta cadastrada.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map((account) => (
            <AccountCard key={account.id} account={account} />
          ))}
        </div>
      )}
    </div>
  )
}

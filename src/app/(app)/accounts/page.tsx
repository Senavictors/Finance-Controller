import { validateSession } from '@/server/auth/session'
import { prisma } from '@/server/db'
import { redirect } from 'next/navigation'
import { AccountCard } from './account-card'
import { AccountForm } from './account-form'
import { Wallet } from 'lucide-react'

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
        <h1 className="text-2xl font-semibold tracking-tight">Contas</h1>
        <AccountForm />
      </div>
      {accounts.length === 0 ? (
        <div className="border-border/60 flex flex-col items-center justify-center rounded-3xl border border-dashed py-16">
          <div className="bg-muted flex size-14 items-center justify-center rounded-2xl">
            <Wallet className="text-muted-foreground size-6" />
          </div>
          <p className="text-muted-foreground mt-4 text-sm font-medium">Nenhuma conta cadastrada</p>
          <p className="text-muted-foreground/60 mt-1 text-xs">
            Crie sua primeira conta para comecar
          </p>
        </div>
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

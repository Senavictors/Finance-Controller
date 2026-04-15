import { validateSession } from '@/server/auth/session'
import { prisma } from '@/server/db'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default async function DashboardPage() {
  const session = await validateSession()
  if (!session) redirect('/login')

  const [accountCount, categoryCount, transactionCount] = await Promise.all([
    prisma.account.count({ where: { userId: session.userId } }),
    prisma.category.count({ where: { userId: session.userId } }),
    prisma.transaction.count({ where: { userId: session.userId } }),
  ])

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-muted-foreground text-sm font-medium">Contas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{accountCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-muted-foreground text-sm font-medium">Categorias</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{categoryCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-muted-foreground text-sm font-medium">Transacoes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{transactionCount}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

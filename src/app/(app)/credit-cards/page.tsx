import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CreditCard, FileText } from 'lucide-react'
import { validateSession } from '@/server/auth/session'
import { prisma } from '@/server/db'
import { syncCreditCardStatementsForAccount } from '@/server/modules/finance/application/credit-card/billing'
import { formatCurrency, formatDate } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const statusLabels: Record<string, string> = {
  OPEN: 'Aberta',
  CLOSED: 'Fechada',
  PAID: 'Paga',
  OVERDUE: 'Atrasada',
}

const statusVariants: Record<string, 'secondary' | 'default' | 'destructive' | 'outline'> = {
  OPEN: 'secondary',
  CLOSED: 'outline',
  PAID: 'default',
  OVERDUE: 'destructive',
}

export default async function CreditCardsPage() {
  const session = await validateSession()
  if (!session) redirect('/login')

  const creditCardAccounts = await prisma.account.findMany({
    where: { userId: session.userId, type: 'CREDIT_CARD' },
    orderBy: { name: 'asc' },
  })

  await Promise.all(
    creditCardAccounts.map((account) => syncCreditCardStatementsForAccount(account.id)),
  )

  const [accounts, statements] = await Promise.all([
    prisma.account.findMany({
      where: { userId: session.userId, type: 'CREDIT_CARD' },
      include: {
        creditCardStatements: {
          orderBy: { dueDate: 'asc' },
          take: 1,
        },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.creditCardStatement.findMany({
      where: { userId: session.userId },
      include: {
        account: {
          select: { name: true, color: true, creditLimit: true },
        },
      },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
      take: 20,
    }),
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Faturas</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Acompanhe limite, fechamento, vencimento e status das faturas dos seus cartoes.
          </p>
        </div>
      </div>

      {accounts.length === 0 ? (
        <div className="border-border/60 flex flex-col items-center justify-center rounded-3xl border border-dashed py-16">
          <div className="bg-muted flex size-14 items-center justify-center rounded-2xl">
            <CreditCard className="text-muted-foreground size-6" />
          </div>
          <p className="text-muted-foreground mt-4 text-sm font-medium">
            Nenhum cartao de credito configurado
          </p>
          <p className="text-muted-foreground/60 mt-1 text-xs">
            Crie ou edite uma conta do tipo cartao para habilitar o billing.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            {accounts.map((account) => {
              const statement = account.creditCardStatements[0]
              const openAmount = statement
                ? Math.max(statement.totalAmount - statement.paidAmount, 0)
                : 0
              const usagePercent =
                account.creditLimit && account.creditLimit > 0
                  ? Math.round((openAmount / account.creditLimit) * 100)
                  : 0

              return (
                <Card key={account.id} className="rounded-[1.5rem] border-white/50 shadow-sm">
                  <CardHeader>
                    <CardTitle>{account.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <p className="text-xs text-gray-400">Limite</p>
                      <p className="text-lg font-semibold tracking-tight text-gray-900">
                        {account.creditLimit
                          ? formatCurrency(account.creditLimit)
                          : 'Nao configurado'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Fechamento e vencimento</p>
                      <p className="text-sm text-gray-700">
                        Dia {account.statementClosingDay ?? '-'} • Dia{' '}
                        {account.statementDueDay ?? '-'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Fatura atual</p>
                      <p className="text-lg font-semibold tracking-tight text-gray-900">
                        {statement ? formatCurrency(openAmount) : 'Sem fatura'}
                      </p>
                      {statement && (
                        <p className="mt-1 text-xs text-gray-500">
                          {usagePercent}% do limite • vence em {formatDate(statement.dueDate)}
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          <Card className="rounded-[1.5rem] border-white/50 shadow-sm">
            <CardHeader>
              <CardTitle>Historico de Faturas</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cartao</TableHead>
                    <TableHead>Periodo</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Pago</TableHead>
                    <TableHead className="text-right">Aberto</TableHead>
                    <TableHead className="text-right">Acao</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {statements.map((statement) => {
                    const openAmount = Math.max(statement.totalAmount - statement.paidAmount, 0)

                    return (
                      <TableRow key={statement.id}>
                        <TableCell>{statement.account.name}</TableCell>
                        <TableCell>
                          {formatDate(statement.periodStart)} - {formatDate(statement.periodEnd)}
                        </TableCell>
                        <TableCell>{formatDate(statement.dueDate)}</TableCell>
                        <TableCell>
                          <Badge variant={statusVariants[statement.status] ?? 'secondary'}>
                            {statusLabels[statement.status] ?? statement.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(statement.totalAmount)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(statement.paidAmount)}
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(openAmount)}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            render={<Link href={`/credit-cards/${statement.id}`} />}
                          >
                            <FileText className="mr-1.5 size-4" />
                            Detalhes
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

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
import { BrandIcon } from '@/lib/brands'
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
      orderBy: { name: 'asc' },
    }),
    prisma.creditCardStatement.findMany({
      where: { userId: session.userId },
      include: {
        account: {
          select: { name: true, color: true, icon: true, creditLimit: true },
        },
      },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
      take: 20,
    }),
  ])

  const statementsByAccount = new Map(
    accounts.map((account) => [
      account.id,
      statements.filter((statement) => statement.accountId === account.id),
    ]),
  )

  const actionableStatements = statements.filter((statement) => statement.status !== 'PAID')
  const totalOpenAmount = actionableStatements.reduce(
    (sum, statement) => sum + Math.max(statement.totalAmount - statement.paidAmount, 0),
    0,
  )
  const nextDueStatement = actionableStatements
    .slice()
    .sort((left, right) => left.dueDate.getTime() - right.dueDate.getTime())[0]
  const latestPaidStatement = statements
    .filter((statement) => statement.status === 'PAID')
    .slice()
    .sort((left, right) => right.dueDate.getTime() - left.dueDate.getTime())[0]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Faturas</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Acompanhe limite, fechamento, vencimento e status das faturas dos seus cartões.
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
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card className="ring-border/60 rounded-[1.5rem] shadow-sm">
              <CardHeader>
                <CardTitle>Faturas em aberto</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold tracking-tight">
                  {actionableStatements.length}
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  Abertas, fechadas ou atrasadas aguardando pagamento
                </p>
              </CardContent>
            </Card>

            <Card className="ring-border/60 rounded-[1.5rem] shadow-sm">
              <CardHeader>
                <CardTitle>Valor comprometido</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold tracking-tight">
                  {formatCurrency(totalOpenAmount)}
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  Soma do saldo em aberto nas faturas
                </p>
              </CardContent>
            </Card>

            <Card className="ring-border/60 rounded-[1.5rem] shadow-sm">
              <CardHeader>
                <CardTitle>Proximo vencimento</CardTitle>
              </CardHeader>
              <CardContent>
                {nextDueStatement ? (
                  <>
                    <p className="text-lg font-semibold tracking-tight">
                      {formatDate(nextDueStatement.dueDate)}
                    </p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {nextDueStatement.account.name}
                    </p>
                  </>
                ) : (
                  <p className="text-muted-foreground text-sm">Nenhuma fatura pendente</p>
                )}
              </CardContent>
            </Card>

            <Card className="ring-border/60 rounded-[1.5rem] shadow-sm">
              <CardHeader>
                <CardTitle>Ultima fatura paga</CardTitle>
              </CardHeader>
              <CardContent>
                {latestPaidStatement ? (
                  <>
                    <p className="text-lg font-semibold tracking-tight">
                      {formatCurrency(latestPaidStatement.totalAmount)}
                    </p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {latestPaidStatement.account.name} • vencimento em{' '}
                      {formatDate(latestPaidStatement.dueDate)}
                    </p>
                  </>
                ) : (
                  <p className="text-muted-foreground text-sm">Ainda nao existe fatura quitada</p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {accounts.map((account) => {
              const accountStatements = statementsByAccount.get(account.id) ?? []
              const currentStatement =
                accountStatements.find((statement) => statement.status !== 'PAID') ??
                accountStatements[0] ??
                null
              const lastPaidStatement = accountStatements
                .filter((statement) => statement.status === 'PAID')
                .slice()
                .sort((left, right) => right.dueDate.getTime() - left.dueDate.getTime())[0]
              const openAmount = currentStatement
                ? Math.max(currentStatement.totalAmount - currentStatement.paidAmount, 0)
                : 0
              const usagePercent =
                account.creditLimit && account.creditLimit > 0
                  ? Math.round((openAmount / account.creditLimit) * 100)
                  : 0

              return (
                <Card key={account.id} className="ring-border/60 rounded-[1.5rem] shadow-sm">
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <BrandIcon
                        brandKey={account.icon}
                        fallbackLabel={account.name}
                        fallbackText={account.name}
                        fallbackColor={account.color}
                        size={40}
                        radius="md"
                      />
                      <CardTitle>{account.name}</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <p className="text-muted-foreground text-xs">Limite</p>
                      <p className="text-foreground text-lg font-semibold tracking-tight">
                        {account.creditLimit
                          ? formatCurrency(account.creditLimit)
                          : 'Não configurado'}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Fechamento e vencimento</p>
                      <p className="text-foreground/85 text-sm">
                        Dia {account.statementClosingDay ?? '-'} • Dia{' '}
                        {account.statementDueDay ?? '-'}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Fatura em destaque</p>
                      <p className="text-foreground text-lg font-semibold tracking-tight">
                        {currentStatement ? formatCurrency(openAmount) : 'Sem fatura'}
                      </p>
                      {currentStatement ? (
                        <>
                          <div className="mt-2 flex items-center gap-2">
                            <Badge variant={statusVariants[currentStatement.status] ?? 'secondary'}>
                              {statusLabels[currentStatement.status] ?? currentStatement.status}
                            </Badge>
                            <span className="text-muted-foreground text-xs">
                              vence em {formatDate(currentStatement.dueDate)}
                            </span>
                          </div>
                          <p className="text-muted-foreground mt-1 text-xs">
                            {usagePercent}% do limite
                          </p>
                        </>
                      ) : (
                        <p className="text-muted-foreground mt-1 text-xs">
                          Faca a primeira compra para gerar uma fatura
                        </p>
                      )}
                    </div>

                    <div>
                      <p className="text-muted-foreground text-xs">Ultima fatura quitada</p>
                      <p className="text-foreground/85 text-sm">
                        {lastPaidStatement
                          ? `${formatCurrency(lastPaidStatement.totalAmount)} • vencimento ${formatDate(lastPaidStatement.dueDate)}`
                          : 'Nenhuma fatura paga ainda'}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          <Card className="ring-border/60 rounded-[1.5rem] shadow-sm">
            <CardHeader>
              <CardTitle>Historico de Faturas</CardTitle>
            </CardHeader>
            <CardContent>
              {statements.length === 0 ? (
                <div className="text-muted-foreground text-sm">
                  Nenhuma fatura foi gerada ainda para os cartões cadastrados.
                </div>
              ) : (
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
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <BrandIcon
                                brandKey={statement.account.icon}
                                fallbackLabel={statement.account.name}
                                fallbackText={statement.account.name}
                                fallbackColor={statement.account.color}
                                size={24}
                                radius="sm"
                              />
                              {statement.account.name}
                            </div>
                          </TableCell>
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
                              nativeButton={false}
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
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

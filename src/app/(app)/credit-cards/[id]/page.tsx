import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { validateSession } from '@/server/auth/session'
import { prisma } from '@/server/db'
import { refreshCreditCardStatement } from '@/server/modules/finance/application/credit-card/billing'
import { formatCurrency, formatDate } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatementPaymentForm } from './statement-payment-form'
import { StatementTransactionsList } from './statement-transactions-list'
import { BrandIcon } from '@/lib/brands'

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

type Props = {
  params: Promise<{ id: string }>
}

export default async function CreditCardStatementPage({ params }: Props) {
  const session = await validateSession()
  if (!session) redirect('/login')
  const { id } = await params

  await refreshCreditCardStatement(id)

  const [statement, sourceAccounts] = await Promise.all([
    prisma.creditCardStatement.findFirst({
      where: { id, userId: session.userId },
      include: {
        account: {
          select: {
            id: true,
            name: true,
            color: true,
            icon: true,
            creditLimit: true,
            statementClosingDay: true,
            statementDueDay: true,
          },
        },
        transactions: {
          include: {
            category: { select: { name: true, color: true, icon: true } },
          },
          orderBy: { date: 'desc' },
        },
      },
    }),
    prisma.account.findMany({
      where: {
        userId: session.userId,
        isArchived: false,
        type: { not: 'CREDIT_CARD' },
      },
      select: { id: true, name: true, type: true },
      orderBy: { name: 'asc' },
    }),
  ])

  if (!statement) notFound()

  const availableSourceAccounts = sourceAccounts
    .filter((account) => account.id !== statement.account.id)
    .map((account) => ({ id: account.id, name: account.name }))

  const openAmount = Math.max(statement.totalAmount - statement.paidAmount, 0)
  const purchases = statement.transactions.filter((transaction) => transaction.type === 'EXPENSE')
  const payments = statement.transactions.filter((transaction) => transaction.type === 'TRANSFER')
  const usagePercent =
    statement.account.creditLimit && statement.account.creditLimit > 0
      ? Math.round((statement.totalAmount / statement.account.creditLimit) * 100)
      : null
  const latestPayment = payments
    .slice()
    .sort((left, right) => right.date.getTime() - left.date.getTime())[0]

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<Link href="/credit-cards" />}
        >
          <ChevronLeft className="mr-1.5 size-4" />
          Voltar
        </Button>
        <BrandIcon
          brandKey={statement.account.icon}
          fallbackLabel={statement.account.name}
          fallbackText={statement.account.name}
          fallbackColor={statement.account.color}
          size={44}
          radius="md"
        />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{statement.account.name}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Periodo {formatDate(statement.periodStart)} - {formatDate(statement.periodEnd)}
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        <Card className="ring-border/60 rounded-[1.5rem] shadow-sm">
          <CardHeader>
            <CardTitle>Status</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant={statusVariants[statement.status] ?? 'secondary'}>
              {statusLabels[statement.status] ?? statement.status}
            </Badge>
          </CardContent>
        </Card>
        <Card className="ring-border/60 rounded-[1.5rem] shadow-sm">
          <CardHeader>
            <CardTitle>Total</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold tracking-tight">
            {formatCurrency(statement.totalAmount)}
          </CardContent>
        </Card>
        <Card className="ring-border/60 rounded-[1.5rem] shadow-sm">
          <CardHeader>
            <CardTitle>Pago</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold tracking-tight">
            {formatCurrency(statement.paidAmount)}
          </CardContent>
        </Card>
        <Card className="ring-border/60 rounded-[1.5rem] shadow-sm">
          <CardHeader>
            <CardTitle>Em aberto</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold tracking-tight">
            {formatCurrency(openAmount)}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Card className="ring-border/60 rounded-[1.5rem] shadow-sm">
          <CardHeader>
            <CardTitle>Resumo da Fatura</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Fechamento</span>
              <span>{formatDate(statement.closingDate)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Vencimento</span>
              <span>{formatDate(statement.dueDate)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Limite do cartao</span>
              <span>
                {statement.account.creditLimit
                  ? formatCurrency(statement.account.creditLimit)
                  : 'Não configurado'}
              </span>
            </div>
            {usagePercent != null && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Utilizacao do limite</span>
                <span>{usagePercent}%</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Compras</span>
              <span>{purchases.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Pagamentos</span>
              <span>{payments.length}</span>
            </div>
            {latestPayment && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Ultimo pagamento</span>
                <span>{formatDate(latestPayment.date)}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="ring-border/60 rounded-[1.5rem] shadow-sm">
          <CardHeader>
            <CardTitle>Pagamento da Fatura</CardTitle>
          </CardHeader>
          <CardContent>
            {openAmount <= 0 ? (
              <div className="space-y-2 text-sm">
                <p className="font-medium text-emerald-700 dark:text-emerald-300">
                  Esta fatura ja esta quitada.
                </p>
                <p className="text-muted-foreground">
                  Nenhum pagamento adicional e necessario para este periodo.
                </p>
              </div>
            ) : availableSourceAccounts.length === 0 ? (
              <div className="space-y-2 text-sm">
                <p className="font-medium text-amber-700 dark:text-amber-300">
                  Nenhuma conta de origem disponivel.
                </p>
                <p className="text-muted-foreground">
                  Cadastre uma conta corrente, carteira ou investimento para registrar o pagamento
                  desta fatura.
                </p>
              </div>
            ) : (
              <>
                <p className="text-muted-foreground mb-4 text-sm">
                  Registre um pagamento total ou parcial usando uma conta de origem.
                </p>
                <StatementPaymentForm
                  statementId={statement.id}
                  cardName={statement.account.name}
                  openAmount={openAmount}
                  sourceAccounts={availableSourceAccounts}
                />
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="ring-border/60 rounded-[1.5rem] shadow-sm">
        <CardHeader>
          <CardTitle>Movimentacoes da Fatura</CardTitle>
        </CardHeader>
        <CardContent>
          <StatementTransactionsList
            transactions={statement.transactions.map((transaction) => ({
              id: transaction.id,
              type: transaction.type,
              description: transaction.description,
              date: transaction.date,
              amount: transaction.amount,
              category: transaction.category,
            }))}
            accountIcon={statement.account.icon}
          />
        </CardContent>
      </Card>
    </div>
  )
}

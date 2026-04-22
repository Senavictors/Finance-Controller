import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'
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
import {
  BrandChip,
  BrandIcon,
  getCreditCardBrandAccentStyle,
  getCreditCardBrandChipStyle,
  getCreditCardBrandGlowStyle,
  getCreditCardBrandSurfaceStyle,
  getCreditCardBrandTheme,
} from '@/lib/brands'

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

function BrandThemedCard({
  title,
  children,
  className,
  contentClassName,
  style,
  accentStyle,
  glowStyle,
}: {
  title: string
  children: ReactNode
  className?: string
  contentClassName?: string
  style?: CSSProperties
  accentStyle?: CSSProperties
  glowStyle?: CSSProperties
}) {
  return (
    <Card className={className} style={style}>
      {style && accentStyle && (
        <>
          <div className="absolute inset-x-0 top-0 h-1.5" style={accentStyle} />
          <div
            className="absolute -top-10 -right-6 size-28 rounded-full blur-3xl"
            style={glowStyle}
          />
        </>
      )}
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className={contentClassName}>{children}</CardContent>
    </Card>
  )
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
            networkBrandKey: true,
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
  const brandTheme = getCreditCardBrandTheme(statement.account.icon)
  const summaryCardStyle = getCreditCardBrandSurfaceStyle(brandTheme)
  const accentStyle = getCreditCardBrandAccentStyle(brandTheme)
  const glowStyle = getCreditCardBrandGlowStyle(brandTheme)
  const chipStyle = getCreditCardBrandChipStyle(brandTheme)
  const latestPayment = payments
    .slice()
    .sort((left, right) => right.date.getTime() - left.date.getTime())[0]
  const themedCardClassName = 'ring-border/60 relative rounded-[1.5rem] shadow-sm'
  const themedContentClassName = 'relative'

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
            Período {formatDate(statement.periodStart)} - {formatDate(statement.periodEnd)}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {statement.account.icon && (
              <BrandChip
                brandKey={statement.account.icon}
                fallbackLabel="Banco emissor"
                fallbackText={statement.account.name}
                fallbackColor={statement.account.color}
                style={chipStyle}
              />
            )}
            {statement.account.networkBrandKey && (
              <BrandChip
                brandKey={statement.account.networkBrandKey}
                fallbackLabel="Bandeira"
                fallbackText={statement.account.name}
                fallbackColor={statement.account.color}
                style={chipStyle}
              />
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        <BrandThemedCard
          title="Status"
          className={themedCardClassName}
          contentClassName={themedContentClassName}
          style={summaryCardStyle}
          accentStyle={accentStyle}
          glowStyle={glowStyle}
        >
          <Badge variant={statusVariants[statement.status] ?? 'secondary'}>
            {statusLabels[statement.status] ?? statement.status}
          </Badge>
        </BrandThemedCard>

        <BrandThemedCard
          title="Total"
          className={themedCardClassName}
          contentClassName={`${themedContentClassName} text-xl font-semibold tracking-tight`}
          style={summaryCardStyle}
          accentStyle={accentStyle}
          glowStyle={glowStyle}
        >
          {formatCurrency(statement.totalAmount)}
        </BrandThemedCard>

        <BrandThemedCard
          title="Pago"
          className={themedCardClassName}
          contentClassName={`${themedContentClassName} text-xl font-semibold tracking-tight`}
          style={summaryCardStyle}
          accentStyle={accentStyle}
          glowStyle={glowStyle}
        >
          {formatCurrency(statement.paidAmount)}
        </BrandThemedCard>

        <BrandThemedCard
          title="Em aberto"
          className={themedCardClassName}
          contentClassName={`${themedContentClassName} text-xl font-semibold tracking-tight`}
          style={summaryCardStyle}
          accentStyle={accentStyle}
          glowStyle={glowStyle}
        >
          {formatCurrency(openAmount)}
        </BrandThemedCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <BrandThemedCard
          title="Resumo da Fatura"
          className={themedCardClassName}
          contentClassName={`${themedContentClassName} space-y-3 text-sm`}
          style={summaryCardStyle}
          accentStyle={accentStyle}
          glowStyle={glowStyle}
        >
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Fechamento</span>
            <span>{formatDate(statement.closingDate)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Vencimento</span>
            <span>{formatDate(statement.dueDate)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Limite do cartão</span>
            <span>
              {statement.account.creditLimit
                ? formatCurrency(statement.account.creditLimit)
                : 'Não configurado'}
            </span>
          </div>
          {usagePercent != null && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Utilização do limite</span>
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
        </BrandThemedCard>

        <BrandThemedCard
          title="Pagamento da Fatura"
          className={themedCardClassName}
          contentClassName={themedContentClassName}
          style={summaryCardStyle}
          accentStyle={accentStyle}
          glowStyle={glowStyle}
        >
          {openAmount <= 0 ? (
            <div className="space-y-2 text-sm">
              <p className="font-medium text-emerald-700 dark:text-emerald-300">
                Esta fatura ja esta quitada.
              </p>
              <p className="text-muted-foreground">
                Nenhum pagamento adicional e necessário para este período.
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
        </BrandThemedCard>
      </div>

      <BrandThemedCard
        title="Movimentacoes da Fatura"
        className={themedCardClassName}
        contentClassName={themedContentClassName}
        style={summaryCardStyle}
        accentStyle={accentStyle}
        glowStyle={glowStyle}
      >
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
      </BrandThemedCard>
    </div>
  )
}

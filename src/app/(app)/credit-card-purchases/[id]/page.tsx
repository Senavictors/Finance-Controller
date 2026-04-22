import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ChevronLeft, ReceiptText } from 'lucide-react'
import { validateSession } from '@/server/auth/session'
import { getCreditCardPurchaseDetail } from '@/server/modules/finance/application/credit-card-purchases'
import { formatCurrency, formatDate } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BrandChip, BrandIcon } from '@/lib/brands'
import { AdvanceInstallmentsForm } from './advance-installments-form'

type Props = {
  params: Promise<{ id: string }>
}

export default async function CreditCardPurchaseDetailPage({ params }: Props) {
  const session = await validateSession()
  if (!session) redirect('/login')

  const { id } = await params

  let purchase: Awaited<ReturnType<typeof getCreditCardPurchaseDetail>>
  try {
    purchase = await getCreditCardPurchaseDetail(id, session.userId)
  } catch {
    notFound()
  }

  const totalDiscount = purchase.advances.reduce(
    (sum, advance) => sum + advance.totalDiscountAmount,
    0,
  )
  const advancedInstallments = purchase.installments.filter((installment) => installment.advance)
  const futureInstallments = purchase.installments.filter(
    (installment) => installment.advance == null && installment.currentDate > new Date(),
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<Link href="/transactions" />}
        >
          <ChevronLeft className="mr-1.5 size-4" />
          Voltar
        </Button>
        <BrandIcon
          brandKey={purchase.account.icon}
          fallbackLabel={purchase.account.name}
          fallbackText={purchase.account.name}
          fallbackColor={purchase.account.color}
          size={44}
          radius="md"
        />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{purchase.description}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Compra registrada em {formatDate(purchase.purchaseDate)}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <BrandChip
              brandKey={purchase.account.icon}
              fallbackLabel="Cartao"
              fallbackText={purchase.account.name}
              fallbackColor={purchase.account.color}
            />
            {purchase.account.networkBrandKey && (
              <BrandChip
                brandKey={purchase.account.networkBrandKey}
                fallbackLabel="Bandeira"
                fallbackText={purchase.account.name}
                fallbackColor={purchase.account.color}
              />
            )}
            {purchase.category && <Badge variant="outline">{purchase.category.name}</Badge>}
            {purchase.wishlistItem && <Badge variant="secondary">Originada da wishlist</Badge>}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        <Card className="rounded-[1.5rem] shadow-sm">
          <CardHeader>
            <CardTitle>Total</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold tracking-tight">
            {formatCurrency(purchase.totalAmount)}
          </CardContent>
        </Card>
        <Card className="rounded-[1.5rem] shadow-sm">
          <CardHeader>
            <CardTitle>Parcelas</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold tracking-tight">
            {purchase.installmentCount}
          </CardContent>
        </Card>
        <Card className="rounded-[1.5rem] shadow-sm">
          <CardHeader>
            <CardTitle>Adiantadas</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold tracking-tight">
            {advancedInstallments.length}
          </CardContent>
        </Card>
        <Card className="rounded-[1.5rem] shadow-sm">
          <CardHeader>
            <CardTitle>Desconto total</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold tracking-tight">
            {formatCurrency(totalDiscount)}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Card className="rounded-[1.5rem] shadow-sm">
          <CardHeader>
            <CardTitle>Resumo da Compra</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Conta</span>
              <span>{purchase.account.name}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Forma</span>
              <span>
                {purchase.installmentCount === 1 ? 'A vista' : `${purchase.installmentCount}x`}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Fonte</span>
              <span>{purchase.source === 'WISHLIST' ? 'Wishlist' : 'Cadastro manual'}</span>
            </div>
            {purchase.notes && (
              <div className="space-y-1">
                <p className="text-muted-foreground">Notas</p>
                <p>{purchase.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-[1.5rem] shadow-sm">
          <CardHeader>
            <CardTitle>Adiantamento</CardTitle>
          </CardHeader>
          <CardContent>
            {futureInstallments.length === 0 ? (
              <div className="text-muted-foreground text-sm">
                Nenhuma parcela futura disponivel para adiantamento.
              </div>
            ) : (
              <AdvanceInstallmentsForm purchaseId={purchase.id} installments={futureInstallments} />
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-[1.5rem] shadow-sm">
        <CardHeader>
          <CardTitle>Parcelas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {purchase.installments.map((installment) => (
            <div key={installment.id} className="rounded-2xl border px-4 py-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">
                      Parcela {installment.installmentNumber}/{purchase.installmentCount}
                    </p>
                    {installment.advance && <Badge variant="secondary">Adiantada</Badge>}
                    {installment.creditCardStatement && (
                      <Link href={`/credit-cards/${installment.creditCardStatement.id}`}>
                        <Badge variant="outline">
                          Fatura {formatDate(installment.creditCardStatement.dueDate)}
                        </Badge>
                      </Link>
                    )}
                  </div>
                  <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-2 text-xs">
                    <span>Original: {formatDate(installment.originalDate)}</span>
                    <span>&middot;</span>
                    <span>Atual: {formatDate(installment.currentDate)}</span>
                  </div>
                </div>
                <div className="grid gap-1 text-right text-sm">
                  <span>Original: {formatCurrency(installment.originalAmount)}</span>
                  <span className="font-semibold">
                    Atual: {formatCurrency(installment.currentAmount)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="rounded-[1.5rem] shadow-sm">
        <CardHeader>
          <CardTitle>Historico de Adiantamentos</CardTitle>
        </CardHeader>
        <CardContent>
          {purchase.advances.length === 0 ? (
            <div className="text-muted-foreground text-sm">
              Nenhum adiantamento registrado para esta compra.
            </div>
          ) : (
            <div className="space-y-3">
              {purchase.advances.map((advance) => (
                <div key={advance.id} className="rounded-2xl border px-4 py-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2">
                      <ReceiptText className="text-muted-foreground size-4" />
                      <div>
                        <p className="text-sm font-medium">{formatDate(advance.advancedAt)}</p>
                        <p className="text-muted-foreground text-xs">
                          Original {formatCurrency(advance.totalOriginalAmount)} · Pago{' '}
                          {formatCurrency(advance.totalPaidAmount)}
                        </p>
                      </div>
                    </div>
                    <Badge variant="secondary">
                      Desconto {formatCurrency(advance.totalDiscountAmount)}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

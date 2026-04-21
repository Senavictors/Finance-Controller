import { redirect } from 'next/navigation'
import { ShoppingBag } from 'lucide-react'
import { validateSession } from '@/server/auth/session'
import { prisma } from '@/server/db'
import { formatCurrency } from '@/lib/format'
import { wishlistItemQuerySchema } from '@/server/modules/finance/http'
import {
  listWishlistCategories,
  listWishlistItems,
} from '@/server/modules/finance/application/wishlist'
import { WishlistCard } from './wishlist-card'
import { WishlistFilters } from './wishlist-filters'
import { WishlistForm } from './wishlist-form'

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const statusOrder = ['READY_TO_BUY', 'MONITORING', 'DESIRED', 'PURCHASED', 'CANCELED'] as const

const statusLabels: Record<(typeof statusOrder)[number], string> = {
  READY_TO_BUY: 'Pronto para comprar',
  MONITORING: 'Monitorando',
  DESIRED: 'Desejado',
  PURCHASED: 'Comprado',
  CANCELED: 'Cancelado',
}

export default async function WishlistPage({ searchParams }: Props) {
  const session = await validateSession()
  if (!session) redirect('/login')

  const params = await searchParams
  const parsedFilters = wishlistItemQuerySchema.safeParse({
    status: typeof params.status === 'string' ? params.status : undefined,
    priority: typeof params.priority === 'string' ? params.priority : undefined,
    categoryId: typeof params.categoryId === 'string' ? params.categoryId : undefined,
    q: typeof params.q === 'string' ? params.q : undefined,
  })

  const filters = parsedFilters.success ? parsedFilters.data : {}

  const [items, wishlistCategories, accounts, expenseCategories] = await Promise.all([
    listWishlistItems(session.userId, filters),
    listWishlistCategories(session.userId),
    prisma.account.findMany({
      where: { userId: session.userId, isArchived: false },
      select: { id: true, name: true, type: true, color: true, icon: true },
      orderBy: { name: 'asc' },
    }),
    prisma.category.findMany({
      where: { userId: session.userId, type: 'EXPENSE' },
      select: { id: true, name: true, color: true, icon: true },
      orderBy: { name: 'asc' },
    }),
  ])

  const activeItems = items.filter((item) => !['PURCHASED', 'CANCELED'].includes(item.status))
  const plannedBudget = activeItems.reduce((sum, item) => sum + item.desiredPrice, 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="bg-primary/10 flex size-10 items-center justify-center rounded-xl">
            <ShoppingBag className="text-primary size-5" />
          </div>
          <div>
            <h1 className="text-foreground text-xl font-semibold">Lista de Desejos</h1>
            <p className="text-muted-foreground text-sm">
              {items.length === 0
                ? 'Nenhum item cadastrado'
                : `${activeItems.length} item${activeItems.length !== 1 ? 's' : ''} ativo${activeItems.length !== 1 ? 's' : ''} · ${formatCurrency(plannedBudget)} em compras planejadas`}
            </p>
          </div>
        </div>

        <WishlistForm categories={wishlistCategories} />
      </div>

      <WishlistFilters categories={wishlistCategories} />

      {items.length === 0 ? (
        <div className="border-border/60 bg-muted/40 flex flex-col items-center justify-center rounded-[2rem] border border-dashed py-16 text-center">
          <ShoppingBag className="text-muted-foreground/60 mb-3 size-10" />
          <p className="text-foreground/80 font-medium">Nenhum item na wishlist</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Cadastre produtos, acompanhe prioridade e transforme a compra em despesa real quando for
            a hora.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {statusOrder.map((status) => {
            const sectionItems = items.filter((item) => item.status === status)
            if (sectionItems.length === 0) return null

            return (
              <section key={status}>
                <h2 className="text-muted-foreground mb-3 text-sm font-medium tracking-wide uppercase">
                  {statusLabels[status]} ({sectionItems.length})
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {sectionItems.map((item) => (
                    <WishlistCard
                      key={item.id}
                      item={item}
                      categories={wishlistCategories}
                      accounts={accounts}
                      expenseCategories={expenseCategories}
                    />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}

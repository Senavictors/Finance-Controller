import { validateSession } from '@/server/auth/session'
import { prisma } from '@/server/db'
import { redirect } from 'next/navigation'
import { CategoryForm } from './category-form'
import { CategoriesContent } from './categories-content'

export default async function CategoriesPage() {
  const session = await validateSession()
  if (!session) redirect('/login')

  const categories = await prisma.category.findMany({
    where: { userId: session.userId },
    include: { _count: { select: { children: true, transactions: true } } },
    orderBy: { name: 'asc' },
  })

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Categorias</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Gerencie suas categorias de receitas e despesas de forma organizada.
          </p>
        </div>
        <CategoryForm categories={categories} />
      </div>

      <CategoriesContent categories={categories} />
    </div>
  )
}

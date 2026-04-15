import { validateSession } from '@/server/auth/session'
import { prisma } from '@/server/db'
import { redirect } from 'next/navigation'
import { CategoryList } from './category-list'
import { CategoryForm } from './category-form'

export default async function CategoriesPage() {
  const session = await validateSession()
  if (!session) redirect('/login')

  const categories = await prisma.category.findMany({
    where: { userId: session.userId },
    include: { _count: { select: { children: true, transactions: true } } },
    orderBy: { name: 'asc' },
  })

  const incomeCategories = categories.filter((c) => c.type === 'INCOME')
  const expenseCategories = categories.filter((c) => c.type === 'EXPENSE')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Categorias</h1>
        <CategoryForm categories={categories} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <h2 className="text-success text-lg font-semibold">Receitas</h2>
          {incomeCategories.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhuma categoria de receita.</p>
          ) : (
            <CategoryList categories={incomeCategories} allCategories={categories} />
          )}
        </div>
        <div className="space-y-3">
          <h2 className="text-destructive text-lg font-semibold">Despesas</h2>
          {expenseCategories.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhuma categoria de despesa.</p>
          ) : (
            <CategoryList categories={expenseCategories} allCategories={categories} />
          )}
        </div>
      </div>
    </div>
  )
}

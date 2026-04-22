import { validateSession } from '@/server/auth/session'
import { prisma } from '@/server/db'
import { redirect } from 'next/navigation'
import { CategoryListCard } from './category-list-card'
import { CategoryForm } from './category-form'
import { Tag } from 'lucide-react'

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
        <h1 className="text-2xl font-semibold tracking-tight">Categorias</h1>
        <CategoryForm categories={categories} />
      </div>

      {categories.length === 0 ? (
        <div className="border-border/60 flex flex-col items-center justify-center rounded-3xl border border-dashed py-16">
          <div className="bg-muted flex size-14 items-center justify-center rounded-2xl">
            <Tag className="text-muted-foreground size-6" />
          </div>
          <p className="text-muted-foreground mt-4 text-sm font-medium">
            Nenhuma categoria cadastrada
          </p>
          <p className="text-muted-foreground/60 mt-1 text-xs">
            Crie categorias para organizar suas transações
          </p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Receitas" color="text-success">
            {incomeCategories.length === 0 ? (
              <p className="text-muted-foreground px-3 py-4 text-sm">
                Nenhuma categoria de receita
              </p>
            ) : (
              <CategoryListCard
                categories={incomeCategories}
                allCategories={categories}
                dialogTitle="Todas as categorias de receita"
              />
            )}
          </Card>
          <Card title="Despesas" color="text-destructive">
            {expenseCategories.length === 0 ? (
              <p className="text-muted-foreground px-3 py-4 text-sm">
                Nenhuma categoria de despesa
              </p>
            ) : (
              <CategoryListCard
                categories={expenseCategories}
                allCategories={categories}
                dialogTitle="Todas as categorias de despesa"
              />
            )}
          </Card>
        </div>
      )}
    </div>
  )
}

function Card({
  title,
  color,
  children,
}: {
  title: string
  color: string
  children: React.ReactNode
}) {
  return (
    <div className="border-border/50 bg-card rounded-2xl border p-4 shadow-sm">
      <h2 className={`mb-3 text-sm font-semibold tracking-wider uppercase ${color}`}>{title}</h2>
      {children}
    </div>
  )
}

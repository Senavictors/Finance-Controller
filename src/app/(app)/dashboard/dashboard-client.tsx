'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency, formatDate } from '@/lib/format'
import { TrendingDown, TrendingUp, ArrowLeftRight, Wallet } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'

type Props = {
  userName: string
  totalIncome: number
  totalExpenses: number
  incomeVariation: number
  expenseVariation: number
  transactionCount: number
  expensesByCategory: { name: string; color: string; value: number }[]
  balanceByAccount: { name: string; color: string; balance: number }[]
  recentTransactions: {
    id: string
    description: string
    amount: number
    type: string
    date: string
    account: { name: string; color: string | null }
    category: { name: string; color: string | null } | null
  }[]
}

function VariationBadge({ value }: { value: number }) {
  if (value === 0) return null
  const isPositive = value > 0
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        isPositive ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive',
      )}
    >
      {isPositive ? '+' : ''}
      {value}%
    </span>
  )
}

export function DashboardClient({
  userName,
  totalIncome,
  totalExpenses,
  incomeVariation,
  expenseVariation,
  transactionCount,
  expensesByCategory,
  balanceByAccount,
  recentTransactions,
}: Props) {
  const balance = totalIncome - totalExpenses

  const barData = [
    { name: 'Receitas', value: totalIncome / 100, fill: 'oklch(0.627 0.194 149)' },
    { name: 'Despesas', value: totalExpenses / 100, fill: 'oklch(0.577 0.245 27.325)' },
  ]

  return (
    <div className="space-y-6">
      {/* Hero card */}
      <div className="from-primary/90 to-primary text-primary-foreground shadow-primary/20 relative overflow-hidden rounded-3xl bg-gradient-to-br p-6 shadow-xl md:p-8">
        <div className="absolute -top-16 -right-16 size-64 rounded-full bg-white/10" />
        <div className="absolute -top-8 -right-8 size-64 rounded-full bg-white/5" />
        <div className="relative">
          <p className="text-primary-foreground/70 text-sm font-medium">Ola, {userName}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight md:text-4xl">
            {formatCurrency(balance)}
          </h1>
          <p className="text-primary-foreground/60 mt-1 text-sm">Saldo do mes</p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-muted-foreground text-sm font-medium">Receitas</CardTitle>
              <div className="bg-success/10 flex size-9 items-center justify-center rounded-xl">
                <TrendingUp className="text-success size-4" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tracking-tight">{formatCurrency(totalIncome)}</p>
            <VariationBadge value={incomeVariation} />
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-muted-foreground text-sm font-medium">Despesas</CardTitle>
              <div className="bg-destructive/10 flex size-9 items-center justify-center rounded-xl">
                <TrendingDown className="text-destructive size-4" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tracking-tight">{formatCurrency(totalExpenses)}</p>
            <VariationBadge value={expenseVariation} />
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-muted-foreground text-sm font-medium">
                Transacoes
              </CardTitle>
              <div className="bg-primary/10 flex size-9 items-center justify-center rounded-xl">
                <ArrowLeftRight className="text-primary size-4" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tracking-tight">{transactionCount}</p>
            <span className="text-muted-foreground text-xs">neste mes</span>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-muted-foreground text-sm font-medium">Contas</CardTitle>
              <div className="bg-accent flex size-9 items-center justify-center rounded-xl">
                <Wallet className="text-accent-foreground size-4" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tracking-tight">{balanceByAccount.length}</p>
            <span className="text-muted-foreground text-xs">ativas</span>
          </CardContent>
        </Card>
      </div>

      {/* Charts row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Bar chart - Income vs Expenses */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-muted-foreground text-sm font-medium">
              Receitas x Despesas
            </CardTitle>
          </CardHeader>
          <CardContent>
            {barData.some((d) => d.value > 0) ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={barData} layout="vertical" barCategoryGap="30%">
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={80}
                    tick={{ fontSize: 13 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(value) => formatCurrency(Math.round(Number(value) * 100))}
                    contentStyle={{
                      borderRadius: '12px',
                      border: 'none',
                      boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                    }}
                  />
                  <Bar dataKey="value" radius={[0, 8, 8, 0]}>
                    {barData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-muted-foreground flex h-[220px] items-center justify-center text-sm">
                Sem dados no periodo
              </div>
            )}
          </CardContent>
        </Card>

        {/* Donut chart - Expenses by category */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-muted-foreground text-sm font-medium">
              Gastos por Categoria
            </CardTitle>
          </CardHeader>
          <CardContent>
            {expensesByCategory.length > 0 ? (
              <div className="flex items-center gap-6">
                <ResponsiveContainer width={160} height={160}>
                  <PieChart>
                    <Pie
                      data={expensesByCategory}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={70}
                      dataKey="value"
                      stroke="none"
                    >
                      {expensesByCategory.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-1 flex-col gap-2">
                  {expensesByCategory.slice(0, 5).map((cat) => (
                    <div key={cat.name} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span
                          className="size-2.5 rounded-full"
                          style={{ backgroundColor: cat.color }}
                        />
                        <span className="text-muted-foreground">{cat.name}</span>
                      </div>
                      <span className="font-medium">{formatCurrency(cat.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-muted-foreground flex h-[160px] items-center justify-center text-sm">
                Sem despesas no periodo
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bottom row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Balance by account */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-muted-foreground text-sm font-medium">
              Saldo por Conta
            </CardTitle>
          </CardHeader>
          <CardContent>
            {balanceByAccount.length > 0 ? (
              <div className="space-y-3">
                {balanceByAccount.map((acc) => (
                  <div key={acc.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="size-3 rounded-full"
                        style={{ backgroundColor: acc.color }}
                      />
                      <span className="text-sm font-medium">{acc.name}</span>
                    </div>
                    <span
                      className={cn(
                        'text-sm font-semibold',
                        acc.balance >= 0 ? 'text-foreground' : 'text-destructive',
                      )}
                    >
                      {formatCurrency(acc.balance)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">Nenhuma conta cadastrada</p>
            )}
          </CardContent>
        </Card>

        {/* Recent transactions */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-muted-foreground text-sm font-medium">
              Ultimas Transacoes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentTransactions.length > 0 ? (
              <div className="space-y-3">
                {recentTransactions.map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          'flex size-9 items-center justify-center rounded-xl',
                          tx.type === 'INCOME' && 'bg-success/10',
                          tx.type === 'EXPENSE' && 'bg-destructive/10',
                          tx.type === 'TRANSFER' && 'bg-muted',
                        )}
                      >
                        {tx.type === 'INCOME' ? (
                          <TrendingUp className="text-success size-4" />
                        ) : tx.type === 'EXPENSE' ? (
                          <TrendingDown className="text-destructive size-4" />
                        ) : (
                          <ArrowLeftRight className="text-muted-foreground size-4" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{tx.description}</p>
                        <p className="text-muted-foreground text-xs">
                          {tx.account.name} &middot; {formatDate(tx.date)}
                        </p>
                      </div>
                    </div>
                    <span
                      className={cn(
                        'text-sm font-semibold',
                        tx.type === 'INCOME' && 'text-success',
                        tx.type === 'EXPENSE' && 'text-destructive',
                        tx.type === 'TRANSFER' && 'text-muted-foreground',
                      )}
                    >
                      {tx.type === 'EXPENSE' ? '- ' : tx.type === 'INCOME' ? '+ ' : ''}
                      {formatCurrency(tx.amount)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">Nenhuma transacao registrada</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

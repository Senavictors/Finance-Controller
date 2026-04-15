'use client'

import { formatCurrency, formatDate } from '@/lib/format'
import { TrendingDown, TrendingUp, ArrowLeftRight, ArrowUpRight } from 'lucide-react'
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
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium',
        isPositive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700',
      )}
    >
      {isPositive ? '+' : ''}
      {value}%
    </span>
  )
}

function CardAction() {
  return (
    <button className="flex size-8 items-center justify-center rounded-full bg-white shadow-sm transition-colors hover:bg-gray-50">
      <ArrowUpRight className="size-4 text-gray-400" />
    </button>
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
    { name: 'Receitas', value: totalIncome / 100, fill: '#22c55e' },
    { name: 'Despesas', value: totalExpenses / 100, fill: '#ef4444' },
  ]

  return (
    <div className="space-y-6">
      {/* Top row: Hero (4 cols) + Analytics (8 cols) */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Hero / Welcome card */}
        <div className="relative overflow-hidden rounded-[2rem] border border-white/50 bg-gradient-to-b from-white to-gray-100 p-8 shadow-sm lg:col-span-5">
          <div className="bg-primary/10 absolute -top-10 -right-10 size-48 rounded-full blur-3xl" />
          <div className="bg-accent/20 absolute -bottom-10 -left-10 size-48 rounded-full blur-3xl" />

          <div className="relative flex h-full flex-col justify-between">
            <div>
              <h1 className="text-3xl leading-[1.1] font-medium tracking-tight text-gray-900 lg:text-4xl">
                Ola, {userName}.
                <br />
                <span className="text-gray-400">Seu resumo financeiro.</span>
              </h1>
            </div>

            {/* Mini bar chart (CSS only, Apex-style) */}
            <div className="my-8 flex items-end justify-between gap-1.5 px-2">
              {['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun'].map((month, i) => {
                const heights = [32, 48, 40, 56, 44, 0]
                const isActive = i === 5
                return (
                  <div key={month} className="flex flex-col items-center gap-2">
                    {isActive ? (
                      <>
                        <div className="relative">
                          <div className="bg-primary/50 absolute -top-2 left-1/2 h-1 w-8 -translate-x-1/2 rounded-full" />
                          <div className="bg-primary shadow-primary/25 flex size-12 items-center justify-center rounded-2xl shadow-lg">
                            <div className="mx-auto h-1 w-8 rounded-full bg-white/60" />
                          </div>
                        </div>
                        <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-gray-900 shadow-sm">
                          {month}
                        </span>
                      </>
                    ) : (
                      <>
                        <div
                          className="w-10 rounded-t-xl border-t border-white bg-gray-200 transition-colors hover:bg-gray-300"
                          style={{ height: `${heights[i]}px` }}
                        />
                        <span className="text-xs text-gray-400">{month}</span>
                      </>
                    )}
                  </div>
                )
              })}
            </div>

            <div>
              <p className="mb-1 text-base text-gray-500">Saldo do mes</p>
              <div className="flex items-baseline gap-3">
                <span className="text-2xl font-semibold tracking-tight text-gray-900">
                  {formatCurrency(balance)}
                </span>
                <VariationBadge
                  value={
                    incomeVariation !== 0
                      ? Math.round((incomeVariation - expenseVariation) * 10) / 10
                      : 0
                  }
                />
              </div>
              <p className="mt-1 text-xs text-gray-400">vs. mes anterior</p>
            </div>
          </div>
        </div>

        {/* Stats + Chart card (Apex gray card style) */}
        <div className="relative rounded-[2rem] border border-white/50 bg-[#EAEAEA] p-8 shadow-sm lg:col-span-7">
          <div className="absolute top-6 right-6">
            <CardAction />
          </div>

          {/* Income & Expenses */}
          <div className="mb-6 grid gap-6 sm:grid-cols-2">
            <div>
              <h3 className="text-base font-medium text-gray-500">Receitas</h3>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-semibold tracking-tight text-gray-900">
                  {formatCurrency(totalIncome)}
                </span>
              </div>
              <VariationBadge value={incomeVariation} />
            </div>
            <div>
              <h3 className="text-base font-medium text-gray-500">Despesas</h3>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-semibold tracking-tight text-gray-900">
                  {formatCurrency(totalExpenses)}
                </span>
              </div>
              <VariationBadge value={expenseVariation} />
            </div>
          </div>

          <div className="my-6 h-px w-full bg-gray-300" />

          {/* Bar chart */}
          <div>
            <h3 className="mb-4 text-base font-medium text-gray-500">Comparativo</h3>
            {barData.some((d) => d.value > 0) ? (
              <ResponsiveContainer width="100%" height={140}>
                <BarChart data={barData} layout="vertical" barCategoryGap="35%">
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={75}
                    tick={{ fontSize: 13, fill: '#6b7280' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(value) => formatCurrency(Math.round(Number(value) * 100))}
                    contentStyle={{
                      borderRadius: '16px',
                      border: 'none',
                      boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
                      fontSize: '13px',
                    }}
                  />
                  <Bar dataKey="value" radius={[0, 12, 12, 0]}>
                    {barData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[140px] items-center justify-center text-sm text-gray-400">
                Sem dados neste periodo
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Middle row: Expenses by category (8 cols) + Accounts (4 cols) */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Expenses donut */}
        <div className="relative rounded-[2rem] border border-white/50 bg-gradient-to-br from-white to-gray-50 p-8 shadow-sm lg:col-span-8">
          <div className="absolute top-6 right-6">
            <CardAction />
          </div>
          <h3 className="mb-6 text-base font-medium text-gray-500">Gastos por Categoria</h3>

          {expensesByCategory.length > 0 ? (
            <div className="flex flex-col items-center gap-8 sm:flex-row">
              <ResponsiveContainer width={180} height={180}>
                <PieChart>
                  <Pie
                    data={expensesByCategory}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={80}
                    dataKey="value"
                    stroke="none"
                    paddingAngle={2}
                  >
                    {expensesByCategory.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-1 flex-col gap-3">
                {expensesByCategory.slice(0, 6).map((cat) => (
                  <div key={cat.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="size-3 rounded-full"
                        style={{ backgroundColor: cat.color }}
                      />
                      <span className="text-sm text-gray-600">{cat.name}</span>
                    </div>
                    <span className="text-sm font-semibold text-gray-900">
                      {formatCurrency(cat.value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex h-[180px] items-center justify-center text-sm text-gray-400">
              Sem despesas neste periodo
            </div>
          )}
        </div>

        {/* Accounts balance — stacked cards */}
        <div className="flex flex-col gap-4 lg:col-span-4">
          {/* Highlight card — accent color */}
          <div className="bg-accent relative overflow-hidden rounded-[2rem] p-6 shadow-sm">
            <div className="border-foreground/5 absolute -top-6 -right-6 size-32 rounded-full border" />
            <div className="border-foreground/5 absolute -top-2 -right-2 size-32 rounded-full border" />
            <div className="relative">
              <p className="text-accent-foreground/70 text-sm font-medium">Transacoes</p>
              <p className="text-accent-foreground mt-2 text-3xl font-medium tracking-tight">
                {transactionCount}
              </p>
              <p className="text-accent-foreground/50 mt-1 text-sm">registradas neste mes</p>
            </div>
          </div>

          {/* Account balances */}
          <div className="rounded-[2rem] border border-white/50 bg-[#F2F2F2] p-6 shadow-sm">
            <div className="mb-4 flex items-start justify-between">
              <span className="text-base font-medium text-gray-600">Contas</span>
              <CardAction />
            </div>
            {balanceByAccount.length > 0 ? (
              <div className="space-y-3">
                {balanceByAccount.map((acc) => (
                  <div key={acc.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="size-3 rounded-full"
                        style={{ backgroundColor: acc.color }}
                      />
                      <span className="text-sm font-medium text-gray-700">{acc.name}</span>
                    </div>
                    <span
                      className={cn(
                        'text-sm font-semibold',
                        acc.balance >= 0 ? 'text-gray-900' : 'text-red-600',
                      )}
                    >
                      {formatCurrency(acc.balance)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">Nenhuma conta</p>
            )}
          </div>

          {/* Dark card — total balance */}
          <div className="relative -mt-2 overflow-hidden rounded-[2rem] bg-gray-900 p-6 text-white shadow-2xl">
            <div className="absolute top-1/2 right-1/4 size-32 -translate-y-1/2 rounded-full border border-white/10" />
            <div className="absolute top-1/2 right-[20%] size-32 -translate-y-1/2 rounded-full border border-white/10" />
            <div className="relative">
              <p className="text-sm font-medium text-gray-400">Patrimonio</p>
              <p className="mt-3 text-2xl font-medium tracking-tight text-white">
                {formatCurrency(balanceByAccount.reduce((sum, a) => sum + a.balance, 0))}
              </p>
              <p className="mt-1 text-sm text-gray-500">saldo total de todas as contas</p>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom row: Recent transactions */}
      <div className="rounded-[2rem] border border-white/50 bg-gradient-to-br from-white to-[#F6F6F6] p-8 shadow-sm">
        <div className="mb-6 flex items-center justify-between">
          <h3 className="text-base font-medium text-gray-500">Ultimas Transacoes</h3>
          <CardAction />
        </div>

        {recentTransactions.length > 0 ? (
          <div className="divide-y divide-gray-100">
            {recentTransactions.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between py-3.5">
                <div className="flex items-center gap-4">
                  <div
                    className={cn(
                      'flex size-10 items-center justify-center rounded-xl',
                      tx.type === 'INCOME' && 'bg-emerald-100',
                      tx.type === 'EXPENSE' && 'bg-red-100',
                      tx.type === 'TRANSFER' && 'bg-gray-100',
                    )}
                  >
                    {tx.type === 'INCOME' ? (
                      <TrendingUp className="size-4 text-emerald-600" />
                    ) : tx.type === 'EXPENSE' ? (
                      <TrendingDown className="size-4 text-red-600" />
                    ) : (
                      <ArrowLeftRight className="size-4 text-gray-500" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{tx.description}</p>
                    <p className="text-xs text-gray-400">
                      {tx.account.name} &middot; {formatDate(tx.date)}
                    </p>
                  </div>
                </div>
                <span
                  className={cn(
                    'text-sm font-semibold',
                    tx.type === 'INCOME' && 'text-emerald-600',
                    tx.type === 'EXPENSE' && 'text-red-600',
                    tx.type === 'TRANSFER' && 'text-gray-500',
                  )}
                >
                  {tx.type === 'EXPENSE' ? '- ' : tx.type === 'INCOME' ? '+ ' : ''}
                  {formatCurrency(tx.amount)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-gray-400">Nenhuma transacao registrada</p>
        )}
      </div>
    </div>
  )
}

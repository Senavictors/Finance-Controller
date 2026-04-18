export type ResolvedMonthPeriod = {
  year: number
  month: number
  monthKey: string
  from: Date
  to: Date
  prevFrom: Date
  prevTo: Date
}

export type MonthlyAnalyticsSummary = {
  period: ResolvedMonthPeriod
  totalIncome: number
  totalExpenses: number
  balance: number
  incomeVariation: number
  expenseVariation: number
  transactionCount: number
  balanceByAccount: {
    id: string
    name: string
    color: string | null
    icon: string | null
    type: string
    balance: number
  }[]
  expensesByCategory: {
    id: string
    name: string
    color: string | null
    icon: string | null
    total: number
  }[]
  recentTransactions: {
    id: string
    description: string
    amount: number
    type: string
    date: Date
    account: { name: string; color: string | null; icon: string | null }
    category: { name: string; color: string | null; icon: string | null } | null
  }[]
}

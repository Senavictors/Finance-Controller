export type DashboardData = {
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
  goals: {
    id: string
    name: string
    metric: string
    status: string
    progressPercent: number
    actualAmount: number
    targetAmount: number
  }[]
}

export type WidgetDefinition = {
  type: string
  label: string
  description: string
  defaultW: number
  defaultH: number
  minW: number
  minH: number
}

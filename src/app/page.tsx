import Link from 'next/link'
import { TrendingUp, ArrowRight } from 'lucide-react'

export default function Home() {
  return (
    <div className="bg-background flex min-h-screen flex-col items-center justify-center px-4">
      <div className="flex flex-col items-center gap-6 text-center">
        <div className="bg-primary shadow-primary/25 flex size-16 items-center justify-center rounded-2xl shadow-xl">
          <TrendingUp className="text-primary-foreground size-7" />
        </div>
        <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">Finance Controller</h1>
        <p className="text-muted-foreground max-w-md text-lg">
          Gerencie suas financas pessoais com controle total. Acompanhe receitas, despesas e
          investimentos em um so lugar.
        </p>
        <div className="flex gap-3">
          <Link
            href="/register"
            className="bg-primary text-primary-foreground shadow-primary/25 inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl"
          >
            Comecar agora
            <ArrowRight className="size-4" />
          </Link>
          <Link
            href="/login"
            className="border-border bg-card inline-flex items-center rounded-full border px-6 py-3 text-sm font-medium transition-all hover:-translate-y-0.5 hover:shadow-md"
          >
            Entrar
          </Link>
        </div>
      </div>
    </div>
  )
}

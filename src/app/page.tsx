import Link from 'next/link'
import {
  TrendingUp,
  ArrowRight,
  BarChart3,
  Wallet,
  RefreshCw,
  LayoutGrid,
  Shield,
  Tag,
} from 'lucide-react'
import { ThemeToggle } from '@/components/theme/theme-toggle'

const features = [
  {
    icon: BarChart3,
    title: 'Dashboard Customizavel',
    description: 'Arraste e redimensione widgets. Gráficos de receitas, despesas e categorias.',
  },
  {
    icon: Wallet,
    title: 'Multi-contas',
    description: 'Gerencie contas correntes, carteiras, cartões e investimentos em um só lugar.',
  },
  {
    icon: Tag,
    title: 'Categorias Hierarquicas',
    description: 'Organize transações com categorias e subcategorias customizaveis.',
  },
  {
    icon: RefreshCw,
    title: 'Recorrencias',
    description: 'Automatize salário, aluguel e assinaturas com regras recorrentes.',
  },
  {
    icon: LayoutGrid,
    title: 'Transferencias',
    description: 'Mova dinheiro entre contas com transações atomicas vinculadas.',
  },
  {
    icon: Shield,
    title: 'Autenticacao Segura',
    description: 'Sessões server-side com bcrypt, cookies HttpOnly e rate limiting.',
  },
]

const techStack = [
  'Next.js 16',
  'TypeScript',
  'Tailwind CSS v4',
  'shadcn/ui',
  'Prisma 7',
  'PostgreSQL',
  'Recharts',
  'Zod',
]

export default function Home() {
  return (
    <div className="bg-background min-h-screen">
      <div className="absolute top-4 right-4 z-10">
        <ThemeToggle />
      </div>

      {/* Hero */}
      <section className="flex flex-col items-center justify-center px-4 pt-24 pb-20 text-center">
        <div className="bg-primary shadow-primary/25 flex size-16 items-center justify-center rounded-2xl shadow-xl">
          <TrendingUp className="text-primary-foreground size-7" />
        </div>
        <h1 className="mt-6 text-4xl font-semibold tracking-tight md:text-5xl lg:text-6xl">
          Finance Controller
        </h1>
        <p className="text-muted-foreground mt-4 max-w-lg text-lg">
          Sistema de gestao financeira pessoal. Acompanhe receitas, despesas e investimentos com
          dashboard customizavel e transações recorrentes.
        </p>
        <div className="mt-8 flex gap-3">
          <Link
            href="/register"
            className="bg-primary text-primary-foreground shadow-primary/25 inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-sm font-semibold shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl"
          >
            Comecar agora
            <ArrowRight className="size-4" />
          </Link>
          <Link
            href="/login"
            className="border-border bg-card inline-flex items-center rounded-full border px-7 py-3.5 text-sm font-medium transition-all hover:-translate-y-0.5 hover:shadow-md"
          >
            Entrar
          </Link>
        </div>
        <p className="text-muted-foreground mt-4 text-xs">
          Demo: <span className="font-mono">demo@finance.com</span> /{' '}
          <span className="font-mono">demo1234</span>
        </p>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-5xl px-4 pb-20">
        <h2 className="mb-10 text-center text-2xl font-semibold tracking-tight">Funcionalidades</h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="border-border/60 from-card via-card to-muted/40 rounded-[1.5rem] border bg-gradient-to-b p-6 shadow-sm"
            >
              <div className="bg-primary/10 flex size-10 items-center justify-center rounded-xl">
                <feature.icon className="text-primary size-5" />
              </div>
              <h3 className="text-foreground mt-4 text-sm font-semibold tracking-tight">
                {feature.title}
              </h3>
              <p className="text-muted-foreground mt-1.5 text-sm">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Tech Stack */}
      <section className="mx-auto max-w-3xl px-4 pb-20">
        <h2 className="mb-6 text-center text-2xl font-semibold tracking-tight">Tech Stack</h2>
        <div className="flex flex-wrap justify-center gap-2">
          {techStack.map((tech) => (
            <span
              key={tech}
              className="border-border bg-card text-muted-foreground rounded-full border px-4 py-1.5 text-sm font-medium"
            >
              {tech}
            </span>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-border/50 border-t py-8 text-center">
        <p className="text-muted-foreground text-sm">
          Finance Controller &mdash; Projeto de portfolio por{' '}
          <a
            href="https://github.com/Senavictors"
            className="text-primary font-medium hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Senavictors
          </a>
        </p>
      </footer>
    </div>
  )
}

import { TrendingUp } from 'lucide-react'
import Link from 'next/link'
import { ThemeToggle } from '@/components/theme/theme-toggle'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background relative flex min-h-screen flex-col items-center justify-center px-4">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <Link href="/" className="mb-8 flex items-center gap-3">
        <div className="bg-primary shadow-primary/25 flex size-10 items-center justify-center rounded-xl shadow-lg">
          <TrendingUp className="text-primary-foreground size-5" />
        </div>
        <span className="text-xl font-semibold tracking-tight">Finance Controller</span>
      </Link>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  )
}

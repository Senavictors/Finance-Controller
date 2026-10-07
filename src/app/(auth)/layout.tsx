import { TrendingUp } from 'lucide-react'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-fc-ink text-fc-text relative flex min-h-dvh flex-col items-center justify-center px-4 py-8">
      <div className="mb-8 flex items-center gap-3">
        <div className="bg-fc-iris text-fc-text-on-accent shadow-fc-glow rounded-fc-md flex size-11 items-center justify-center">
          <TrendingUp className="size-5" aria-hidden="true" />
        </div>
        <span className="fc-text-h2 text-fc-text">Finance Controller</span>
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  )
}

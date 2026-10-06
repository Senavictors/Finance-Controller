import { redirect } from 'next/navigation'
import { validateSession } from '@/server/auth/session'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await validateSession()
  if (!session) redirect('/login')

  return <>{children}</>
}

import { redirect } from 'next/navigation'
import { prisma } from '@/server/db'
import { validateSession } from '@/server/auth'
import { AvatarSection } from './avatar-section'
import { ProfileForm } from './profile-form'
import { PasswordForm } from './password-form'
import { DeleteAccountCard } from './delete-account-card'

export default async function UserPage() {
  const session = await validateSession()
  if (!session) redirect('/login')

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, name: true, email: true, image: true },
  })

  if (!user) redirect('/login')

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sua conta</h1>
        <p className="mt-1 text-sm text-gray-500">
          Gerencie seu perfil, seguranca e dados pessoais
        </p>
      </div>

      <section className="rounded-[2rem] border border-white/50 bg-gradient-to-br from-white to-gray-50 p-8 shadow-sm">
        <h2 className="text-lg font-medium text-gray-900">Foto de perfil</h2>
        <p className="mt-1 text-sm text-gray-500">
          Aparece no menu superior e em areas de identificacao. Limite de 300KB.
        </p>
        <div className="mt-6">
          <AvatarSection
            initialImage={user.image}
            initialName={user.name ?? ''}
            initialEmail={user.email}
          />
        </div>
      </section>

      <section className="rounded-[2rem] border border-white/50 bg-gradient-to-br from-white to-gray-50 p-8 shadow-sm">
        <h2 className="text-lg font-medium text-gray-900">Perfil</h2>
        <p className="mt-1 text-sm text-gray-500">Nome e email usados para identificar sua conta</p>
        <div className="mt-6">
          <ProfileForm initialName={user.name ?? ''} initialEmail={user.email} />
        </div>
      </section>

      <section className="rounded-[2rem] border border-white/50 bg-gradient-to-br from-white to-gray-50 p-8 shadow-sm">
        <h2 className="text-lg font-medium text-gray-900">Senha</h2>
        <p className="mt-1 text-sm text-gray-500">
          Alterar a senha encerra sessoes ativas em outros dispositivos
        </p>
        <div className="mt-6">
          <PasswordForm />
        </div>
      </section>

      <section className="rounded-[2rem] border border-red-200/60 bg-gradient-to-br from-red-50/40 to-white p-8 shadow-sm">
        <h2 className="text-lg font-medium text-red-700">Zona de risco</h2>
        <p className="mt-1 text-sm text-red-600/80">
          Acoes irreversiveis. Leia com atencao antes de prosseguir.
        </p>
        <div className="mt-6">
          <DeleteAccountCard />
        </div>
      </section>
    </div>
  )
}

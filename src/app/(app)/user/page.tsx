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
        <p className="text-muted-foreground mt-1 text-sm">
          Gerencie seu perfil, seguranca e dados pessoais
        </p>
      </div>

      <section className="fc-panel p-8">
        <h2 className="text-foreground text-lg font-medium">Foto de perfil</h2>
        <p className="text-muted-foreground mt-1 text-sm">
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

      <section className="fc-panel p-8">
        <h2 className="text-foreground text-lg font-medium">Perfil</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Nome e email usados para identificar sua conta
        </p>
        <div className="mt-6">
          <ProfileForm initialName={user.name ?? ''} initialEmail={user.email} />
        </div>
      </section>

      <section className="fc-panel p-8">
        <h2 className="text-foreground text-lg font-medium">Senha</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Alterar a senha encerra sessoes ativas em outros dispositivos
        </p>
        <div className="mt-6">
          <PasswordForm />
        </div>
      </section>

      <section className="fc-panel-danger p-8">
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

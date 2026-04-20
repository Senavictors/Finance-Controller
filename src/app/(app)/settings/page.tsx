import { ResetDemoCard } from './reset-demo-card'

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Configuracoes</h1>

      <section className="rounded-[2rem] border border-white/50 bg-gradient-to-br from-white to-gray-50 p-8 shadow-sm">
        <h2 className="text-lg font-medium text-gray-900">Dados da conta</h2>
        <p className="mt-1 text-sm text-gray-500">Ferramentas de manutencao dos seus dados</p>
        <div className="mt-6">
          <ResetDemoCard />
        </div>
      </section>
    </div>
  )
}

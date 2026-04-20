import { ResetDemoCard } from './reset-demo-card'

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Configuracoes</h1>

      <section className="fc-panel p-8">
        <h2 className="text-foreground text-lg font-medium">Dados da conta</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Ferramentas de manutencao dos seus dados
        </p>
        <div className="mt-6">
          <ResetDemoCard />
        </div>
      </section>
    </div>
  )
}

import { afterEach, vi } from 'vitest'

// Fuso de negócio (RN-05). A config já define TZ antes de iniciar os workers;
// reafirmar aqui cobre execuções que ignorem a config (ex.: IDE/runner embutido).
process.env.TZ = 'America/Sao_Paulo'

// Relógio real por padrão: testes que precisam de tempo fixo usam `withFakeTime`/`fixedNow`
// (tests/helpers/clock.ts) e nunca vazam fake timers para o teste seguinte.
afterEach(() => {
  vi.useRealTimers()
})

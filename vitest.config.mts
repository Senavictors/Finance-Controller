import { defineConfig } from 'vitest/config'

// Fuso de negócio fixo para toda a suíte (RN-05): expõe código de domínio que dependa
// do fuso do runner. Definido aqui (herdado pelos workers) e reafirmado no setup.
process.env.TZ = 'America/Sao_Paulo'

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: 'node',
    globals: true,
    clearMocks: true,
    restoreMocks: true,
    include: [
      'src/**/*.test.ts',
      'tests/**/*.test.ts',
      'prisma/**/*.test.ts',
      'scripts/**/*.test.ts',
    ],
    setupFiles: ['tests/helpers/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/server/modules/**/domain/**', 'src/lib/**'],
      exclude: ['**/*.test.ts', '**/*.tsx', '**/index.ts'],
      skipFull: true,
      // Limite mínimo só para o domínio (ADR-016); o restante apenas reporta.
      thresholds: {
        'src/server/modules/**/domain/**': {
          lines: 80,
          branches: 80,
        },
      },
    },
  },
})

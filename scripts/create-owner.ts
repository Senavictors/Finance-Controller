/**
 * Cria o único usuário (dono) do Finance Controller, ou troca a senha dele.
 *
 *   npm run owner:create          # OWNER_EMAIL e OWNER_NAME do ambiente ou por prompt
 *   npm run owner:set-password    # equivale a --reset-password; encerra todas as sessões
 *
 * A senha é SEMPRE digitada em prompt sem eco: nunca por argumento, variável de ambiente ou arquivo.
 * Usa `DATABASE_URL` de `.env.local`/`.env`. Não é executado em testes: a lógica está em
 * `src/server/auth/owner.ts` (pura); este arquivo só faz I/O.
 */
import { config as loadEnv } from 'dotenv'
import readline from 'node:readline/promises'

import { hashPassword } from '../src/server/auth/password'
import {
  createOwner,
  parseOwnerCommand,
  resetOwnerPassword,
  type OwnerRepository,
} from '../src/server/auth/owner'

// dotenv não sobrescreve variáveis já definidas: `.env.local` primeiro, então vence `.env`.
loadEnv({ path: '.env.local', quiet: true })
loadEnv({ path: '.env', quiet: true })

async function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  try {
    return (await rl.question(question)).trim()
  } finally {
    rl.close()
  }
}

/** Lê uma linha sem eco (modo raw). Backspace apaga; Ctrl+C aborta. */
function askHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin
    process.stdout.write(question)
    stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf8')

    let buffer = ''
    const finish = (error?: Error) => {
      stdin.setRawMode(false)
      stdin.pause()
      stdin.removeListener('data', onData)
      process.stdout.write('\n')
      if (error) reject(error)
      else resolve(buffer)
    }

    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') return finish()
        if (char === '\u0003') return finish(new Error('Operação cancelada.'))
        if (char === '\u007f' || char === '\b') {
          buffer = Array.from(buffer).slice(0, -1).join('')
        } else if (char >= ' ') {
          buffer += char
        }
      }
    }

    stdin.on('data', onData)
  })
}

async function createRepository(): Promise<OwnerRepository> {
  // Importado sob demanda: `@/server/db` abre o adaptador com `DATABASE_URL` ao ser carregado.
  const { prisma } = await import('../src/server/db')

  return {
    countUsers: () => prisma.user.count(),
    async createUserWithSettings({ email, name, passwordHash }) {
      const user = await prisma.user.create({
        data: { email, name, password: passwordHash, settings: { create: {} } },
        select: { id: true },
      })
      return user
    },
    async findOnlyUser() {
      return prisma.user.findFirst({ select: { id: true, email: true } })
    },
    async replacePasswordAndRevokeAccess(userId, passwordHash) {
      await prisma.$transaction([
        prisma.user.update({ where: { id: userId }, data: { password: passwordHash } }),
        prisma.session.deleteMany({ where: { userId } }),
        prisma.loginAttempt.deleteMany({}),
      ])
    },
  }
}

async function main() {
  if (!process.stdin.isTTY) {
    console.error('Execute em um terminal interativo: a senha é digitada sem eco.')
    process.exit(1)
  }
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL não definida (.env.local ou .env).')
    process.exit(1)
  }

  const command = parseOwnerCommand(process.argv.slice(2))
  const repo = await createRepository()
  const deps = { repo, hashPassword }

  let result
  if (command === 'create') {
    const email = process.env.OWNER_EMAIL?.trim() || (await ask('E-mail do dono: '))
    const name = process.env.OWNER_NAME?.trim() || (await ask('Nome: '))
    const password = await askHidden('Senha (mín. 12 caracteres): ')
    const confirmation = await askHidden('Repita a senha: ')
    result = await createOwner(deps, { email, name, password, confirmation })
  } else {
    const password = await askHidden('Nova senha (mín. 12 caracteres): ')
    const confirmation = await askHidden('Repita a nova senha: ')
    result = await resetOwnerPassword(deps, { password, confirmation })
  }

  if (!result.ok) {
    for (const message of result.errors) console.error(message)
    process.exitCode = 1
    return
  }

  console.log(
    command === 'create'
      ? `Dono criado: ${result.email}`
      : `Senha de ${result.email} atualizada. Todas as sessões foram encerradas.`,
  )
}

main()
  .catch((error: unknown) => {
    // Nunca imprimir a senha: só a mensagem do erro.
    console.error(error instanceof Error ? error.message : 'Falha inesperada.')
    process.exitCode = 1
  })
  .finally(() => {
    // O pool do adaptador mantém o processo vivo; encerra explicitamente.
    process.exit(process.exitCode ?? 0)
  })

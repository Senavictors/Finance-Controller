// Lógica pura do script `scripts/create-owner.ts` (criação do único usuário). Sem Prisma nem I/O:
// o script injeta o repositório e o hash. A senha nunca vem por argumento de processo.

export const OWNER_PASSWORD_MIN = 12
export const OWNER_PASSWORD_MAX_BYTES = 72 // limite do bcrypt

export type OwnerCommand = 'create' | 'reset-password'

export type OwnerValidation = { ok: true } | { ok: false; errors: string[] }

export function parseOwnerCommand(args: readonly string[]): OwnerCommand {
  return args.includes('--reset-password') ? 'reset-password' : 'create'
}

export function validateOwnerPassword(password: string, confirmation: string): string[] {
  const errors: string[] = []
  if (password.length < OWNER_PASSWORD_MIN) {
    errors.push(`A senha precisa ter pelo menos ${OWNER_PASSWORD_MIN} caracteres.`)
  }
  if (new TextEncoder().encode(password).length > OWNER_PASSWORD_MAX_BYTES) {
    errors.push(`A senha pode ter no máximo ${OWNER_PASSWORD_MAX_BYTES} bytes (limite do bcrypt).`)
  }
  if (password !== confirmation) {
    errors.push('A confirmação da senha não confere.')
  }
  return errors
}

export function validateOwnerIdentity(input: { email: string; name: string }): string[] {
  const errors: string[] = []
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) {
    errors.push('Informe um e-mail válido.')
  }
  if (input.name.trim().length === 0) {
    errors.push('Informe o nome.')
  }
  return errors
}

export interface OwnerRepository {
  countUsers(): Promise<number>
  /** Cria o usuário e o `UserSettings` com os defaults, de forma atômica. */
  createUserWithSettings(data: {
    email: string
    name: string
    passwordHash: string
  }): Promise<{ id: string }>
  /** O único usuário, ou `null` se não houver. */
  findOnlyUser(): Promise<{ id: string; email: string } | null>
  /** Troca o hash, apaga TODAS as sessões do usuário e limpa `LoginAttempt` (transação). */
  replacePasswordAndRevokeAccess(userId: string, passwordHash: string): Promise<void>
}

export type OwnerDeps = {
  repo: OwnerRepository
  hashPassword: (plaintext: string) => Promise<string>
  /**
   * Gancho opcional após criar o dono (FC2-F1-07): o script injeta `ensureDefaultCategories`.
   * Mantém `auth` sem depender do módulo de categorias.
   */
  onOwnerCreated?: (userId: string) => Promise<{ created: number; existing: number }>
}

export type OwnerResult =
  | { ok: true; email: string; categories?: { created: number; existing: number } }
  | { ok: false; errors: string[] }

export async function createOwner(
  deps: OwnerDeps,
  input: { email: string; name: string; password: string; confirmation: string },
): Promise<OwnerResult> {
  const errors = [
    ...validateOwnerIdentity(input),
    ...validateOwnerPassword(input.password, input.confirmation),
  ]
  if (errors.length > 0) return { ok: false, errors }

  if ((await deps.repo.countUsers()) > 0) {
    return {
      ok: false,
      errors: [
        'Já existe um usuário cadastrado (o app é single-user). Para trocar a senha, use "npm run owner:set-password".',
      ],
    }
  }

  const email = input.email.trim().toLowerCase()
  const passwordHash = await deps.hashPassword(input.password)
  const owner = await deps.repo.createUserWithSettings({
    email,
    name: input.name.trim(),
    passwordHash,
  })
  if (!deps.onOwnerCreated) return { ok: true, email }

  try {
    const categories = await deps.onOwnerCreated(owner.id)
    return { ok: true, email, categories }
  } catch (error) {
    // O usuário já existe: não esconda o fato, e indique o reparo idempotente.
    const reason = error instanceof Error ? error.message : 'erro desconhecido'
    throw new Error(
      `Dono criado (${email}), mas as categorias padrão falharam: ${reason}. ` +
        'Rode "npm run seed:categories" para concluir.',
    )
  }
}

export async function resetOwnerPassword(
  deps: OwnerDeps,
  input: { password: string; confirmation: string },
): Promise<OwnerResult> {
  const errors = validateOwnerPassword(input.password, input.confirmation)
  if (errors.length > 0) return { ok: false, errors }

  const owner = await deps.repo.findOnlyUser()
  if (!owner) {
    return {
      ok: false,
      errors: ['Nenhum usuário cadastrado. Crie o dono com "npm run owner:create".'],
    }
  }

  const passwordHash = await deps.hashPassword(input.password)
  await deps.repo.replacePasswordAndRevokeAccess(owner.id, passwordHash)
  return { ok: true, email: owner.email }
}

import { z } from 'zod'

export const loginSchema = z.object({
  email: z
    .string({ error: 'Informe o e-mail' })
    .trim()
    .toLowerCase()
    .pipe(z.email('E-mail inválido')),
  // Teto defensivo (bcrypt só considera 72 bytes); evita enviar entradas gigantes ao hash.
  password: z
    .string({ error: 'Informe a senha' })
    .min(1, 'Informe a senha')
    .max(200, 'Senha muito longa'),
})

export type LoginInput = z.infer<typeof loginSchema>

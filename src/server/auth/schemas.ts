import { z } from 'zod'

export const registerSchema = z
  .object({
    name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres').max(100),
    email: z.string().email('Email invalido').max(255),
    password: z
      .string()
      .min(8, 'Senha deve ter pelo menos 8 caracteres')
      .max(72, 'Senha deve ter no maximo 72 caracteres'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Senhas nao conferem',
    path: ['confirmPassword'],
  })

export const loginSchema = z.object({
  email: z.string().email('Email invalido'),
  password: z.string().min(1, 'Senha obrigatoria'),
})

const MAX_AVATAR_DATA_URL = 400_000

const avatarSchema = z
  .string()
  .max(MAX_AVATAR_DATA_URL, 'Imagem muito grande (limite ~300KB)')
  .regex(
    /^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/,
    'Formato de imagem nao suportado',
  )

export const updateProfileSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres').max(100),
  email: z.string().email('Email invalido').max(255),
  image: avatarSchema.nullable().optional(),
})

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Senha atual obrigatoria'),
    newPassword: z
      .string()
      .min(8, 'Nova senha deve ter pelo menos 8 caracteres')
      .max(72, 'Nova senha deve ter no maximo 72 caracteres'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Senhas nao conferem',
    path: ['confirmPassword'],
  })

export const deleteAccountSchema = z.object({
  password: z.string().min(1, 'Senha obrigatoria'),
  confirmation: z.string().refine((v) => v === 'EXCLUIR', {
    message: 'Digite EXCLUIR para confirmar',
  }),
})

export type RegisterInput = z.infer<typeof registerSchema>
export type LoginInput = z.infer<typeof loginSchema>
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>

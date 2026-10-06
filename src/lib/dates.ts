import { z } from 'zod'

// Converte uma string YYYY-MM-DD em Date ancorada ao meio-dia UTC, evitando
// deslocamento de dia para quem envia datas puras em UTC-3 (Brasil).
// A validação é apenas de formato: datas inexistentes (ex.: 2026-02-30) são
// normalizadas pelo JS. Validação estrita fica para a FC2-F1-01.
export const localDateSchema = (message = 'Data inválida') =>
  z
    .string({ message })
    .regex(/^\d{4}-\d{2}-\d{2}$/, message)
    .transform((s) => new Date(`${s}T12:00:00.000Z`))

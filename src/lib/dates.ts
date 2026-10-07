import { z } from 'zod'

// Converte uma string YYYY-MM-DD em Date ancorada ao meio-dia UTC, evitando
// deslocamento de dia para quem envia datas puras em UTC-3 (Brasil).
// A validação é estrita (FC2-F1-01): datas inexistentes (ex.: 2026-02-30) são
// rejeitadas em vez de normalizadas pelo JS para o mês seguinte.
export const localDateSchema = (message = 'Data inválida') =>
  z
    .string({ message })
    .regex(/^\d{4}-\d{2}-\d{2}$/, message)
    .transform((s, ctx) => {
      const date = new Date(`${s}T12:00:00.000Z`)
      if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== s) {
        ctx.addIssue({ code: 'custom', message })
        return z.NEVER
      }
      return date
    })

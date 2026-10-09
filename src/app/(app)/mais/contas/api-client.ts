/**
 * Chamada fina às rotas `/api/accounts/**` (a tela não tem regra de negócio: manda o corpo,
 * mostra a resposta). Erros vêm em pt-BR no formato `{ error, code, details? }`.
 */
export type ApiResult =
  | { ok: true; data: Record<string, unknown> }
  | {
      ok: false
      status: number
      error: string
      code?: string
      details?: Record<string, string[] | undefined>
    }

export async function callApi(method: string, url: string, body?: unknown): Promise<ApiResult> {
  try {
    const response = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>
    if (response.ok) return { ok: true, data }
    return {
      ok: false,
      status: response.status,
      error: typeof data.error === 'string' ? data.error : 'Não foi possível concluir a ação.',
      code: typeof data.code === 'string' ? data.code : undefined,
      details: data.details as Record<string, string[] | undefined> | undefined,
    }
  } catch {
    return { ok: false, status: 0, error: 'Sem conexão. Tente novamente.' }
  }
}

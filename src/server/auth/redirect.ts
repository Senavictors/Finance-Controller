// Anti open redirect (RN-06): `callbackUrl` só aceita caminho relativo interno.

export const DEFAULT_CALLBACK_URL = '/hoje'

// Caracteres de controle (inclui \t \r \n, que os navegadores removem e transformam `/\t/x` em `//x`).
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/

export function safeCallbackUrl(
  value: string | null | undefined,
  fallback: string = DEFAULT_CALLBACK_URL,
): string {
  if (typeof value !== 'string' || value.length === 0) return fallback
  if (!/^\/(?!\/)/.test(value)) return fallback
  if (value.includes('\\') || CONTROL_CHARS.test(value)) return fallback

  // Confirmação final: resolvido contra uma origem fictícia, tem de continuar nela.
  try {
    const base = 'http://fc.invalid'
    if (new URL(value, base).origin !== base) return fallback
  } catch {
    return fallback
  }

  // Voltar para a própria tela de login criaria um laço.
  if (value === '/login' || value.startsWith('/login?') || value.startsWith('/login/')) {
    return fallback
  }

  return value
}

export class AuthError extends Error {
  constructor(message: string = 'Não autorizado') {
    super(message)
    this.name = 'AuthError'
  }
}

export type CategoryErrorCode =
  | 'CATEGORY_SYSTEM_LOCKED'
  | 'CATEGORY_NOT_FOUND'
  | 'CATEGORY_INVALID'
  | 'CATEGORY_MAX_DEPTH'

/** Erro de regra de negócio de categorias; a camada HTTP mapeia `code` para o status. */
export class CategoryError extends Error {
  readonly code: CategoryErrorCode

  constructor(code: CategoryErrorCode, message: string) {
    super(message)
    this.name = 'CategoryError'
    this.code = code
  }
}
